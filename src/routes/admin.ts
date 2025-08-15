import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { requireAdmin } from '../auth'

let resetCode: string | null = null
let resetExpiresAt = 0

export async function registerAdminRoutes(app: FastifyInstance) {
  // Request a short-lived reset code to confirm factory reset
  app.post('/api/admin/factory-reset/request', { preHandler: requireAdmin }, async () => {
    // Generate a 6-digit code
    resetCode = Math.floor(100000 + Math.random() * 900000).toString()
    resetExpiresAt = Date.now() + 60_000 // 60 seconds
    return { code: resetCode, expiresInSec: 60 }
  })

  // Factory reset: destructive; requires code from request endpoint
  app.post('/api/admin/factory-reset', { preHandler: requireAdmin }, async (req, reply) => {
    const body = (req as any).body as { code?: string }
    if (!resetCode || !body?.code || body.code !== resetCode || Date.now() > resetExpiresAt) {
      return reply.code(400).send({ error: 'Invalid or expired confirmation code. Request a new code.' })
    }
    // Invalidate code after use
    resetCode = null
    resetExpiresAt = 0

    // Delete in dependency order
    await prisma.price.deleteMany({})
    await prisma.tapAssignment.deleteMany({})
    await prisma.tap.deleteMany({})
    await prisma.device.deleteMany({})
    await prisma.screenGroup.deleteMany({})
    await prisma.asset.deleteMany({})
    await prisma.beer.deleteMany({})
    await prisma.serveSize.deleteMany({})
    await prisma.globalSettings.deleteMany({})

    // Re-seed default sizes
    const sizes = [
      { name: 'Pint', volumeMl: 568, displayOrder: 1 },
      { name: 'Half Pint', volumeMl: 284, displayOrder: 2 },
      { name: 'Two Thirds Pint', volumeMl: 379, displayOrder: 3 },
      { name: 'One Third Pint', volumeMl: 189, displayOrder: 4 }
    ]
    for (const s of sizes) {
      await prisma.serveSize.create({ data: s })
    }
    const allSizes = await prisma.serveSize.findMany()
    const defaultSize = allSizes.find((s) => s.name === 'Pint') ?? allSizes[0]
    const defaultPrices: Record<number, number> = {}
    const defaultGuestPrices: Record<number, number> = {}
    for (const s of allSizes) {
      if (s.name === 'Pint') {
        defaultGuestPrices[s.id] = 600
      } else if (s.name === 'Half Pint') {
        defaultGuestPrices[s.id] = 300
      } else {
        defaultGuestPrices[s.id] = 0
      }
      defaultPrices[s.id] = 0
    }
    await prisma.globalSettings.create({
      data: {
        id: 1,
        themeMode: 'light',
        rotationSec: 90,
        defaultDisplayMode: 'all',
        currency: 'GBP',
        defaultSizeId: defaultSize?.id,
        defaultPrices,
        defaultGuestPrices,
        locale: 'en-GB',
        authEnabled: false
      }
    })

    return { ok: true }
  })
}
