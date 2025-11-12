import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { requireAdmin } from '../auth'
import { emitChange } from '../events'
import { createMediaService } from '../modules/media/service'
import { route } from '../core/http'

export async function registerMediaRoutes(app: FastifyInstance) {
  const media = createMediaService({ prisma, emitChange })

  app.get('/api/assets', route(async () => media.listAssets()))

  app.put('/api/assets/:id', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    return media.updateAsset(id, (req as any).body)
  }))

  app.put('/api/assets/order', { preHandler: requireAdmin }, route(async (req) => {
    return media.reorderAssets((req as any).body)
  }))

  app.post('/api/upload', { preHandler: requireAdmin }, route(async (req) => {
    const mp = await (req as any).file()
    return media.uploadAsset(mp)
  }))

  app.delete('/api/assets/:id', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    return media.deleteAsset(id)
  }))

  app.get('/api/assets/:id/content', route(async (req, reply) => {
    const id = Number((req.params as any).id)
    const asset = await media.streamAsset(id)
    reply.header('Content-Type', asset.mimeType)
    reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    return reply.send(Buffer.from(asset.data as any))
  }))
}
