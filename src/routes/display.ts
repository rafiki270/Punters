import { FastifyInstance } from 'fastify'
import { prisma } from '../db'

export async function registerDisplayRoutes(app: FastifyInstance) {
  // List ad assets (images). In future, filter by tag/category.
  app.get('/api/display/ads', async () => {
    // Only include images that are not used as beer badges or style assets
    const assets = await prisma.asset.findMany({
      where: {
        type: 'image',
        beersWithBadge: { none: {} },
        OR: [
          { tags: null },
          { tags: '' },
          { tags: { notIn: ['style:logo', 'style:background'] } },
        ]
      },
      orderBy: { createdAt: 'desc' }
    })
    return assets.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, width: a.width, height: a.height, allowPair: a.allowPair, fullscreen: a.fullscreen }))
  })
}
