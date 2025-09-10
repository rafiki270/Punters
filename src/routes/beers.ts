import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { z } from 'zod'
import { requireAdmin } from '../auth'
import { emitChange } from '../events'

const BeerCreate = z.object({
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
  prefillPrices: z.boolean().optional()
})

const BeerUpdate = BeerCreate.partial()

const PriceUpsert = z.object({ prices: z.array(z.object({ serveSizeId: z.number().int(), amountMinor: z.number().int().nonnegative(), currency: z.string() })) })

export async function registerBeerRoutes(app: FastifyInstance) {
  app.get('/api/beers', async (req) => {
    const q = (req as any).query || {}
    const where: any = {}
    if (q.active != null) where.active = q.active === 'true'
    return prisma.beer.findMany({ where, orderBy: { updatedAt: 'desc' } })
  })

  app.get('/api/beers/search', async (req) => {
    const q = ((req as any).query?.q as string) || ''
    if (!q) return []
    return prisma.beer.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { brewery: { contains: q } },
          { style: { contains: q } }
        ]
      },
      take: 20,
      orderBy: { updatedAt: 'desc' }
    })
  })

  app.get('/api/beers/:id', async (req, reply) => {
    const id = Number((req.params as any).id)
    const beer = await prisma.beer.findUnique({ where: { id }, include: { prices: true } })
    if (!beer) return reply.code(404).send({ error: 'Not found' })
    return beer
  })

  app.post('/api/beers', { preHandler: requireAdmin }, async (req) => {
    const data = BeerCreate.parse((req as any).body)
    const { prefillPrices, ...beerInput } = (data as any)
    const beer = await prisma.beer.create({ data: { ...beerInput, isGuest: !!data.isGuest, glutenFree: !!data.glutenFree, vegan: !!data.vegan, alcoholFree: !!data.alcoholFree } })

    if (prefillPrices !== false) {
      const settings = await prisma.globalSettings.findUnique({ where: { id: 1 } })
      const currency = settings?.currency || 'GBP'
      const defaults = await prisma.defaultPrice.findMany({ where: { isGuest: beer.isGuest, serveSize: { forBeers: true } } })
      if (defaults.length) {
        const entries = defaults.map((d: any) => ({ beerId: beer.id, serveSizeId: d.serveSizeId, amountMinor: d.amountMinor, currency }))
        await prisma.price.createMany({ data: entries })
      }
    }

    emitChange('beers')
    return beer
  })

  app.put('/api/beers/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as any).id)
    const data = BeerUpdate.parse((req as any).body)
    try {
      // Remember previous badge to optionally clean up
      const prev = await prisma.beer.findUnique({ where: { id }, select: { badgeAssetId: true } })
      const prevBadgeId = prev?.badgeAssetId ?? null
      const updated = await prisma.beer.update({ where: { id }, data })
      // If badge changed or was removed, and the old asset is unused elsewhere, delete it
      if (prevBadgeId && prevBadgeId !== (updated as any).badgeAssetId) {
        const usedByBeer = await prisma.beer.count({ where: { badgeAssetId: prevBadgeId } })
        const usedInSettings = await prisma.globalSettings.count({ where: { OR: [ { logoAssetId: prevBadgeId }, { backgroundAssetId: prevBadgeId } ] } })
        if (usedByBeer === 0 && usedInSettings === 0) {
          await prisma.asset.delete({ where: { id: prevBadgeId } }).catch(()=>{})
        }
      }
      emitChange('beers')
      return updated
    } catch (e) {
      return reply.code(404).send({ error: 'Not found' })
    }
  })

  app.delete('/api/beers/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as any).id)
    try {
      await prisma.beer.update({ where: { id }, data: { active: false } })
      emitChange('beers')
      return { ok: true }
    } catch {
      return reply.code(404).send({ error: 'Not found' })
    }
  })

  app.get('/api/beers/:id/prices', async (req, reply) => {
    const id = Number((req.params as any).id)
    const beer = await prisma.beer.findUnique({ where: { id } })
    if (!beer) return reply.code(404).send({ error: 'Not found' })
    const prices = await prisma.price.findMany({ where: { beerId: id }, include: { size: true } })
    return prices
  })

  app.put('/api/beers/:id/prices', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as any).id)
    const beer = await prisma.beer.findUnique({ where: { id } })
    if (!beer) return reply.code(404).send({ error: 'Not found' })
    const { prices } = PriceUpsert.parse((req as any).body)
    // Upsert all provided sizes
    await Promise.all(
      prices.map((p: any) =>
        prisma.price.upsert({
          where: { beerId_serveSizeId: { beerId: id, serveSizeId: p.serveSizeId } },
          update: { amountMinor: p.amountMinor, currency: p.currency },
          create: { beerId: id, serveSizeId: p.serveSizeId, amountMinor: p.amountMinor, currency: p.currency }
        })
      )
    )
    emitChange('beers')
    return { ok: true }
  })
}
