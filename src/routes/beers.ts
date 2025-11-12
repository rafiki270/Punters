import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../auth'
import { emitChange } from '../events'
import { prisma } from '../db'
import { createCatalogRepo } from '../modules/catalog/repo'
import { createCatalogService } from '../modules/catalog/service'
import {
  BeerCreateSchema,
  BeerPriceUpsertSchema,
  BeerUpdateSchema,
  createBeersService,
} from '../modules/inventory/beers'
import { parseQuery, route } from '../core/http'

export async function registerBeerRoutes(app: FastifyInstance) {
  const catalog = createCatalogService({ repo: createCatalogRepo(prisma), emitChange })
  const beers = createBeersService({ prisma, emitChange, prefillBeerPrices: catalog.prefillBeerPrices })

  const ListQuery = z.object({ active: z.string().optional() })
  app.get('/api/beers', route(async (req) => {
    const { active } = parseQuery(req, ListQuery)
    const activeFilter = typeof active === 'string' ? active === 'true' : undefined
    return beers.list({ active: activeFilter })
  }))

  const SearchQuery = z.object({ q: z.string().optional() })
  app.get('/api/beers/search', route(async (req) => {
    const { q } = parseQuery(req, SearchQuery)
    return beers.search(q || '')
  }))

  app.get('/api/beers/:id', route(async (req) => {
    const id = Number((req.params as any).id)
    return beers.get(id)
  }))

  app.post('/api/beers', { preHandler: requireAdmin }, route(async (req) => {
    const data = BeerCreateSchema.parse((req as any).body ?? {})
    return beers.create(data)
  }))

  app.put('/api/beers/:id', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    const data = BeerUpdateSchema.parse((req as any).body ?? {})
    return beers.update(id, data)
  }))

  app.delete('/api/beers/:id', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    await beers.softDelete(id)
    return { ok: true }
  }))

  app.get('/api/beers/:id/prices', route(async (req) => {
    const id = Number((req.params as any).id)
    return beers.listPrices(id)
  }))

  app.put('/api/beers/:id/prices', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    const payload = BeerPriceUpsertSchema.parse((req as any).body ?? {})
    return beers.upsertPrices(id, payload)
  }))
}
