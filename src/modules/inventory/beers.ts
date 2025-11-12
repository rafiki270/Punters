import { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { httpError } from '../../core/http'
import { ChangeTopic } from '../../lib/events'

export const BeerCreateSchema = z.object({
  name: z.string().min(1),
  brewery: z.string().min(1),
  style: z.string().min(1),
  abv: z.number().optional(),
  ibu: z.number().int().optional(),
  description: z.string().optional(),
  colorHex: z.string().optional(),
  tags: z.string().optional(),
  badgeAssetId: z.number().int().nullable().optional(),
  isGuest: z.boolean().optional(),
  glutenFree: z.boolean().optional(),
  vegan: z.boolean().optional(),
  alcoholFree: z.boolean().optional(),
  prefillPrices: z.boolean().optional(),
})

export const BeerUpdateSchema = BeerCreateSchema.partial()

export const BeerPriceUpsertSchema = z.object({
  prices: z.array(z.object({
    serveSizeId: z.number().int(),
    amountMinor: z.number().int().nonnegative(),
    currency: z.string(),
  })),
})

export type BeerCreateInput = z.infer<typeof BeerCreateSchema>
export type BeerUpdateInput = z.infer<typeof BeerUpdateSchema>
export type BeerPriceUpsertInput = z.infer<typeof BeerPriceUpsertSchema>

export type PrefillBeerPrices = (opts: { beerId: number; isGuest: boolean }) => Promise<void>

export function createBeersService({
  prisma,
  emitChange,
  prefillBeerPrices,
}: {
  prisma: PrismaClient
  emitChange: (topic: ChangeTopic) => void
  prefillBeerPrices: PrefillBeerPrices
}) {
  return {
    list: (filter: { active?: boolean } = {}) => {
      const where: Prisma.BeerWhereInput = {}
      if (typeof filter.active === 'boolean') where.active = filter.active
      return prisma.beer.findMany({ where, orderBy: { updatedAt: 'desc' } })
    },

    search: async (query: string) => {
      if (!query) return []
      return prisma.beer.findMany({
        where: {
          OR: [
            { name: { contains: query } },
            { brewery: { contains: query } },
            { style: { contains: query } },
          ],
        },
        take: 20,
        orderBy: { updatedAt: 'desc' },
      })
    },

    async get(id: number) {
      const beer = await prisma.beer.findUnique({ where: { id }, include: { prices: true } })
      if (!beer) throw httpError(404, 'Not found')
      return beer
    },

    async create(input: BeerCreateInput) {
      const { prefillPrices, ...rest } = input
      const beer = await prisma.beer.create({
        data: {
          ...rest,
          isGuest: !!input.isGuest,
          glutenFree: !!input.glutenFree,
          vegan: !!input.vegan,
          alcoholFree: !!input.alcoholFree,
        },
      })
      if (prefillPrices !== false) {
        await prefillBeerPrices({ beerId: beer.id, isGuest: !!beer.isGuest })
      }
      emitChange('beers')
      return beer
    },

    async update(id: number, data: BeerUpdateInput) {
      const prev = await prisma.beer.findUnique({ where: { id }, select: { badgeAssetId: true } })
      if (!prev) throw httpError(404, 'Not found')
      const updated = await prisma.beer.update({ where: { id }, data })
      await maybeCleanupBadge(prisma, prev.badgeAssetId, updated.badgeAssetId)
      emitChange('beers')
      return updated
    },

    async softDelete(id: number) {
      try {
        const updated = await prisma.beer.update({ where: { id }, data: { active: false } })
        emitChange('beers')
        return updated
      } catch {
        throw httpError(404, 'Not found')
      }
    },

    async listPrices(id: number) {
      const beer = await prisma.beer.findUnique({ where: { id } })
      if (!beer) throw httpError(404, 'Not found')
      return prisma.price.findMany({ where: { beerId: id }, include: { size: true } })
    },

    async upsertPrices(id: number, payload: BeerPriceUpsertInput) {
      const beer = await prisma.beer.findUnique({ where: { id } })
      if (!beer) throw httpError(404, 'Not found')
      await Promise.all(
        payload.prices.map((p) =>
          prisma.price.upsert({
            where: { beerId_serveSizeId: { beerId: id, serveSizeId: p.serveSizeId } },
            update: { amountMinor: p.amountMinor, currency: p.currency },
            create: { beerId: id, serveSizeId: p.serveSizeId, amountMinor: p.amountMinor, currency: p.currency },
          })
        )
      )
      emitChange('beers')
      return { ok: true }
    },
  }
}

async function maybeCleanupBadge(prisma: PrismaClient, previousId?: number | null, nextId?: number | null) {
  if (!previousId || previousId === nextId) return
  const usedByBeer = await prisma.beer.count({ where: { badgeAssetId: previousId } })
  const usedInSettings = await prisma.globalSettings.count({
    where: { OR: [{ logoAssetId: previousId }, { backgroundAssetId: previousId }] },
  })
  if (usedByBeer === 0 && usedInSettings === 0) {
    await prisma.asset.delete({ where: { id: previousId } }).catch(() => {})
  }
}
