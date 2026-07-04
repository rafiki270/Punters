import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../core/prisma'
import { emitChange } from '../../core/events'
import { httpError } from '../../core/errors'

/**
 * The v1 taps workflow, ported as-is: set how many taps you have, assign items by
 * typeahead (or create one inline), clear/kick/toggle, and keep full history.
 */

const TAP_INCLUDE = { item: { include: { prices: { include: { size: true } } } } } as const

async function closeOpenAssignment(tapNumber: number, reason: 'replaced' | 'cleared' | 'kicked') {
  const latest = await prisma.tapAssignment.findFirst({
    where: { tapNumber, removedAt: null },
    orderBy: { assignedAt: 'desc' },
  })
  if (latest) {
    await prisma.tapAssignment.update({
      where: { id: latest.id },
      data: { removedAt: new Date(), removedReason: reason },
    })
  }
}

export async function tapsRoutes(app: FastifyInstance) {
  app.get('/api/taps', async () => {
    const taps = await prisma.tap.findMany({ include: TAP_INCLUDE, orderBy: { number: 'asc' } })
    return { taps }
  })

  app.post('/api/taps/count', async (req) => {
    const { count } = z.object({ count: z.number().int().min(0).max(200) }).parse(req.body)
    const existing = await prisma.tap.findMany()
    const have = new Set(existing.map((t) => t.number))
    const toCreate: number[] = []
    for (let n = 1; n <= count; n++) if (!have.has(n)) toCreate.push(n)
    if (toCreate.length) await prisma.tap.createMany({ data: toCreate.map((number) => ({ number })) })
    for (const tap of existing.filter((t) => t.number > count)) {
      await closeOpenAssignment(tap.number, 'cleared')
      await prisma.tap.delete({ where: { number: tap.number } })
    }
    emitChange('taps')
    return { taps: await prisma.tap.findMany({ include: TAP_INCLUDE, orderBy: { number: 'asc' } }) }
  })

  app.post('/api/taps/:number/assign', async (req) => {
    const number = Number((req.params as { number: string }).number)
    const body = z
      .object({
        itemId: z.number().int().optional(),
        item: z
          .object({
            kind: z.enum(['beer', 'cider']).default('beer'),
            name: z.string().trim().min(1),
            producer: z.string().trim().nullish(),
            style: z.string().trim().nullish(),
            abv: z.number().min(0).max(100).nullish(),
          })
          .optional(),
      })
      .parse(req.body)

    await prisma.tap.upsert({ where: { number }, update: {}, create: { number } })

    let itemId = body.itemId
    if (!itemId && body.item) {
      const item = await prisma.item.create({ data: body.item })
      itemId = item.id
    }
    if (!itemId) throw httpError(400, 'itemId or item payload required')

    await closeOpenAssignment(number, 'replaced')
    await prisma.tap.update({ where: { number }, data: { itemId, status: 'on' } })
    await prisma.tapAssignment.create({ data: { tapNumber: number, itemId } })

    emitChange('taps')
    return { ok: true }
  })

  app.post('/api/taps/:number/clear', async (req) => {
    const number = Number((req.params as { number: string }).number)
    const tap = await prisma.tap.findUnique({ where: { number } })
    if (tap?.itemId != null) {
      await closeOpenAssignment(number, 'cleared')
      await prisma.tap.update({ where: { number }, data: { itemId: null, status: 'on' } })
    }
    emitChange('taps')
    return { ok: true }
  })

  app.post('/api/taps/:number/kick', async (req) => {
    const number = Number((req.params as { number: string }).number)
    const tap = await prisma.tap.findUnique({ where: { number } })
    if (tap?.itemId != null) {
      await closeOpenAssignment(number, 'kicked')
      await prisma.tap.update({ where: { number }, data: { itemId: null, status: 'kicked' } })
    }
    emitChange('taps')
    return { ok: true }
  })

  app.post('/api/taps/:number/status', async (req) => {
    const number = Number((req.params as { number: string }).number)
    const { status } = z.object({ status: z.enum(['on', 'off', 'kicked']) }).parse(req.body)
    await prisma.tap.update({ where: { number }, data: { status } })
    emitChange('taps')
    return { ok: true }
  })

  app.get('/api/taps/:number/history', async (req) => {
    const number = Number((req.params as { number: string }).number)
    const history = await prisma.tapAssignment.findMany({
      where: { tapNumber: number },
      include: { item: true },
      orderBy: { assignedAt: 'desc' },
      take: 50,
    })
    return { history }
  })
}
