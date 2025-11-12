import { FastifyInstance } from 'fastify'
import { requireAdmin } from '../auth'
import { emitChange } from '../events'
import { prisma } from '../db'
import { SizeCreateSchema, SizeUpdateSchema } from '../modules/catalog/schema'
import { createCatalogRepo } from '../modules/catalog/repo'
import { createCatalogService, SizeInUseError } from '../modules/catalog/service'
import { httpError, route } from '../core/http'

export async function registerSizeRoutes(app: FastifyInstance) {
  const catalog = createCatalogService({ repo: createCatalogRepo(prisma), emitChange })

  app.get('/api/sizes', route(async () => catalog.listSizes()))

  app.post('/api/sizes', { preHandler: requireAdmin }, route(async (req) => {
    const data = SizeCreateSchema.parse((req as any).body ?? {})
    return catalog.createSize(data)
  }))

  app.put('/api/sizes/:id', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    const data = SizeUpdateSchema.parse((req as any).body ?? {})
    return catalog.updateSize(id, data)
  }))

  app.delete('/api/sizes/:id', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    try {
      await catalog.deleteSize(id)
      return { ok: true }
    } catch (err) {
      if (err instanceof SizeInUseError) throw httpError(400, err.message)
      throw err
    }
  }))
}
