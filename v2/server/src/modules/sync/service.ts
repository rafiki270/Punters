import { mergeTheme, shouldApplySharedItem, type OrgTheme } from '@punters/shared'
import { prisma } from '../../core/prisma'
import { relay } from '../../core/relayClient'
import { emitChange } from '../../core/events'
import { getSettings } from '../settings/routes'

const POLL_MS = 20_000

async function resolveSizeId(sizeName: string | null): Promise<number | null> {
  if (!sizeName) return null
  const size = await prisma.serveSize.findFirst({ where: { name: { equals: sizeName } } })
  return size?.id ?? null // an unmatched size name is skipped rather than guessed at
}

async function resolveCategoryId(kind: string, categoryName: string | null): Promise<number | null> {
  if (!categoryName) return null
  const category = await prisma.category.upsert({
    where: { kind_name: { kind, name: categoryName } },
    update: {},
    create: { kind, name: categoryName },
  })
  return category.id
}

async function applyCatalogDelta(teamId: number, serviceToken: string, since: number) {
  const delta = await relay.catalog(serviceToken, teamId, since)
  let changed = false

  for (const incoming of delta.items) {
    const local = await prisma.item.findFirst({ where: { sharedItemId: incoming.id } })
    if (!shouldApplySharedItem(local ? { overridden: local.overridden, sharedUpdatedAt: local.sharedUpdatedAt?.toISOString() ?? null } : null, incoming)) {
      continue
    }
    changed = true
    const categoryId = await resolveCategoryId(incoming.kind, incoming.categoryName)
    const data = {
      kind: incoming.kind,
      name: incoming.name,
      producer: incoming.producer,
      style: incoming.style,
      abv: incoming.abv,
      description: incoming.description,
      categoryId,
      vegan: incoming.vegan,
      vegetarian: incoming.vegetarian,
      glutenFree: incoming.glutenFree,
      dairyFree: incoming.dairyFree,
      spicyLevel: incoming.spicyLevel,
      active: incoming.active,
      sharedItemId: incoming.id,
      sharedUpdatedAt: new Date(incoming.updatedAt),
    }

    const item = local
      ? await prisma.item.update({ where: { id: local.id }, data })
      : await prisma.item.create({ data })

    await prisma.price.deleteMany({ where: { itemId: item.id } })
    for (const p of incoming.prices) {
      const sizeId = await resolveSizeId(p.sizeName)
      if (p.sizeName && !sizeId) continue // no matching local size — skip rather than mis-price
      await prisma.price.create({ data: { itemId: item.id, sizeId, amountMinor: p.amountMinor } })
    }
  }

  await prisma.settings.update({ where: { id: 1 }, data: { catalogSyncedVersion: delta.version } })
  if (changed) emitChange('catalog')
}

async function applyTheme(teamId: number, serviceToken: string) {
  const remote = await relay.theme(serviceToken, teamId)
  const settings = await getSettings()
  const nextJson = JSON.stringify(remote.theme)
  if (settings.orgTheme !== nextJson) {
    await prisma.settings.update({ where: { id: 1 }, data: { orgTheme: nextJson } })
    emitChange('settings')
  }
}

/** Effective theme for rendering/admin display: org theme merged with this venue's overrides. */
export function resolveEffectiveTheme(settings: { orgTheme: string | null; themeOverrides: string | null }): OrgTheme {
  const org: OrgTheme = settings.orgTheme ? JSON.parse(settings.orgTheme) : {}
  const overrides: OrgTheme | null = settings.themeOverrides ? JSON.parse(settings.themeOverrides) : null
  return mergeTheme(org, overrides)
}

async function tick() {
  const settings = await getSettings()
  if (!settings.orgId || !settings.teamId || !settings.relayServiceToken) return // unbound venue — nothing to sync
  try {
    await applyTheme(settings.teamId, settings.relayServiceToken)
    await applyCatalogDelta(settings.teamId, settings.relayServiceToken, settings.catalogSyncedVersion)
  } catch (err) {
    // A relay blip shouldn't crash the venue server — local operation must survive it.
    console.error('[sync] relay poll failed:', (err as Error).message)
  }
}

export function startSync(): () => void {
  const timer = setInterval(tick, POLL_MS)
  tick() // don't wait a full interval on boot
  return () => clearInterval(timer)
}
