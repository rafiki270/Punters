import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { httpError } from '../../core/http'
import { ChangeTopic } from '../../lib/events'

export const DrinkCategoryCreateSchema = z.object({
  name: z.string().min(1),
  displayOrder: z.number().int().optional(),
})

export const DrinkCategoryUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
})

export const DrinkCreateSchema = z.object({
  name: z.string().min(1),
  categoryId: z.number().int().optional(),
  categoryName: z.string().min(1).optional(),
  producer: z.string().optional(),
  style: z.string().optional(),
  abv: z.number().optional(),
  origin: z.string().optional(),
  description: z.string().optional(),
  active: z.boolean().optional(),
  disabled: z.boolean().optional(),
  logoAssetId: z.number().int().nullable().optional(),
})

export const DrinkUpdateSchema = DrinkCreateSchema.partial()

export const DrinkPriceUpsertSchema = z.object({
  prices: z.array(z.object({
    serveSizeId: z.number().int(),
    amountMinor: z.number().int().nonnegative(),
    currency: z.string(),
  })),
})

export function createDrinksService({ prisma, emitChange }: { prisma: PrismaClient; emitChange: (topic: ChangeTopic) => void }) {
  return {
    listCategories: () =>
      prisma.drinkCategory.findMany({ where: { active: true }, orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] }),

    async createCategory(data: z.infer<typeof DrinkCategoryCreateSchema>) {
      try {
        const created = await prisma.drinkCategory.create({ data: { name: data.name, displayOrder: data.displayOrder ?? 0 } })
        emitChange('drinks')
        return created
      } catch {
        throw httpError(400, 'Category may already exist')
      }
    },

    async updateCategory(id: number, data: z.infer<typeof DrinkCategoryUpdateSchema>) {
      try {
        const updated = await prisma.drinkCategory.update({ where: { id }, data })
        emitChange('drinks')
        return updated
      } catch {
        throw httpError(404, 'Not found')
      }
    },

    async reorderCategories(ids: number[]) {
      if (!ids.length) throw httpError(400, 'ids array required')
      let order = 1
      for (const id of ids) {
        await prisma.drinkCategory.update({ where: { id }, data: { displayOrder: order++ } }).catch(() => {})
      }
      emitChange('drinks')
      return { ok: true }
    },

    async deleteCategory(id: number) {
      const count = await prisma.drink.count({ where: { categoryId: id } })
      if (count > 0) throw httpError(400, 'Category not empty')
      try {
        await prisma.drinkCategory.delete({ where: { id } })
        emitChange('drinks')
        return { ok: true }
      } catch {
        throw httpError(404, 'Not found')
      }
    },

    listDrinks: (filter: { active?: boolean; disabled?: boolean; categoryId?: number; withPrices?: boolean } = {}) =>
      prisma.drink.findMany({
        where: {
          ...(typeof filter.active === 'boolean' ? { active: filter.active } : {}),
          ...(typeof filter.disabled === 'boolean' ? { disabled: filter.disabled } : {}),
          ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        include: filter.withPrices ? { prices: { include: { size: true } } } : undefined,
      }),

    async getDrink(id: number) {
      const drink = await prisma.drink.findUnique({ where: { id }, include: { prices: true } })
      if (!drink) throw httpError(404, 'Not found')
      return drink
    },

    async createDrink(data: z.infer<typeof DrinkCreateSchema>) {
      const categoryId = await ensureCategoryId(prisma, data.categoryId, data.categoryName)
      const created = await prisma.drink.create({
        data: {
          name: data.name,
          categoryId,
          producer: data.producer,
          style: data.style,
          abv: data.abv,
          origin: data.origin,
          description: data.description,
          active: data.active ?? true,
          disabled: data.disabled ?? false,
          logoAssetId: data.logoAssetId ?? null,
        },
      })
      emitChange('drinks')
      return created
    },

    async updateDrink(id: number, data: z.infer<typeof DrinkUpdateSchema>) {
      const { categoryId, categoryName, ...rest } = data
      const resolvedCategoryId = await maybeResolveCategoryId(prisma, categoryId, categoryName)
      try {
        const updated = await prisma.drink.update({
          where: { id },
          data: {
            ...rest,
            ...(resolvedCategoryId ? { categoryId: resolvedCategoryId } : {}),
          },
        })
        emitChange('drinks')
        return updated
      } catch {
        throw httpError(404, 'Not found')
      }
    },

    async softDeleteDrink(id: number) {
      try {
        await prisma.drink.update({ where: { id }, data: { active: false } })
        emitChange('drinks')
        return { ok: true }
      } catch {
        throw httpError(404, 'Not found')
      }
    },

    async listPrices(id: number) {
      const drink = await prisma.drink.findUnique({ where: { id } })
      if (!drink) throw httpError(404, 'Not found')
      return prisma.drinkPrice.findMany({ where: { drinkId: id }, include: { size: true } })
    },

    async upsertPrices(id: number, payload: z.infer<typeof DrinkPriceUpsertSchema>) {
      const drink = await prisma.drink.findUnique({ where: { id } })
      if (!drink) throw httpError(404, 'Not found')
      await Promise.all(
        payload.prices.map((p) =>
          prisma.drinkPrice.upsert({
            where: { drinkId_serveSizeId: { drinkId: id, serveSizeId: p.serveSizeId } },
            update: { amountMinor: p.amountMinor, currency: p.currency },
            create: { drinkId: id, serveSizeId: p.serveSizeId, amountMinor: p.amountMinor, currency: p.currency },
          })
        )
      )
      emitChange('drinks')
      return { ok: true }
    },
  }
}

async function ensureCategoryId(prisma: PrismaClient, categoryId?: number, categoryName?: string) {
  const resolved = await maybeResolveCategoryId(prisma, categoryId, categoryName)
  if (!resolved) throw httpError(400, 'categoryId or categoryName is required')
  return resolved
}

async function maybeResolveCategoryId(prisma: PrismaClient, categoryId?: number, categoryName?: string) {
  if (categoryId) return categoryId
  const name = (categoryName || '').trim()
  if (!name) return undefined
  const existing = await prisma.drinkCategory.findFirst({ where: { name } })
  if (existing) return existing.id
  const created = await prisma.drinkCategory.create({ data: { name } })
  return created.id
}
