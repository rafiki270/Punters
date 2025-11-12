import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { readdirSync } from 'node:fs'
import { promises as dns } from 'node:dns'
import Fastify, { FastifyInstance } from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import fastifyMultipart from '@fastify/multipart'
import cookie from '@fastify/cookie'
import { Server as IOServer } from 'socket.io'
import { z } from 'zod'
import { registerSettingsRoutes } from './modules/settings/routes'
import { registerSizeRoutes } from './routes/sizes'
import { registerBeerRoutes } from './routes/beers'
import { registerTapRoutes } from './routes/taps'
import { registerI18nRoutes } from './routes/i18n'
import { registerMediaRoutes } from './routes/media'
import { registerDeviceRoutes } from './routes/devices'
import { registerAuthRoutes, requireAdmin } from './auth'
import { registerAdminRoutes } from './routes/admin'
import { registerDisplayRoutes } from './routes/display'
import { registerNetworkRoutes } from './routes/network'
import { registerBackupRoutes } from './routes/backup'
import { onChange } from './events'
import { registerDrinkRoutes } from './routes/drinks'
import { startDiscovery, getDiscovered, suggestUniqueName, getMdnsHostByIp } from './discovery'
import { getClientPrefs, setClientPrefs } from './store/displayPrefs'
import { prisma } from './db'
import { AppConfig, loadConfig } from './core/config'
import { parseQuery, route } from './core/http'

const uniqueNameQuery = z.object({ base: z.string().min(1).optional() })

type DisplayState = { cycleOffset: number; anchorMs: number | null }
type DisplayClient = {
  id: string
  clientId?: string | null
  address?: string | null
  host?: string | null
  ua?: string | null
  label?: string | null
  showBeer?: boolean
  showDrinks?: boolean
  showMedia?: boolean
  screenIndex?: number
  screenCount?: number
  deviceId?: number | null
  connectedAt: number
}

export type BuildAppOptions = { config?: Partial<AppConfig> }

export async function buildApp(options: BuildAppOptions = {}) {
  const config = loadConfig(options.config ?? {})
  const app = Fastify({ logger: true })

  await app.register(fastifyCors, { origin: true })
  await app.register(fastifyMultipart, { limits: { fileSize: config.uploadLimitBytes } })
  await app.register(cookie)

  app.get('/api/health', route(async () => ({ status: 'ok' })))

  app.get('/api/mode', route(async () => {
    const s = await prisma.globalSettings.findUnique({ where: { id: 1 } })
    return { mode: (s?.mode as any) || 'server' }
  }))

  app.get('/api/discovery/servers', route(async () => getDiscovered()))
  app.get('/api/discovery/unique-name', route(async (req) => {
    const { base } = parseQuery(req, uniqueNameQuery)
    const fallback = base?.trim() || 'punters-server'
    const name = await suggestUniqueName(fallback)
    return { name }
  }))

  await registerSettingsRoutes(app)
  await registerSizeRoutes(app)
  await registerBeerRoutes(app)
  await registerDrinkRoutes(app)
  await registerTapRoutes(app)
  await registerI18nRoutes(app)
  await registerMediaRoutes(app)
  await registerDeviceRoutes(app)
  await registerAuthRoutes(app)
  await registerAdminRoutes(app)
  await registerNetworkRoutes(app)
  await registerBackupRoutes(app)

  await startDiscoveryForMode(config)
  await registerDisplayRoutes(app)

  await registerBackgroundStatic(app, config)
  registerBackgroundListRoute(app, config)
  await registerWebStatic(app, config)
  registerSpaFallback(app, config)

  const { io, displays, state } = setupDisplaySockets(app)
  registerDisplayApi(app, io, displays, state)
  bridgeDomainEvents(io)
  startTick(io)

  return { app, config, io }
}

async function startDiscoveryForMode(config: AppConfig) {
  try {
    const s = await prisma.globalSettings.findUnique({ where: { id: 1 } })
    const mode = (s?.mode as any) || 'server'
    const preferredName = os.hostname() || 'punters-server'
    startDiscovery(config.port, mode, preferredName)
  } catch {
    startDiscovery(config.port, 'server', os.hostname() || 'punters-server')
  }
}

async function registerBackgroundStatic(app: FastifyInstance, config: AppConfig) {
  try {
    if (fs.existsSync(config.backgroundsDir)) {
      await app.register(fastifyStatic, {
        root: config.backgroundsDir,
        prefix: '/bcg/',
        decorateReply: false,
      })
    } else {
      app.log.warn({ root: config.backgroundsDir }, 'background preset dir not found; /bcg/* will be unavailable')
    }
  } catch (err) {
    app.log.warn({ err }, 'failed to register /bcg static')
  }
}

function registerBackgroundListRoute(app: FastifyInstance, config: AppConfig) {
  app.get('/api/backgrounds', route(async () => {
    try {
      const files = readdirSync(config.backgroundsDir, { withFileTypes: true })
        .filter((d: any) => d.isFile())
        .map((d: any) => d.name)
        .filter((n: string) => /\.(png|jpg|jpeg|gif|webp)$/i.test(n))
        .sort((a: string, b: string) => a.localeCompare(b))
      return files.map((f: string) => ({ path: `/bcg/${encodeURIComponent(f)}`, name: f }))
    } catch {
      return [] as Array<{ path: string; name: string }>
    }
  }))
}

async function registerWebStatic(app: FastifyInstance, config: AppConfig) {
  if (fs.existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, {
      root: config.webDistDir,
      prefix: '/',
      decorateReply: false,
    })
  } else {
    app.log.warn({ root: config.webDistDir }, 'web/dist not found; skipping static serving (dev mode)')
  }
}

function registerSpaFallback(app: FastifyInstance, config: AppConfig) {
  const indexPath = path.join(config.webDistDir, 'index.html')
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) {
      reply.code(404).send({ error: 'Not found' })
      return
    }
    if (!fs.existsSync(indexPath)) {
      reply.code(404).send({ error: 'Not found' })
      return
    }
    reply.type('text/html').send(fs.readFileSync(indexPath, 'utf8'))
  })
}

function setupDisplaySockets(app: FastifyInstance) {
  const io = new IOServer(app.server, { cors: { origin: true } })
  const displays = new Map<string, DisplayClient>()
  const state: DisplayState = { cycleOffset: 0, anchorMs: null }

  io.on('connection', (socket) => {
    app.log.info({ id: socket.id }, 'socket connected')
    socket.on('register_display', async (p: { screenIndex?: number; screenCount?: number; deviceId?: number | null; clientIp?: string; label?: string; clientId?: string }) => {
      const fwd = (socket.handshake.headers['x-forwarded-for'] as string | undefined) || (socket.handshake.headers['x-real-ip'] as string | undefined)
      const forwardedIp = fwd ? fwd.split(',')[0].trim() : undefined
      const remoteAddr = (p as any)?.clientIp || forwardedIp || socket.handshake.address || (socket.conn as any)?.remoteAddress || null
      const ipNorm = remoteAddr && remoteAddr.startsWith('::ffff:') ? remoteAddr.slice(7) : remoteAddr
      const isLoopback = !!ipNorm && (ipNorm === '::1' || ipNorm.startsWith('127.'))

      const info: DisplayClient = {
        id: socket.id,
        clientId: (typeof p?.clientId === 'string' && p.clientId) ? p.clientId : null,
        address: remoteAddr,
        host: isLoopback ? (os.hostname() || null) : null,
        ua: (socket.handshake.headers['user-agent'] as string | undefined) || null,
        label: (typeof p?.label === 'string' && p.label.trim()) ? p.label.trim() : null,
        showBeer: true,
        showDrinks: true,
        showMedia: false,
        screenIndex: (typeof p?.screenIndex === 'number' && p.screenIndex > 0) ? p.screenIndex : undefined,
        screenCount: (typeof p?.screenCount === 'number' && p.screenCount > 0) ? p.screenCount : undefined,
        deviceId: typeof p?.deviceId === 'number' ? p.deviceId : null,
        connectedAt: Date.now(),
      }

      try {
        if (info.clientId) {
          const pref = await getClientPrefs(info.clientId)
          if (pref) {
            if (typeof pref.label === 'string') info.label = pref.label
            if (typeof pref.showBeer === 'boolean') info.showBeer = pref.showBeer
            if (typeof pref.showDrinks === 'boolean') info.showDrinks = pref.showDrinks
            if (typeof pref.showMedia === 'boolean') info.showMedia = pref.showMedia
          }
        }
      } catch {}

      displays.set(socket.id, info)
      app.log.info({ id: socket.id, info }, 'display registered')

      if (!info.host && info.address) {
        const ip = info.address.startsWith('::ffff:') ? info.address.slice(7) : info.address
        const mdns = getMdnsHostByIp(ip)
        if (mdns) {
          const d = displays.get(socket.id)
          if (d) {
            d.host = mdns
            displays.set(socket.id, d)
          }
        } else {
          dns.reverse(ip).then(names => {
            const d = displays.get(socket.id)
            if (!d) return
            d.host = (names && names[0]) ? names[0] : null
            displays.set(socket.id, d)
          }).catch(() => {})
        }
      }

      const d = displays.get(socket.id)
      if (d) {
        const used = new Set<number>()
        for (const [id, val] of displays.entries()) {
          if (id === socket.id) continue
          if (typeof val.screenIndex === 'number' && val.screenIndex > 0) used.add(val.screenIndex)
        }
        let idx = (typeof d.screenIndex === 'number' && d.screenIndex > 0) ? d.screenIndex : 1
        while (used.has(idx)) idx += 1
        d.screenIndex = idx
        d.screenCount = Math.max(used.size + 1, d.screenCount || 1)
        displays.set(socket.id, d)
        const countAll = displays.size
        for (const [cid, val] of displays.entries()) {
          const currentIdx = (typeof val.screenIndex === 'number' && val.screenIndex > 0) ? val.screenIndex : 1
          io.to(cid).emit('set_screen', { screenIndex: currentIdx, screenCount: countAll })
        }
      }
    })

    socket.on('update_client', (p: { clientIp?: string }) => {
      try {
        const d = displays.get(socket.id)
        if (!d) return
        if (p?.clientIp && typeof p.clientIp === 'string') {
          d.address = p.clientIp
          const ip = d.address.startsWith('::ffff:') ? d.address.slice(7) : d.address
          const mdns = getMdnsHostByIp(ip)
          if (mdns) d.host = mdns
          else dns.reverse(ip).then(names => {
            const cur = displays.get(socket.id)
            if (!cur) return
            cur.host = (names && names[0]) ? names[0] : null
            displays.set(socket.id, cur)
          }).catch(() => {})
          displays.set(socket.id, d)
        }
      } catch {}
    })

    socket.on('unregister_display', () => {
      displays.delete(socket.id)
      app.log.info({ id: socket.id }, 'display unregistered')
    })

    socket.emit('sync_state', { cycleOffset: state.cycleOffset, anchorMs: state.anchorMs })

    socket.on('sync_now', () => {
      state.anchorMs = Date.now()
      io.emit('sync_state', { cycleOffset: state.cycleOffset, anchorMs: state.anchorMs })
    })

    socket.on('next_page', () => {
      state.cycleOffset += 1
      io.emit('sync_state', { cycleOffset: state.cycleOffset, anchorMs: state.anchorMs })
    })

    socket.on('disconnect', () => {
      displays.delete(socket.id)
      app.log.info({ id: socket.id }, 'socket disconnected')
      const countAll = displays.size
      for (const [cid, val] of displays.entries()) {
        const idx = (typeof val.screenIndex === 'number' && val.screenIndex > 0) ? val.screenIndex : 1
        io.to(cid).emit('set_screen', { screenIndex: idx, screenCount: countAll })
      }
    })
  })

  return { io, displays, state }
}

function registerDisplayApi(app: FastifyInstance, io: IOServer, displays: Map<string, DisplayClient>, state: DisplayState) {
  app.get('/api/clients/displays', async () => {
    const vals = Array.from(displays.values())
    const withIdx = vals.filter(v => typeof v.screenIndex === 'number' && (v.screenIndex as number) > 0)
    const withoutIdx = vals.filter(v => !(typeof v.screenIndex === 'number' && (v.screenIndex as number) > 0))
    withIdx.sort((a, b) => (Number(a.screenIndex) - Number(b.screenIndex)))
    withoutIdx.sort((a, b) => (a.connectedAt - b.connectedAt))
    const ordered = [...withIdx, ...withoutIdx]
    return ordered.map((x, i) => ({
      id: x.id,
      n: i + 1,
      address: x.address || undefined,
      host: x.host || undefined,
      ua: x.ua || undefined,
      label: x.label || undefined,
      showBeer: x.showBeer ?? true,
      showDrinks: x.showDrinks ?? true,
      showMedia: x.showMedia ?? false,
      screenIndex: x.screenIndex,
      screenCount: x.screenCount,
      deviceId: x.deviceId ?? undefined,
    }))
  })

  app.post('/api/clients/displays/:id/label', { preHandler: requireAdmin }, async (req, reply) => {
    const id = String((req.params as any).id)
    const body = (req as any).body || {}
    const label = (typeof body?.label === 'string') ? body.label.trim() : ''
    const d = displays.get(id)
    if (!d) return reply.code(404).send({ error: 'Display not connected' })
    d.label = label || null
    displays.set(id, d)
    try { if (d.clientId) await setClientPrefs(d.clientId, { label: d.label || '' }) } catch {}
    try { io.to(id).emit('set_label', { label: d.label || '' }) } catch {}
    return { ok: true }
  })

  app.post('/api/clients/displays/layout', { preHandler: requireAdmin }, async (req, reply) => {
    try {
      const body = (req as any).body || {}
      const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : []
      if (!ids.length) return reply.code(400).send({ error: 'ids required' })
      const total = ids.length
      ids.forEach((id, idx) => {
        const d = displays.get(id)
        if (d) {
          d.screenIndex = idx + 1
          d.screenCount = total
          displays.set(id, d)
          io.to(id).emit('set_screen', { screenIndex: d.screenIndex, screenCount: d.screenCount })
        }
      })
      const now = Date.now()
      state.anchorMs = now
      io.emit('sync_state', { anchorMs: now })
      io.emit('admin_changed', { kind: 'layout' })
      return { ok: true }
    } catch (e) {
      return reply.code(500).send({ error: 'failed' })
    }
  })

  app.post('/api/clients/sync-now', { preHandler: requireAdmin }, async () => {
    const now = Date.now()
    state.anchorMs = now
    io.emit('sync_state', { anchorMs: state.anchorMs, cycleOffset: state.cycleOffset })
    return { ok: true }
  })

  app.post('/api/clients/reload', { preHandler: requireAdmin }, async () => {
    io.emit('reload', { hard: true })
    return { ok: true }
  })

  app.post('/api/clients/displays/:id/content', { preHandler: requireAdmin }, async (req, reply) => {
    const id = String((req.params as any).id)
    const sock = io.sockets.sockets.get(id)
    if (!sock) return reply.code(404).send({ error: 'Display not connected' })
    const body = (req as any).body || {}
    const showBeer = !!body.showBeer
    const showDrinks = !!body.showDrinks
    const showMedia = !!body.showMedia
    const d = displays.get(id)
    if (d) {
      d.showBeer = showBeer
      d.showDrinks = showDrinks
      d.showMedia = showMedia
      displays.set(id, d)
    }
    try { if (d?.clientId) await setClientPrefs(d.clientId, { showBeer, showDrinks, showMedia }) } catch {}
    io.to(id).emit('set_content', { showBeer, showDrinks, showMedia })
    io.emit('admin_changed', { kind: 'content', id })
    return { ok: true }
  })

  app.post('/api/clients/displays/:id/identify', { preHandler: requireAdmin }, async (req, reply) => {
    const id = String((req.params as any).id)
    const body = (req as any).body || {}
    const n = Number(body.n)
    const secs = Number(body.secs) || 5
    if (!io.sockets.sockets.get(id)) return reply.code(404).send({ error: 'Display not connected' })
    io.to(id).emit('identify', { n: Number.isFinite(n) ? n : undefined, secs })
    return { ok: true }
  })
}

function bridgeDomainEvents(io: IOServer) {
  onChange((p) => {
    io.emit('changed', p)
  })
}

function startTick(io: IOServer) {
  setInterval(() => {
    const epoch = Date.now()
    io.emit('tick', { epoch })
  }, 1000)
}
