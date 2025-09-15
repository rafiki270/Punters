import { FastifyInstance } from 'fastify'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

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

    const hostname = os.hostname()
    let mdnsBase = hostname
    if (process.platform === 'darwin') {
      try {
        const execFileAsync = promisify(execFile)
        const { stdout } = await execFileAsync('scutil', ['--get', 'LocalHostName'])
        const macLocal = String(stdout || '').trim()
        if (macLocal) mdnsBase = macLocal
      } catch {
        // ignore; fall back to os.hostname()
      }
    }
    const mdnsHost = (() => {
      if (!mdnsBase) return undefined
      const hn = String(mdnsBase).trim()
      const v = hn.includes('.') ? hn : `${hn}.local`
      return v.toLowerCase()
    })()
    return { clientIp, serverIps, port, hostname, mdnsHost }
  })
}
