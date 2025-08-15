import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { z } from 'zod'
import { requireAdmin } from '../auth'
import { emitChange } from '../events'
import { setConfig } from '../discovery'

// Accept partial updates and coerce numeric inputs from strings
const SettingsSchema = z.object({
  themeMode: z.enum(['light', 'dark']),
  rotationSec: z.coerce.number().int().min(5).max(3600),
  defaultDisplayMode: z.enum(['all', 'beer', 'ads']),
  currency: z.string().min(1).max(8),
  defaultSizeId: z.coerce.number().int().nullable().optional(),
  defaultPrices: z.record(z.string(), z.coerce.number().int().nonnegative()).optional(),
  defaultGuestPrices: z.record(z.string(), z.coerce.number().int().nonnegative()).optional(),
  locale: z.string().min(2).max(10),
  mode: z.enum(['server','client']).optional(),
  logoAssetId: z.coerce.number().int().nullable().optional(),
  backgroundAssetId: z.coerce.number().int().nullable().optional(),
  backgroundPreset: z.string().min(1).max(200).nullable().optional(),
  // Style defaults
  cellScale: z.coerce.number().int().min(0).max(100).optional(),
  columnGap: z.coerce.number().int().min(0).max(200).optional(),
  logoPosition: z.enum(['top-left','top-center','top-right','bottom-left','bottom-right']).optional(),
  logoScale: z.coerce.number().int().min(10).max(300).optional(),
  bgPosition: z.enum(['center','top','bottom','left','right']).optional(),
  bgScale: z.coerce.number().int().min(50).max(300).optional(),
  // New style options
  logoBgEnabled: z.coerce.boolean().optional(),
  logoBgColor: z.string().min(1).max(20).optional(),
  logoBgRounded: z.coerce.boolean().optional(),
  logoBgRadius: z.coerce.number().int().min(0).max(200).optional(),
  bgOpacity: z.coerce.number().int().min(0).max(100).optional(),
  logoPadX: z.coerce.number().int().min(0).max(200).optional(),
  logoPadY: z.coerce.number().int().min(0).max(200).optional(),
  pageBgColor: z.string().min(1).max(20).optional(),
  showFooter: z.coerce.boolean().optional(),
  beerColumns: z.coerce.number().int().min(1).max(6).optional(),
  itemsPerPage: z.coerce.number().int().min(1).max(500).optional(),
}).partial()

export async function registerSettingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async () => {
    let s = await prisma.globalSettings.findUnique({ where: { id: 1 } })
    if (!s) {
      s = await prisma.globalSettings.create({
        data: { id: 1, themeMode: 'dark', rotationSec: 90, defaultDisplayMode: 'all', currency: 'GBP', locale: 'en-GB', mode: 'server' }
      })
    }
    const defaults = await prisma.defaultPrice.findMany()
    const defaultPrices: Record<string, number> = {}
    const defaultGuestPrices: Record<string, number> = {}
    for (const dp of defaults) {
      if (dp.isGuest) defaultGuestPrices[String(dp.serveSizeId)] = dp.amountMinor
      else defaultPrices[String(dp.serveSizeId)] = dp.amountMinor
    }
    return { ...s, defaultPrices, defaultGuestPrices }
  })

  app.put('/api/settings', { preHandler: requireAdmin }, async (req, reply) => {
    const parsedRes = SettingsSchema.safeParse((req as any).body)
    if (!parsedRes.success) {
      return reply.code(400).send({ error: 'Invalid settings', details: parsedRes.error.flatten() })
    }
    const parsed = parsedRes.data as any
    const { defaultPrices, defaultGuestPrices, logoAssetId, backgroundAssetId, backgroundPreset, ...rest } = parsed
    // Build nested writes for relations and merge scalar defaults
    const updateData: any = { ...rest }
    if (logoAssetId !== undefined) updateData.logoAsset = logoAssetId == null ? { disconnect: true } : { connect: { id: Number(logoAssetId) } }
    if (backgroundAssetId !== undefined) updateData.backgroundAsset = backgroundAssetId == null ? { disconnect: true } : { connect: { id: Number(backgroundAssetId) } }
    if (backgroundPreset !== undefined) updateData.backgroundPreset = backgroundPreset
    const createData: any = { id: 1, ...rest }
    if (logoAssetId !== undefined && logoAssetId != null) createData.logoAsset = { connect: { id: Number(logoAssetId) } }
    if (backgroundAssetId !== undefined && backgroundAssetId != null) createData.backgroundAsset = { connect: { id: Number(backgroundAssetId) } }
    if (backgroundPreset !== undefined) createData.backgroundPreset = backgroundPreset
    const updated = await prisma.globalSettings.upsert({ where: { id: 1 }, update: updateData, create: createData })
    // Upsert defaults if provided
    if (defaultPrices) {
      await Promise.all(Object.entries(defaultPrices).map(([sid, amt]) => prisma.defaultPrice.upsert({
        where: { serveSizeId_isGuest: { serveSizeId: Number(sid), isGuest: false } },
        update: { amountMinor: Number(amt) },
        create: { serveSizeId: Number(sid), isGuest: false, amountMinor: Number(amt) }
      })))
    }
    if (defaultGuestPrices) {
      await Promise.all(Object.entries(defaultGuestPrices).map(([sid, amt]) => prisma.defaultPrice.upsert({
        where: { serveSizeId_isGuest: { serveSizeId: Number(sid), isGuest: true } },
        update: { amountMinor: Number(amt) },
        create: { serveSizeId: Number(sid), isGuest: true, amountMinor: Number(amt) }
      })))
    }
    const desiredMode = (parsed as any).mode
    const desiredName = (parsed as any).instanceName ?? (req as any).body?.instanceName
    if (desiredMode || desiredName) {
      await setConfig({ mode: desiredMode, name: desiredName })
    }
    emitChange('settings')
    return reply.send(updated)
  })
}
