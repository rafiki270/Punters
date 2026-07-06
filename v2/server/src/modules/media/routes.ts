import type { FastifyInstance } from 'fastify'
import { prisma } from '../../core/prisma'
import { emitChange } from '../../core/events'
import { httpError } from '../../core/errors'
import { createAsset, deleteAsset, toAssetWithUrls } from './service'

export async function mediaRoutes(app: FastifyInstance) {
  app.get('/api/media', async (req) => {
    const { purpose } = req.query as { purpose?: string }
    const assets = await prisma.asset.findMany({
      where: purpose ? { purpose } : undefined,
      include: { variants: true },
      orderBy: { createdAt: 'desc' },
    })
    return { assets: assets.map(toAssetWithUrls) }
  })

  app.post('/api/media', async (req) => {
    const file = await req.file({ limits: { fileSize: 200 * 1024 * 1024 } })
    if (!file) throw httpError(400, 'No file uploaded')
    const buffer = await file.toBuffer()
    const fields = file.fields as Record<string, { value?: string } | undefined>
    const purpose = fields.purpose?.value ?? 'media'
    const tag = fields.tag?.value || null
    const asset = await createAsset({
      buffer,
      originalName: file.filename,
      mime: file.mimetype,
      purpose,
      tag,
    })
    emitChange('media')
    return { asset }
  })

  app.delete('/api/media/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    await deleteAsset(id)
    emitChange('media')
    return { ok: true }
  })
}
