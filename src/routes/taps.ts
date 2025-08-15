import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { z } from 'zod'
import { requireAdmin } from '../auth'
import { emitChange } from '../events'

const AssignPayload = z.object({
  beerId: z.number().int().optional(),
  beer: z
    .object({
      name: z.string().min(1),
      brewery: z.string().min(1),
      style: z.string().min(1),
      abv: z.number().optional(),
      ibu: z.number().int().optional(),
      description: z.string().optional(),
      colorHex: z.string().optional(),
      tags: z.string().optional(),
      badgeAssetId: z.number().int().optional(),
      isGuest: z.boolean().optional()
    })
    .optional()
})

export async function registerTapRoutes(app: FastifyInstance) {
  const getTapNumber = (req: any): number | null => {
    const raw = req?.params?.number ?? (req?.params && Object.values(req.params)[0])
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  // List taps with current beer (if any)
  // Frontend expects { tapNumber, status, beer }
  app.get('/api/taps', async () => {
    const taps = await prisma.tap.findMany({ include: { beer: true }, orderBy: { number: 'asc' } })
    return taps.map((t) => ({
      tapNumber: t.number,
      status: t.status,
      beer: t.beer
        ? {
            id: t.beer.id,
            name: t.beer.name,
            brewery: t.beer.brewery,
            style: t.beer.style,
            abv: t.beer.abv,
            badgeAssetId: t.beer.badgeAssetId,
            isGuest: t.beer.isGuest,
          }
        : null,
    }))
  })

  // Display list: beers assigned to taps, sorted by tap number, skipping empties
  app.get('/api/display/beerlist', async () => {
    const taps = await prisma.tap.findMany({
      where: { beerId: { not: null } },
      include: { beer: { include: { prices: { include: { size: true } } } } },
      orderBy: { number: 'asc' }
    })
    return taps.map((t) => ({
      tapNumber: t.number,
      status: t.status,
      beer: t.beer
        ? {
            id: t.beer.id,
            name: t.beer.name,
            brewery: t.beer.brewery,
            style: t.beer.style,
            abv: t.beer.abv,
            badgeAssetId: t.beer.badgeAssetId,
            isGuest: t.beer.isGuest,
            colorHex: (t.beer as any).colorHex,
            prices: t.beer.prices
          }
        : null
    }))
  })

  // Set tap count (1..N)
  app.put('/api/taps/config', { preHandler: requireAdmin }, async (req) => {
    const body = (req as any).body as { count: number }
    const count = Math.max(0, Math.floor(Number(body.count || 0)))
    // Ensure 1..count exist
    const existing = await prisma.tap.findMany()
    const existingNums = new Set(existing.map((t) => t.number))
    const toCreate: number[] = []
    for (let i = 1; i <= count; i++) if (!existingNums.has(i)) toCreate.push(i)
    if (toCreate.length) await prisma.tap.createMany({ data: toCreate.map((n) => ({ number: n })) })
    // Remove any above count
    const toRemove = existing.filter((t) => t.number > count)
    for (const t of toRemove) {
      await prisma.tap.delete({ where: { number: t.number } })
    }
    const taps = await prisma.tap.findMany({ orderBy: { number: 'asc' } })
    emitChange('taps')
    return { count, taps }
  })

  // Assign beer to tap
  app.put('/api/taps/:number/assign', { preHandler: requireAdmin }, async (req, reply) => {
    const number = getTapNumber(req)
    if (!number) return reply.code(400).send({ error: 'Invalid tap number' })
    const payload = AssignPayload.parse((req as any).body)
    await prisma.tap.upsert({ where: { number }, update: {}, create: { number } })
    let beerId = payload.beerId
    if (!beerId && payload.beer) {
      const beer = await prisma.beer.create({ data: { ...payload.beer, isGuest: !!payload.beer.isGuest } })
      beerId = beer.id
    }
    if (!beerId) return reply.code(400).send({ error: 'beerId or beer payload required' })

    // Close previous assignment if exists
    const latest = await prisma.tapAssignment.findFirst({ where: { tapNumber: number, removedAt: null }, orderBy: { assignedAt: 'desc' } })
    if (latest) {
      await prisma.tapAssignment.update({ where: { id: latest.id }, data: { removedAt: new Date(), removedReason: 'replaced' } })
    }

    await prisma.tap.update({ where: { number }, data: { beerId, status: 'on' } })
    await prisma.tapAssignment.create({ data: { tapNumber: number, beerId } })

    // Prefill prices if missing using defaults
    const priceCount = await prisma.price.count({ where: { beerId } })
    if (priceCount === 0) {
      const settings = await prisma.globalSettings.findUnique({ where: { id: 1 } })
      const beer = await prisma.beer.findUnique({ where: { id: beerId } })
      const currency = settings?.currency || 'GBP'
      const defaults = await prisma.defaultPrice.findMany({ where: { isGuest: !!beer?.isGuest } })
      if (defaults.length) {
        const entries = defaults.map((d) => ({ beerId, serveSizeId: d.serveSizeId, amountMinor: d.amountMinor, currency }))
        await prisma.price.createMany({ data: entries, skipDuplicates: true })
      }
    }

    emitChange('taps')
    return { ok: true }
  })

  // Clear assignment
  app.delete('/api/taps/:number/assign', { preHandler: requireAdmin }, async (req, reply) => {
    const number = getTapNumber(req)
    if (!number) return reply.code(400).send({ error: 'Invalid tap number' })
    const tap = await prisma.tap.findUnique({ where: { number } })
    if (!tap) return { ok: true }
    if (tap.beerId != null) {
      const latest = await prisma.tapAssignment.findFirst({ where: { tapNumber: number, removedAt: null }, orderBy: { assignedAt: 'desc' } })
      if (latest) await prisma.tapAssignment.update({ where: { id: latest.id }, data: { removedAt: new Date(), removedReason: 'cleared' } })
    }
    await prisma.tap.update({ where: { number }, data: { beerId: null } })
    emitChange('taps')
    return { ok: true }
  })

  // Set status
  app.post('/api/taps/:number/status', { preHandler: requireAdmin }, async (req, reply) => {
    const number = getTapNumber(req)
    if (!number) return reply.code(400).send({ error: 'Invalid tap number' })
    const status = (req as any).body?.status as 'on' | 'off' | 'coming_soon' | 'kicked'
    await prisma.tap.upsert({ where: { number }, update: { status }, create: { number, status } })
    if (status === 'kicked') {
      const latest = await prisma.tapAssignment.findFirst({ where: { tapNumber: number, removedAt: null }, orderBy: { assignedAt: 'desc' } })
      if (latest) await prisma.tapAssignment.update({ where: { id: latest.id }, data: { removedAt: new Date(), removedReason: 'kicked' } })
    }
    emitChange('taps')
    return { ok: true }
  })

  // History
  app.get('/api/taps/:number/history', async (req, reply) => {
    const number = getTapNumber(req)
    if (!number) return reply.code(400).send({ error: 'Invalid tap number' })
    const hist = await prisma.tapAssignment.findMany({ where: { tapNumber: number }, include: { beer: true }, orderBy: { assignedAt: 'desc' } })
    return hist
  })
}
