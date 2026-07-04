import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../core/prisma'
import { emitChange } from '../../core/events'

export async function getSettings() {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  })
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async () => {
    return { settings: await getSettings() }
  })

  app.put('/api/settings', async (req) => {
    const body = z
      .object({
        venueName: z.string().trim().min(1).optional(),
        currency: z.string().trim().length(3).optional(),
        locale: z.string().trim().min(2).optional(),
        theme: z.enum(['dark', 'light']).optional(),
        logoAssetId: z.number().int().nullish(),
        backgroundAssetId: z.number().int().nullish(),
      })
      .parse(req.body)
    await getSettings()
    const settings = await prisma.settings.update({ where: { id: 1 }, data: body })
    emitChange('settings')
    return { settings }
  })
}
