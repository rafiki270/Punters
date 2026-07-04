import type { FastifyInstance } from 'fastify'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { getTemplate } from '@punters/shared'
import { prisma } from '../../core/prisma'
import { emitChange } from '../../core/events'
import { httpError } from '../../core/errors'

/** Zones (synchronized screen groups), screens (pairing + placement), and pages. */

function newPairCode(): string {
  // Unambiguous alphabet (no 0/O/1/I) — staff read this off a TV.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(6)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

async function touchRotation(zoneId: number) {
  // Reset the sync epoch whenever the playlist changes so all screens restart together.
  await prisma.zone.update({ where: { id: zoneId }, data: { rotationSince: new Date() } })
}

export async function screensRoutes(app: FastifyInstance) {
  // ---------- zones ----------
  app.get('/api/zones', async () => {
    const zones = await prisma.zone.findMany({
      include: { screens: true, pages: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { id: 'asc' },
    })
    return { zones }
  })

  app.post('/api/zones', async (req) => {
    const body = z
      .object({ name: z.string().trim().min(1), rotationMode: z.enum(['zone', 'screen']).optional() })
      .parse(req.body)
    const zone = await prisma.zone.create({ data: body })
    emitChange('screens')
    return { zone }
  })

  app.put('/api/zones/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const body = z
      .object({ name: z.string().trim().min(1).optional(), rotationMode: z.enum(['zone', 'screen']).optional() })
      .parse(req.body)
    const zone = await prisma.zone.update({ where: { id }, data: body })
    if (body.rotationMode) await touchRotation(id)
    emitChange('screens', id)
    return { zone }
  })

  app.delete('/api/zones/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.screen.updateMany({ where: { zoneId: id }, data: { zoneId: null } })
    await prisma.zone.delete({ where: { id } }) // pages cascade
    emitChange('screens', id)
    return { ok: true }
  })

  // ---------- screens ----------
  // A display calls hello on boot: known key → its record; otherwise a fresh
  // unclaimed screen with a pair code the TV shows until staff claim it.
  app.post('/api/screens/hello', async (req) => {
    const body = z
      .object({
        key: z.string().optional(),
        width: z.number().int().optional(),
        height: z.number().int().optional(),
        orientation: z.enum(['landscape', 'portrait']).optional(),
      })
      .parse(req.body ?? {})

    let screen = body.key ? await prisma.screen.findUnique({ where: { key: body.key } }) : null
    if (!screen) {
      screen = await prisma.screen.create({
        data: {
          key: randomBytes(16).toString('hex'),
          pairCode: newPairCode(),
          width: body.width,
          height: body.height,
          orientation: body.orientation,
        },
      })
      emitChange('screens')
    } else {
      screen = await prisma.screen.update({
        where: { id: screen.id },
        data: { lastSeenAt: new Date(), width: body.width ?? screen.width, height: body.height ?? screen.height, orientation: body.orientation ?? screen.orientation },
      })
    }
    return { screen }
  })

  app.get('/api/screens', async () => {
    const screens = await prisma.screen.findMany({ include: { zone: true }, orderBy: { id: 'asc' } })
    return { screens }
  })

  app.put('/api/screens/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const body = z
      .object({
        name: z.string().trim().min(1).optional(),
        zoneId: z.number().int().nullable().optional(),
        outputIndex: z.number().int().min(1).optional(),
      })
      .parse(req.body)
    const data: Record<string, unknown> = { ...body }
    if (body.zoneId !== undefined && body.zoneId !== null) data.pairCode = null // claimed
    const screen = await prisma.screen.update({ where: { id }, data })
    emitChange('screens', screen.zoneId ?? undefined)
    return { screen }
  })

  app.delete('/api/screens/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    await prisma.screen.delete({ where: { id } })
    emitChange('screens')
    return { ok: true }
  })

  // ---------- pages ----------
  app.post('/api/zones/:id/pages', async (req) => {
    const zoneId = Number((req.params as { id: string }).id)
    const body = z
      .object({
        templateId: z.string(),
        name: z.string().trim().min(1).optional(),
        durationSec: z.number().int().min(3).max(3600).optional(),
      })
      .parse(req.body)
    const template = getTemplate(body.templateId)
    if (!template) throw httpError(400, `Unknown template '${body.templateId}'`)
    const last = await prisma.page.findFirst({ where: { zoneId }, orderBy: { sortOrder: 'desc' } })
    const page = await prisma.page.create({
      data: {
        zoneId,
        templateId: body.templateId,
        name: body.name ?? template.name,
        durationSec: body.durationSec ?? 20,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    })
    await touchRotation(zoneId)
    emitChange('screens', zoneId)
    return { page }
  })

  app.put('/api/pages/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const body = z
      .object({
        name: z.string().trim().min(1).optional(),
        durationSec: z.number().int().min(3).max(3600).optional(),
        active: z.boolean().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(req.body)
    const data: Record<string, unknown> = { ...body }
    if (body.config) data.config = JSON.stringify(body.config)
    const page = await prisma.page.update({ where: { id }, data })
    await touchRotation(page.zoneId)
    emitChange('screens', page.zoneId)
    return { page }
  })

  app.post('/api/zones/:id/pages/reorder', async (req) => {
    const zoneId = Number((req.params as { id: string }).id)
    const { ids } = z.object({ ids: z.array(z.number().int()) }).parse(req.body)
    for (let i = 0; i < ids.length; i++) {
      await prisma.page.updateMany({ where: { id: ids[i], zoneId }, data: { sortOrder: i + 1 } })
    }
    await touchRotation(zoneId)
    emitChange('screens', zoneId)
    return { ok: true }
  })

  app.delete('/api/pages/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    const page = await prisma.page.delete({ where: { id } })
    await touchRotation(page.zoneId)
    emitChange('screens', page.zoneId)
    return { ok: true }
  })
}
