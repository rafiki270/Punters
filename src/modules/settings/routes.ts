import { FastifyInstance } from 'fastify'
import { requireAdmin } from '../../auth'
import { emitChange } from '../../events'
import { setConfig } from '../../discovery'
import { prisma } from '../../db'
import { route } from '../../core/http'
import { SettingsUpdateSchema } from './schema'
import { createSettingsRepo } from './repo'
import { createSettingsService } from './service'

export async function registerSettingsRoutes(app: FastifyInstance) {
  const repo = createSettingsRepo(prisma)
  const service = createSettingsService({
    repo,
    emitChange,
    setDiscoveryConfig: setConfig,
  })

  app.get('/api/settings', route(async () => {
    return service.getSettings()
  }))

  app.put('/api/settings', { preHandler: requireAdmin }, route(async (req) => {
    const payload = SettingsUpdateSchema.parse((req as any).body ?? {})
    return service.updateSettings(payload)
  }))
}
