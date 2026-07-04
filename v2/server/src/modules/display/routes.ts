import type { FastifyInstance } from 'fastify'
import {
  getTemplate,
  menuConfig,
  ADS_DEFAULTS,
  type DisplayFeed,
  type FeedItem,
  type FeedPage,
  type FeedSlotContent,
  type SlotConfig,
  type ItemKind,
  type DietaryFlags,
} from '@punters/shared'
import { prisma } from '../../core/prisma'
import { getSettings } from '../settings/routes'
import { assetUrlsById, toAssetWithUrls } from '../media/service'
import { httpError } from '../../core/errors'

type ItemRow = Awaited<ReturnType<typeof loadItems>>[number]

async function loadItems(where: Record<string, unknown>) {
  return prisma.item.findMany({
    where,
    include: {
      category: true,
      prices: { include: { size: true } },
      imageAsset: { include: { variants: true } },
      badgeAsset: { include: { variants: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}

function toFeedItem(item: ItemRow, tapNumber: number | null = null): FeedItem {
  const dietary: DietaryFlags = {
    vegan: item.vegan,
    vegetarian: item.vegetarian,
    glutenFree: item.glutenFree,
    dairyFree: item.dairyFree,
  }
  const sortedPrices = [...item.prices].sort(
    (a, b) => (a.size?.displayOrder ?? -1) - (b.size?.displayOrder ?? -1),
  )
  return {
    id: item.id,
    kind: item.kind as ItemKind,
    name: item.name,
    producer: item.producer,
    style: item.style,
    abv: item.abv,
    description: item.description,
    categoryId: item.categoryId,
    categoryName: item.category?.name ?? null,
    tapNumber,
    dietary,
    spicyLevel: item.spicyLevel,
    image: item.imageAsset ? toAssetWithUrls(item.imageAsset).urls : null,
    badge: item.badgeAsset ? toAssetWithUrls(item.badgeAsset).urls : null,
    prices: sortedPrices.map((p) => ({ amountMinor: p.amountMinor, sizeName: p.size?.name ?? null })),
  }
}

async function resolveMenuItems(config: SlotConfig): Promise<FeedItem[]> {
  const source = config.source ?? {}
  if (source.tapsOnly) {
    const taps = await prisma.tap.findMany({
      where: { status: 'on', itemId: { not: null } },
      orderBy: { number: 'asc' },
    })
    const ids = taps.map((t) => t.itemId!) // filtered non-null above
    const items = await loadItems({ id: { in: ids }, active: true })
    const byId = new Map(items.map((i) => [i.id, i]))
    return taps.flatMap((t) => {
      const item = byId.get(t.itemId!)
      return item ? [toFeedItem(item, t.number)] : []
    })
  }

  const where: Record<string, unknown> = { active: true }
  if (source.kinds?.length) where.kind = { in: source.kinds }
  if (source.categoryIds?.length) where.categoryId = { in: source.categoryIds }
  const items = await loadItems(where)
  // Category-grouped menus present in category display order.
  items.sort((a, b) => {
    const ca = a.category?.displayOrder ?? 0
    const cb = b.category?.displayOrder ?? 0
    if (ca !== cb) return ca - cb
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.name.localeCompare(b.name)
  })
  return items.map((i) => toFeedItem(i))
}

async function resolveAds(config: SlotConfig): Promise<FeedSlotContent> {
  const where: Record<string, unknown> = { purpose: 'media' }
  if (config.tag) where.tag = config.tag
  const assets = await prisma.asset.findMany({
    where,
    include: { variants: true },
    orderBy: { createdAt: 'asc' },
  })
  return {
    ads: assets.map((a) => {
      const withUrls = toAssetWithUrls(a)
      return { assetId: a.id, urls: withUrls.urls, width: a.width, height: a.height }
    }),
  }
}

async function resolvePage(page: {
  id: number
  name: string
  templateId: string
  durationSec: number
  config: string
}): Promise<FeedPage | null> {
  const template = getTemplate(page.templateId)
  if (!template) return null

  let config: Record<string, SlotConfig> = {}
  try {
    config = JSON.parse(page.config)
  } catch {
    // A malformed config falls back to template defaults rather than killing the feed.
  }

  const content: Record<string, FeedSlotContent> = {}
  for (const slot of template.slots) {
    const slotConfig = { ...slot.defaults, ...config[slot.id] } as SlotConfig
    switch (slot.kind) {
      case 'menu': {
        content[slot.id] = { items: await resolveMenuItems(menuConfig(slot, config)) }
        break
      }
      case 'ads': {
        content[slot.id] = await resolveAds({ ...ADS_DEFAULTS, ...slotConfig })
        break
      }
      case 'image': {
        content[slot.id] = { imageUrls: await assetUrlsById(slotConfig.assetId) }
        break
      }
      case 'featured': {
        if (slotConfig.itemId) {
          const rows = await loadItems({ id: slotConfig.itemId })
          content[slot.id] = { featured: rows[0] ? toFeedItem(rows[0]) : null }
        } else {
          content[slot.id] = { featured: null }
        }
        break
      }
      default:
        content[slot.id] = {}
    }
  }

  return {
    id: page.id,
    name: page.name,
    templateId: page.templateId,
    durationSec: page.durationSec,
    config,
    content,
  }
}

export async function displayRoutes(app: FastifyInstance) {
  app.get('/api/display/feed', async (req) => {
    const { key } = req.query as { key?: string }
    if (!key) throw httpError(400, 'screen key required')

    const screen = await prisma.screen.findUnique({ where: { key }, include: { zone: true } })
    if (!screen) throw httpError(404, 'unknown screen — re-pair the display')
    await prisma.screen.update({ where: { id: screen.id }, data: { lastSeenAt: new Date() } })

    const settings = await getSettings()
    const feedSettings = {
      venueName: settings.venueName,
      currency: settings.currency,
      locale: settings.locale,
      theme: settings.theme as 'dark' | 'light',
      logoUrls: await assetUrlsById(settings.logoAssetId),
      backgroundUrls: await assetUrlsById(settings.backgroundAssetId),
    }

    let pages: FeedPage[] = []
    if (screen.zone) {
      const pageRows = await prisma.page.findMany({
        where: { zoneId: screen.zone.id, active: true },
        orderBy: { sortOrder: 'asc' },
      })
      pages = (await Promise.all(pageRows.map(resolvePage))).filter((p): p is FeedPage => p !== null)
    }

    const feed: DisplayFeed = {
      serverNow: Date.now(),
      settings: feedSettings,
      screen: {
        id: screen.id,
        name: screen.name,
        zoneId: screen.zoneId,
        outputIndex: screen.outputIndex,
        pairCode: screen.zoneId ? null : screen.pairCode,
      },
      zone: screen.zone
        ? {
            id: screen.zone.id,
            name: screen.zone.name,
            rotationMode: screen.zone.rotationMode as 'zone' | 'screen',
            rotationSinceMs: screen.zone.rotationSince.getTime(),
          }
        : null,
      pages,
    }
    return feed
  })
}
