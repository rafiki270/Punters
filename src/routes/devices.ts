import { FastifyInstance } from 'fastify'
import { prisma } from '../db'
import { z } from 'zod'
import { requireAdmin } from '../auth'

const DeviceCreate = z.object({
  name: z.string().min(1),
  role: z.enum(['main', 'client']).default('client'),
  screenGroupId: z.number().int().nullable().optional(),
  screenIndex: z.number().int().min(1).default(1),
  displayMode: z.enum(['inherit', 'all', 'beer', 'ads']).default('inherit'),
  beerColumns: z.number().int().min(1).max(4).default(1),
  itemsPerColumn: z.number().int().min(1).max(30).default(10),
  // Optional style overrides
  cellScale: z.number().int().min(0).max(100).nullable().optional(),
  columnGap: z.number().int().min(0).max(200).nullable().optional(),
  logoPosition: z.enum(['top-left','top-right','bottom-left','bottom-right']).nullable().optional(),
  logoScale: z.number().int().min(10).max(300).nullable().optional(),
  bgPosition: z.enum(['center','top','bottom','left','right']).nullable().optional(),
  bgScale: z.number().int().min(50).max(300).nullable().optional(),
})

const DeviceUpdate = DeviceCreate.partial()

export async function registerDeviceRoutes(app: FastifyInstance) {
  app.get('/api/devices', async () => prisma.device.findMany({ orderBy: { id: 'asc' } }))

  app.post('/api/devices', { preHandler: requireAdmin }, async (req) => {
    const data = DeviceCreate.parse((req as any).body)
    return prisma.device.create({ data })
  })

  app.put('/api/devices/:id', { preHandler: requireAdmin }, async (req) => {
    const id = Number((req.params as any).id)
    const data = DeviceUpdate.parse((req as any).body)
    return prisma.device.update({ where: { id }, data })
  })

  app.delete('/api/devices/:id', { preHandler: requireAdmin }, async (req) => {
    const id = Number((req.params as any).id)
    await prisma.device.delete({ where: { id } })
    return { ok: true }
  })
}
