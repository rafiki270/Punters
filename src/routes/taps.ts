import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../auth'
import { emitChange } from '../events'
import { prisma } from '../db'
import { createCatalogRepo } from '../modules/catalog/repo'
import { createCatalogService } from '../modules/catalog/service'
import {
  TapAssignSchema,
  TapConfigSchema,
  TapStatusSchema,
  createTapsService,
} from '../modules/inventory/taps'
import { httpError, route } from '../core/http'

export async function registerTapRoutes(app: FastifyInstance) {
  const catalog = createCatalogService({ repo: createCatalogRepo(prisma), emitChange })
  const taps = createTapsService({ prisma, emitChange, prefillBeerPrices: catalog.prefillBeerPrices })

  const parseTapNumber = (req: any): number => {
    const raw = req?.params?.number ?? (req?.params && Object.values(req.params)[0])
    const num = Number(raw)
    if (!Number.isFinite(num) || num <= 0) throw httpError(400, 'Invalid tap number')
    return num
  }

  app.get('/api/taps', route(async () => taps.list()))

  app.get('/api/display/beerlist', route(async () => taps.listDisplayBeers()))

  app.put('/api/taps/config', { preHandler: requireAdmin }, route(async (req) => {
    const body = TapConfigSchema.parse((req as any).body ?? {})
    return taps.setTapCount(body.count)
  }))

  app.put('/api/taps/:number/assign', { preHandler: requireAdmin }, route(async (req) => {
    const number = parseTapNumber(req)
    const payload = TapAssignSchema.parse((req as any).body ?? {})
    return taps.assignTap(number, payload)
  }))

  app.delete('/api/taps/:number/assign', { preHandler: requireAdmin }, route(async (req) => {
    const number = parseTapNumber(req)
    return taps.clearTap(number)
  }))

  app.post('/api/taps/:number/status', { preHandler: requireAdmin }, route(async (req) => {
    const number = parseTapNumber(req)
    const { status } = TapStatusSchema.parse((req as any).body ?? {})
    return taps.setStatus(number, status)
  }))

  app.get('/api/taps/:number/history', route(async (req) => {
    const number = parseTapNumber(req)
    return taps.history(number)
  }))
}
