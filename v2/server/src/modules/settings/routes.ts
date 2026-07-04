import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../core/prisma'
import { emitChange } from '../../core/events'
import { resolveEffectiveTheme } from '../sync/service'

export async function getSettings() {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  })
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async () => {
    const settings = await getSettings()
    return { settings, effectiveTheme: resolveEffectiveTheme(settings) }
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
        // Sparse: only the field groups (colors/fonts/logoUrl) this venue overrides.
        // Pass `null` to clear an override and fall back to the organisation's theme.
        themeOverrides: z.record(z.string(), z.unknown()).nullish(),
      })
      .parse(req.body)
    const { themeOverrides, ...rest } = body
    await getSettings()
    const settings = await prisma.settings.update({
      where: { id: 1 },
      data: { ...rest, ...(themeOverrides !== undefined ? { themeOverrides: themeOverrides ? JSON.stringify(themeOverrides) : null } : {}) },
    })
    emitChange('settings')
    return { settings, effectiveTheme: resolveEffectiveTheme(settings) }
  })
}
