import { FastifyInstance } from 'fastify'
import os from 'node:os'

export async function registerNetworkRoutes(app: FastifyInstance) {
  app.get('/api/ip', async (req) => {
    // Client IP as seen by server (respects proxies if configured upstream)
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req as any).ip || ''

    // Enumerate server network interfaces (IPv4, non-internal)
    const ifaces = os.networkInterfaces()
    const serverIps: Array<{ interface: string; address: string; family: string }> = []
    for (const [name, entries] of Object.entries(ifaces)) {
      for (const ent of entries || []) {
        if (ent.internal) continue
        serverIps.push({ interface: name, address: ent.address, family: ent.family })
      }
    }

    // Determine server listening port if available
    const addr = app.server.address() as any
    const port = (addr && typeof addr === 'object' && typeof addr.port === 'number')
      ? addr.port
      : Number(process.env.PORT || 3000)

    return { clientIp, serverIps, port }
  })
}
