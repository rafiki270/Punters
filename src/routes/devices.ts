import { FastifyInstance } from 'fastify'
import { requireAdmin } from '../auth'
import { prisma } from '../db'
import { emitChange } from '../events'
import { createDeviceService } from '../modules/devices/service'
import { route } from '../core/http'

export async function registerDeviceRoutes(app: FastifyInstance) {
  const devices = createDeviceService({ prisma, emitChange })

  app.get('/api/devices', route(async () => devices.list()))

  app.post('/api/devices', { preHandler: requireAdmin }, route(async (req) => devices.create((req as any).body)))

  app.put('/api/devices/:id', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    return devices.update(id, (req as any).body)
  }))

  app.delete('/api/devices/:id', { preHandler: requireAdmin }, route(async (req) => {
    const id = Number((req.params as any).id)
    return devices.remove(id)
  }))
}
