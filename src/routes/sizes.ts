import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { z } from 'zod'
import { requireAdmin } from '../auth'
import { emitChange } from '../events'

const SizeCreate = z.object({ name: z.string().min(1), volumeMl: z.number().int().positive(), displayOrder: z.number().int().optional() })
const SizeUpdate = z.object({ name: z.string().min(1).optional(), volumeMl: z.number().int().positive().optional(), displayOrder: z.number().int().optional() })

export async function registerSizeRoutes(app: FastifyInstance) {
  app.get('/api/sizes', async () => prisma.serveSize.findMany({ orderBy: { displayOrder: 'asc' } }))

  app.post('/api/sizes', { preHandler: requireAdmin }, async (req) => {
    const data = SizeCreate.parse((req as any).body)
    const created = await prisma.serveSize.create({ data })
    emitChange('sizes')
    return created
  })

  app.put('/api/sizes/:id', { preHandler: requireAdmin }, async (req) => {
    const id = Number((req.params as any).id)
    const data = SizeUpdate.parse((req as any).body)
    const updated = await prisma.serveSize.update({ where: { id }, data })
    emitChange('sizes')
    return updated
  })

  app.delete('/api/sizes/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as any).id)
    const priceCount = await prisma.price.count({ where: { serveSizeId: id } })
    if (priceCount > 0) {
      reply.code(400)
      return { error: 'Cannot delete size with existing prices' }
    }
    await prisma.serveSize.delete({ where: { id } })
    emitChange('sizes')
    return { ok: true }
  })
}
