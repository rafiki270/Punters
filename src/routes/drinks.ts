import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { z } from 'zod'
import { requireAdmin } from '../auth'
import { emitChange } from '../events'

const DrinkCategoryCreate = z.object({ name: z.string().min(1), displayOrder: z.number().int().optional() })
const DrinkCategoryUpdate = z.object({ name: z.string().min(1).optional(), active: z.boolean().optional(), displayOrder: z.number().int().optional() })

const DrinkCreate = z.object({
  name: z.string().min(1),
  categoryId: z.number().int().optional(),
  categoryName: z.string().min(1).optional(),
  producer: z.string().optional(),
  style: z.string().optional(),
  abv: z.number().optional(),
  origin: z.string().optional(),
  description: z.string().optional(),
  active: z.boolean().optional()
})

const DrinkUpdate = DrinkCreate.partial()

const DrinkPriceUpsert = z.object({ prices: z.array(z.object({ serveSizeId: z.number().int(), amountMinor: z.number().int().nonnegative(), currency: z.string() })) })

export async function registerDrinkRoutes(app: FastifyInstance) {
  // Categories
  app.get('/api/drink-categories', async () => {
    return prisma.drinkCategory.findMany({ where: { active: true }, orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] })
  })

  app.post('/api/drink-categories', { preHandler: requireAdmin }, async (req, reply) => {
    const data = DrinkCategoryCreate.parse((req as any).body)
    try {
      const created = await prisma.drinkCategory.create({ data: { name: data.name, displayOrder: data.displayOrder ?? 0 } })
      emitChange('drinks')
      return created
    } catch (e) {
      return reply.code(400).send({ error: 'Category may already exist' })
    }
  })

  app.put('/api/drink-categories/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as any).id)
    const data = DrinkCategoryUpdate.parse((req as any).body)
    try {
      const updated = await prisma.drinkCategory.update({ where: { id }, data })
      emitChange('drinks')
      return updated
    } catch (e) {
      return reply.code(404).send({ error: 'Not found' })
    }
  })

  // Reorder categories by IDs array
  app.put('/api/drink-categories/order', { preHandler: requireAdmin }, async (req, reply) => {
    const body = (req as any).body as { ids?: number[] }
    const ids = Array.isArray(body?.ids) ? body!.ids!.map(Number).filter(Number.isFinite) : []
    if (!ids.length) return reply.code(400).send({ error: 'ids array required' })
    // Write displayOrder = index+1
    let i = 1
    for (const id of ids) {
      await prisma.drinkCategory.update({ where: { id }, data: { displayOrder: i++ } }).catch(()=>{})
    }
    emitChange('drinks')
    return { ok: true }
  })

  // Delete category if empty
  app.delete('/api/drink-categories/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as any).id)
    const count = await prisma.drink.count({ where: { categoryId: id } })
    if (count > 0) return reply.code(400).send({ error: 'Category not empty' })
    try {
      await prisma.drinkCategory.delete({ where: { id } })
      emitChange('drinks')
      return { ok: true }
    } catch {
      return reply.code(404).send({ error: 'Not found' })
    }
  })

  // Drinks
  app.get('/api/drinks', async (req) => {
    const q = (req as any).query || {}
    const where: any = {}
    if (q.active != null) where.active = q.active === 'true'
    if (q.categoryId != null) where.categoryId = Number(q.categoryId)
    return prisma.drink.findMany({ where, orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] })
  })

  app.get('/api/drinks/:id', async (req, reply) => {
    const id = Number((req.params as any).id)
    const drink = await prisma.drink.findUnique({ where: { id }, include: { prices: true } })
    if (!drink) return reply.code(404).send({ error: 'Not found' })
    return drink
  })

  app.post('/api/drinks', { preHandler: requireAdmin }, async (req, reply) => {
    const data = DrinkCreate.parse((req as any).body)
    // Resolve category
    let categoryId = data.categoryId ?? null
    if (!categoryId) {
      const name = (data.categoryName || '').trim()
      if (!name) return reply.code(400).send({ error: 'categoryId or categoryName is required' })
      const existing = await prisma.drinkCategory.findFirst({ where: { name } })
      if (existing) categoryId = existing.id
      else {
        const created = await prisma.drinkCategory.create({ data: { name } })
        categoryId = created.id
      }
    }
    const created = await prisma.drink.create({ data: { name: data.name, categoryId: categoryId as number, producer: data.producer, style: data.style, abv: data.abv, origin: data.origin, description: data.description, active: data.active ?? true } })
    emitChange('drinks')
    return created
  })

  app.put('/api/drinks/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as any).id)
    const data = DrinkUpdate.parse((req as any).body)
    const { categoryName, categoryId, ...rest } = (data as any)
    let resolvedCategoryId: number | undefined = categoryId
    if (!resolvedCategoryId && categoryName) {
      const name = String(categoryName || '').trim()
      if (name) {
        const existing = await prisma.drinkCategory.findFirst({ where: { name } })
        resolvedCategoryId = existing ? existing.id : (await prisma.drinkCategory.create({ data: { name } })).id
      }
    }
    try {
      const updated = await prisma.drink.update({ where: { id }, data: { ...rest, ...(resolvedCategoryId ? { categoryId: resolvedCategoryId } : {}) } })
      emitChange('drinks')
      return updated
    } catch (e) {
      return reply.code(404).send({ error: 'Not found' })
    }
  })

  app.delete('/api/drinks/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as any).id)
    try {
      await prisma.drink.update({ where: { id }, data: { active: false } })
      emitChange('drinks')
      return { ok: true }
    } catch {
      return reply.code(404).send({ error: 'Not found' })
    }
  })

  // Prices for a drink
  app.get('/api/drinks/:id/prices', async (req, reply) => {
    const id = Number((req.params as any).id)
    const drink = await prisma.drink.findUnique({ where: { id } })
    if (!drink) return reply.code(404).send({ error: 'Not found' })
    const prices = await prisma.drinkPrice.findMany({ where: { drinkId: id }, include: { size: true } })
    return prices
  })

  app.put('/api/drinks/:id/prices', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as any).id)
    const drink = await prisma.drink.findUnique({ where: { id } })
    if (!drink) return reply.code(404).send({ error: 'Not found' })
    const { prices } = DrinkPriceUpsert.parse((req as any).body)
    await Promise.all(
      prices.map((p: any) =>
        prisma.drinkPrice.upsert({
          where: { drinkId_serveSizeId: { drinkId: id, serveSizeId: p.serveSizeId } },
          update: { amountMinor: p.amountMinor, currency: p.currency },
          create: { drinkId: id, serveSizeId: p.serveSizeId, amountMinor: p.amountMinor, currency: p.currency }
        })
      )
    )
    emitChange('drinks')
    return { ok: true }
  })
}
