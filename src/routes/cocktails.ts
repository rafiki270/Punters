import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../auth'
import { prisma } from '../db'
import { emitChange } from '../events'
import { createCocktailsService, CocktailCreateSchema, CocktailUpdateSchema } from '../modules/inventory/cocktails'
import { parseQuery, route } from '../core/http'

export async function registerCocktailRoutes(app: FastifyInstance) {
  const cocktails = createCocktailsService({ prisma, emitChange })

  const ListQuery = z.object({
    active: z.string().optional(),
  })

  app.get('/api/cocktails', route(async (req) => {
    const q = parseQuery(req, ListQuery)
    return cocktails.list({ active: q.active ? q.active === 'true' : undefined })
  }))

  app.get('/api/cocktails/:id', route(async (req) => {
    const id = Number((req.params as any).id)
    return cocktails.get(id)
  }))

  app.post('/api/cocktails', { preHandler: requireAdmin }, route(async (req) => {
    const data = CocktailCreateSchema.parse((req as any).body ?? {})
    return cocktails.create(data)
  }))

  app.put('/api/cocktails/:id', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    const data = CocktailUpdateSchema.parse((req as any).body ?? {})
    return cocktails.update(id, data)
  }))

  app.delete('/api/cocktails/:id', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    return cocktails.softDelete(id)
  }))
}
