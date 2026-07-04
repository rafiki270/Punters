import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { isItemKind } from '@punters/shared'
import { prisma } from '../../core/prisma'
import { emitChange } from '../../core/events'
import { httpError } from '../../core/errors'

const priceSchema = z.object({
  sizeId: z.number().int().nullable(),
  amountMinor: z.number().int().min(0).nullable(),
})

const itemSchema = z.object({
  kind: z.string().refine(isItemKind, 'unknown item kind'),
  name: z.string().trim().min(1),
  producer: z.string().trim().nullish(),
  style: z.string().trim().nullish(),
  abv: z.number().min(0).max(100).nullish(),
  description: z.string().trim().nullish(),
  categoryId: z.number().int().nullish(),
  vegan: z.boolean().optional(),
  vegetarian: z.boolean().optional(),
  glutenFree: z.boolean().optional(),
  dairyFree: z.boolean().optional(),
  spicyLevel: z.number().int().min(0).max(3).optional(),
  imageAssetId: z.number().int().nullish(),
  badgeAssetId: z.number().int().nullish(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  prices: z.array(priceSchema).optional(),
})

const ITEM_INCLUDE = {
  category: true,
  prices: { include: { size: true } },
} as const

async function writePrices(itemId: number, prices: z.infer<typeof priceSchema>[]) {
  for (const p of prices) {
    if (p.amountMinor == null) {
      await prisma.price.deleteMany({ where: { itemId, sizeId: p.sizeId } })
    } else {
      const existing = await prisma.price.findFirst({ where: { itemId, sizeId: p.sizeId } })
      if (existing) await prisma.price.update({ where: { id: existing.id }, data: { amountMinor: p.amountMinor } })
      else await prisma.price.create({ data: { itemId, sizeId: p.sizeId, amountMinor: p.amountMinor } })
    }
  }
}

export async function catalogRoutes(app: FastifyInstance) {
  // ---------- items ----------
  app.get('/api/items', async (req) => {
    const q = req.query as { kind?: string; q?: string; active?: string; tappable?: string }
    const where: Record<string, unknown> = {}
    if (q.kind) where.kind = { in: q.kind.split(',') }
    if (q.tappable === 'true') where.kind = { in: ['beer', 'cider'] }
    if (q.q) where.name = { contains: q.q }
    if (q.active === 'true') where.active = true
    const items = await prisma.item.findMany({
      where,
      include: ITEM_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: q.q ? 20 : undefined,
    })
    return { items }
  })

  app.post('/api/items', async (req) => {
    const body = itemSchema.parse(req.body)
    const { prices, ...data } = body
    const item = await prisma.item.create({ data })
    if (prices?.length) await writePrices(item.id, prices)
    emitChange('catalog')
    return { item: await prisma.item.findUnique({ where: { id: item.id }, include: ITEM_INCLUDE }) }
  })

  app.put('/api/items/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const body = itemSchema.partial().parse(req.body)
    const { prices, ...data } = body
    const existing = await prisma.item.findUnique({ where: { id } })
    // Editing a shared item forks it: it stops receiving organisation-wide sync updates
    // from this point on (see AUTH_ARCHITECTURE.md's "Sharing model").
    const forking = !!existing?.sharedItemId && !existing.overridden
    await prisma.item.update({ where: { id }, data: forking ? { ...data, overridden: true } : data })
    if (prices) await writePrices(id, prices)
    emitChange('catalog')
    return { item: await prisma.item.findUnique({ where: { id }, include: ITEM_INCLUDE }) }
  })

  // Unlink without editing: same effect (stop syncing) with no field changes.
  app.post('/api/items/:id/unlink', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const item = await prisma.item.update({ where: { id }, data: { overridden: true }, include: ITEM_INCLUDE })
    emitChange('catalog')
    return { item }
  })

  app.delete('/api/items/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const onTap = await prisma.tap.count({ where: { itemId: id } })
    if (onTap > 0) throw httpError(409, 'Item is on a tap — clear the tap first')
    await prisma.tapAssignment.deleteMany({ where: { itemId: id } })
    await prisma.item.delete({ where: { id } })
    emitChange('catalog')
    return { ok: true }
  })

  // ---------- categories ----------
  app.get('/api/categories', async (req) => {
    const { kind } = req.query as { kind?: string }
    const categories = await prisma.category.findMany({
      where: kind ? { kind } : undefined,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    })
    return { categories }
  })

  app.post('/api/categories', async (req) => {
    const body = z
      .object({
        kind: z.string().refine(isItemKind),
        name: z.string().trim().min(1),
        displayOrder: z.number().int().optional(),
      })
      .parse(req.body)
    const category = await prisma.category.create({ data: body })
    emitChange('catalog')
    return { category }
  })

  app.put('/api/categories/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const body = z
      .object({ name: z.string().trim().min(1).optional(), displayOrder: z.number().int().optional(), active: z.boolean().optional() })
      .parse(req.body)
    const category = await prisma.category.update({ where: { id }, data: body })
    emitChange('catalog')
    return { category }
  })

  app.delete('/api/categories/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.item.updateMany({ where: { categoryId: id }, data: { categoryId: null } })
    await prisma.category.delete({ where: { id } })
    emitChange('catalog')
    return { ok: true }
  })

  // ---------- serve sizes ----------
  app.get('/api/sizes', async () => {
    const sizes = await prisma.serveSize.findMany({ orderBy: { displayOrder: 'asc' } })
    return { sizes }
  })

  app.post('/api/sizes', async (req) => {
    const body = z
      .object({
        name: z.string().trim().min(1),
        volumeMl: z.number().int().nullish(),
        displayOrder: z.number().int().optional(),
        kinds: z.string().optional(),
      })
      .parse(req.body)
    const size = await prisma.serveSize.create({ data: body })
    emitChange('catalog')
    return { size }
  })

  app.put('/api/sizes/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const body = z
      .object({
        name: z.string().trim().min(1).optional(),
        volumeMl: z.number().int().nullish(),
        displayOrder: z.number().int().optional(),
        kinds: z.string().optional(),
      })
      .parse(req.body)
    const size = await prisma.serveSize.update({ where: { id }, data: body })
    emitChange('catalog')
    return { size }
  })

  app.delete('/api/sizes/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.price.deleteMany({ where: { sizeId: id } })
    await prisma.serveSize.delete({ where: { id } })
    emitChange('catalog')
    return { ok: true }
  })
}
