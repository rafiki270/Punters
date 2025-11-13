import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { httpError } from '../../core/http'
import { ChangeTopic } from '../../lib/events'

export const CocktailCreateSchema = z.object({
  name: z.string().min(1),
  ingredients: z.string().optional(),
  priceMinor: z.number().int().nonnegative(),
  imageAssetId: z.number().int().nullable().optional(),
  active: z.boolean().optional(),
})

export const CocktailUpdateSchema = CocktailCreateSchema.partial()

async function resolveCurrency(prisma: PrismaClient): Promise<string> {
  const settings = await prisma.globalSettings.findUnique({ where: { id: 1 }, select: { currency: true } })
  return settings?.currency || 'GBP'
}

export function createCocktailsService({ prisma, emitChange }: { prisma: PrismaClient; emitChange: (topic: ChangeTopic) => void }) {
  return {
    list(filter: { active?: boolean } = {}) {
      return prisma.cocktail.findMany({
        where: typeof filter.active === 'boolean' ? { active: filter.active } : {},
        orderBy: { name: 'asc' },
      })
    },

    async get(id: number) {
      const cocktail = await prisma.cocktail.findUnique({ where: { id } })
      if (!cocktail) throw httpError(404, 'Not found')
      return cocktail
    },

    async create(payload: z.infer<typeof CocktailCreateSchema>) {
      const data = CocktailCreateSchema.parse(payload)
      const currency = await resolveCurrency(prisma)
      const created = await prisma.cocktail.create({
        data: {
          name: data.name,
          ingredients: data.ingredients ?? null,
          priceMinor: data.priceMinor,
          currency,
          active: data.active ?? true,
          imageAssetId: data.imageAssetId ?? null,
        },
      })
      emitChange('cocktails')
      return created
    },

    async update(id: number, payload: z.infer<typeof CocktailUpdateSchema>) {
      const data = CocktailUpdateSchema.parse(payload)
      try {
        const updated = await prisma.cocktail.update({
          where: { id },
          data: {
            ...(data.name ? { name: data.name } : {}),
            ingredients: ('ingredients' in data) ? (data.ingredients ?? null) : undefined,
            priceMinor: typeof data.priceMinor === 'number' ? data.priceMinor : undefined,
            active: typeof data.active === 'boolean' ? data.active : undefined,
            imageAssetId: ('imageAssetId' in data) ? (data.imageAssetId ?? null) : undefined,
          },
        })
        emitChange('cocktails')
        return updated
      } catch {
        throw httpError(404, 'Not found')
      }
    },

    async softDelete(id: number) {
      try {
        const updated = await prisma.cocktail.update({ where: { id }, data: { active: false } })
        emitChange('cocktails')
        return updated
      } catch {
        throw httpError(404, 'Not found')
      }
    },
  }
}
