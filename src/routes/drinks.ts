import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../auth'
import { emitChange } from '../events'
import { prisma } from '../db'
import {
  DrinkCategoryCreateSchema,
  DrinkCategoryUpdateSchema,
  DrinkCreateSchema,
  DrinkPriceUpsertSchema,
  DrinkUpdateSchema,
  createDrinksService,
} from '../modules/inventory/drinks'
import { parseQuery, route } from '../core/http'

export async function registerDrinkRoutes(app: FastifyInstance) {
  const drinks = createDrinksService({ prisma, emitChange })

  app.get('/api/drink-categories', route(async () => drinks.listCategories()))

  app.post('/api/drink-categories', { preHandler: requireAdmin }, route(async (req) => {
    const data = DrinkCategoryCreateSchema.parse((req as any).body ?? {})
    return drinks.createCategory(data)
  }))

  app.put('/api/drink-categories/:id', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    const data = DrinkCategoryUpdateSchema.parse((req as any).body ?? {})
    return drinks.updateCategory(id, data)
  }))

  const OrderSchema = z.object({ ids: z.array(z.number().int()).optional() })
  app.put('/api/drink-categories/order', { preHandler: requireAdmin }, route(async (req) => {
    const body = OrderSchema.parse((req as any).body ?? {})
    const ids = (body.ids || []).filter((id) => Number.isFinite(id))
    return drinks.reorderCategories(ids)
  }))

  app.delete('/api/drink-categories/:id', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    return drinks.deleteCategory(id)
  }))

  const DrinksQuery = z.object({
    active: z.string().optional(),
    categoryId: z.string().optional(),
    withPrices: z.string().optional(),
  })
  app.get('/api/drinks', route(async (req) => {
    const q = parseQuery(req, DrinksQuery)
    return drinks.listDrinks({
      active: q.active ? q.active === 'true' : undefined,
      categoryId: q.categoryId ? Number(q.categoryId) : undefined,
      withPrices: q.withPrices === 'true',
    })
  }))

  app.get('/api/drinks/:id', route(async (req) => {
    const id = Number((req.params as any).id)
    return drinks.getDrink(id)
  }))

  app.post('/api/drinks', { preHandler: requireAdmin }, route(async (req) => {
    const data = DrinkCreateSchema.parse((req as any).body ?? {})
    return drinks.createDrink(data)
  }))

  app.put('/api/drinks/:id', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    const data = DrinkUpdateSchema.parse((req as any).body ?? {})
    return drinks.updateDrink(id, data)
  }))

  app.delete('/api/drinks/:id', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    return drinks.softDeleteDrink(id)
  }))

  app.get('/api/drinks/:id/prices', route(async (req) => {
    const id = Number((req.params as any).id)
    return drinks.listPrices(id)
  }))

  app.put('/api/drinks/:id/prices', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    const payload = DrinkPriceUpsertSchema.parse((req as any).body ?? {})
    return drinks.upsertPrices(id, payload)
  }))
}
