import { FastifyInstance } from 'fastify'
// image-size typing can vary; use default import and loose typing
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import sizeOf from 'image-size'
import { prisma } from '../db'
import { requireAdmin } from '../auth'
import { emitChange } from '../events'

export async function registerMediaRoutes(app: FastifyInstance) {
  app.get('/api/assets', async () => {
    // Only list advert images (exclude beer badges and style assets like logo/background)
    return prisma.asset.findMany({
      where: {
        beersWithBadge: { none: {} },
        OR: [
          { tags: null },
          { tags: '' },
          { tags: { notIn: ['style:logo', 'style:background', 'drink:logo'] } },
        ]
      },
      orderBy: [
        { displayOrder: 'asc' },
        { createdAt: 'desc' }
      ]
    })
  })

  app.put('/api/assets/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as any).id)
    const body = (req as any).body as { allowPair?: boolean; fullscreen?: boolean; requireLogo?: boolean; hideLogo?: boolean; displayOrder?: number }
    try {
      const updated = await prisma.asset.update({ where: { id }, data: {
        allowPair: body.allowPair ?? undefined,
        fullscreen: body.fullscreen ?? undefined,
        requireLogo: body.requireLogo ?? undefined,
        hideLogo: body.hideLogo ?? undefined,
        displayOrder: typeof body.displayOrder === 'number' ? Number(body.displayOrder) : undefined,
      } })
      emitChange('media')
      return updated
    } catch {
      return reply.code(404).send({ error: 'Not found' })
    }
  })

  app.put('/api/assets/order', { preHandler: requireAdmin }, async (req) => {
    const ids = ((req as any).body?.ids as number[]) || []
    for (let i = 0; i < ids.length; i++) {
      await prisma.asset.update({ where: { id: Number(ids[i]) }, data: { displayOrder: i } })
    }
    emitChange('media')
    return { ok: true }
  })

  app.post('/api/upload', { preHandler: requireAdmin }, async (req, reply) => {
    const mp = await (req as any).file()
    if (!mp) return reply.code(400).send({ error: 'No file' })
    const mime = mp.mimetype || ''
    if (!['image/jpeg', 'image/png'].includes(mime)) {
      return reply.code(400).send({ error: 'Only JPG/PNG allowed' })
    }
    const chunks: Buffer[] = []
    for await (const chunk of mp.file) chunks.push(chunk as Buffer)
    if ((mp.file as any)?.truncated) {
      return reply.code(413).send({ error: 'File too large (truncated)' })
    }
    const buf = Buffer.concat(chunks)
    let dims: any
    try { dims = sizeOf(buf) } catch {}

    const tag = (mp.fields?.tag?.value as string | undefined) || ''
    const asset = await prisma.asset.create({
      data: {
        type: 'image',
        filename: mp.filename || 'upload',
        mimeType: mime,
        width: typeof dims?.width === 'number' ? (dims!.width as number) : null as any,
        height: typeof dims?.height === 'number' ? (dims!.height as number) : null as any,
        sizeBytes: buf.length,
        data: buf,
        tags: tag,
        fullscreen: true
      }
    })
    emitChange('media')
    return asset
  })

  app.delete('/api/assets/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as any).id)
    // Prevent deleting assets that are in use as beer badges or drink logos
    const beerUse = await prisma.beer.count({ where: { badgeAssetId: id } })
    const drinkUse = await prisma.drink.count({ where: { logoAssetId: id } }).catch(()=>0)
    if ((beerUse > 0) || (drinkUse > 0)) {
      return reply.code(400).send({ error: 'Asset is in use and cannot be deleted from Media.' })
    }
    await prisma.asset.delete({ where: { id } }).catch(() => {})
    emitChange('media')
    return { ok: true }
  })

  // Stream asset content from DB
  app.get('/api/assets/:id/content', async (req, reply) => {
    const id = Number((req.params as any).id)
    const asset = await prisma.asset.findUnique({ where: { id } })
    if (!asset || !asset.data) return reply.code(404).send({ error: 'Not found' })
    reply.header('Content-Type', asset.mimeType)
    reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    return reply.send(Buffer.from(asset.data))
  })
}
