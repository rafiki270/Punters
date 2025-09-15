import path from 'node:path';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { Server as IOServer } from 'socket.io';
import { promises as dns } from 'node:dns';
import { registerSettingsRoutes } from './routes/settings';
import { registerSizeRoutes } from './routes/sizes';
import { registerBeerRoutes } from './routes/beers';
import { registerTapRoutes } from './routes/taps';
import { registerI18nRoutes } from './routes/i18n';
import { registerMediaRoutes } from './routes/media';
import { registerDeviceRoutes } from './routes/devices';
import { registerAuthRoutes, requireAdmin } from './auth';
import { registerAdminRoutes } from './routes/admin';
import { registerDisplayRoutes } from './routes/display';
import { registerNetworkRoutes } from './routes/network';
import { registerBackupRoutes } from './routes/backup';
import { onChange } from './events';
import { registerDrinkRoutes } from './routes/drinks';
import { startDiscovery, getDiscovered, suggestUniqueName, getMdnsHostByIp } from './discovery';
import { getClientPrefs, setClientPrefs } from './store/displayPrefs';
import os from 'node:os';
import { prisma } from './db';
import cookie from '@fastify/cookie';
import fs from 'node:fs';
import { readdirSync } from 'node:fs';

const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 3000);

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 50 * 1024 * 1024 // 50 MB
    }
  });
  await app.register(cookie);

  // Basic health
  app.get('/api/health', async () => ({ status: 'ok' }));

  // API routes
  app.get('/api/mode', async () => {
    const s = await prisma.globalSettings.findUnique({ where: { id: 1 } })
    return { mode: (s?.mode as any) || 'server' }
  })
  app.get('/api/discovery/servers', async () => getDiscovered())
  app.get('/api/discovery/unique-name', async (req) => {
    const q = (req as any).query || {}
    const base = String(q.base || '').trim() || 'punters-server'
    const name = await suggestUniqueName(base)
    return { name }
  })
  await registerSettingsRoutes(app);
  await registerSizeRoutes(app);
  await registerBeerRoutes(app);
  await registerDrinkRoutes(app);
  await registerTapRoutes(app);
  await registerI18nRoutes(app);
  await registerMediaRoutes(app);
  await registerDeviceRoutes(app);
  await registerAuthRoutes(app);
  await registerAdminRoutes(app);
  await registerNetworkRoutes(app);
  await registerBackupRoutes(app);
  // Start discovery/advertisement based on settings
  try {
    const s = await prisma.globalSettings.findUnique({ where: { id: 1 } })
    const mode = (s?.mode as any) || 'server'
    const preferredName = (os.hostname() || 'punters-server')
    startDiscovery(PORT, mode, preferredName)
  } catch {
    startDiscovery(PORT, 'server', os.hostname() || 'punters-server')
  }
  await registerDisplayRoutes(app);

  // Serve background preset images from web/public/bcg at /bcg/*
  try {
    const bcgDir = path.join(process.cwd(), 'web', 'public', 'bcg');
    if (fs.existsSync(bcgDir)) {
      await app.register(fastifyStatic, {
        root: bcgDir,
        prefix: '/bcg/',
        decorateReply: false,
      });
    } else {
      app.log.warn({ root: bcgDir }, 'background preset dir not found; /bcg/* will be unavailable');
    }
  } catch (e) {
    app.log.warn({ err: (e as any)?.message }, 'failed to register /bcg static');
  }

  // List background images from web/public/bcg
  app.get('/api/backgrounds', async () => {
    try {
      const dir = path.join(process.cwd(), 'web', 'public', 'bcg');
      const files = readdirSync(dir, { withFileTypes: true })
        .filter((d: any) => d.isFile())
        .map((d: any) => d.name)
        .filter((n: string) => /\.(png|jpg|jpeg|gif|webp)$/i.test(n))
        .sort((a: string,b: string)=> a.localeCompare(b));
      return files.map((f: string) => ({ path: `/bcg/${encodeURIComponent(f)}`, name: f }));
    } catch {
      return [] as Array<{ path: string; name: string }>;
    }
  });

  // Static: serve built web app if present
  const webDist = path.join(process.cwd(), 'web', 'dist');
  if (fs.existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      decorateReply: false
    });
  } else {
    app.log.warn({ root: webDist }, 'web/dist not found; skipping static serving (dev mode)')
  }
  // Media served via API /api/assets/:id/content (DB-backed)

  // SPA fallback for non-API routes in production
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) {
      reply.code(404).send({ error: 'Not found' });
      return;
    }
    // Try to serve index.html
    const indexPath = path.join(webDist, 'index.html');
    reply.type('text/html').send(require('fs').readFileSync(indexPath, 'utf8'));
  });

  // Socket.IO
  const io = new IOServer(app.server, { cors: { origin: true } });
  // Track connected display browsers (memory-only)
  type DisplayClient = { id: string; clientId?: string|null; address?: string|null; host?: string|null; ua?: string|null; label?: string|null; showBeer?: boolean; showDrinks?: boolean; showMedia?: boolean; screenIndex?: number; screenCount?: number; deviceId?: number|null; connectedAt: number }
  const displays = new Map<string, DisplayClient>()
  // Global sync state (memory-only)
  let cycleOffset = 0;
  let anchorMs: number | null = null; // if set, cycles derive from (epoch - anchorMs)
  io.on('connection', (socket) => {
    app.log.info({ id: socket.id }, 'socket connected');
    // Register display clients
    socket.on('register_display', async (p: { screenIndex?: number; screenCount?: number; deviceId?: number|null; clientIp?: string; label?: string; clientId?: string }) => {
      const fwd = (socket.handshake.headers['x-forwarded-for'] as string | undefined) || (socket.handshake.headers['x-real-ip'] as string | undefined)
      const forwardedIp = fwd ? fwd.split(',')[0].trim() : undefined
      const remoteAddr = (p as any)?.clientIp || forwardedIp || socket.handshake.address || (socket.conn as any)?.remoteAddress || null
      // Normalize IP and detect local loopback
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
      // Load persisted prefs if clientId provided
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
      // Try reverse DNS for a friendly host label (non-blocking)
      if (!info.host && info.address) {
        // Strip IPv6-mapped IPv4 prefix if present
        const ip = info.address.startsWith('::ffff:') ? info.address.slice(7) : info.address
        // First, try mDNS workstation mapping
        const mdns = getMdnsHostByIp(ip)
        if (mdns) {
          const d = displays.get(socket.id)
          if (d) { d.host = mdns; displays.set(socket.id, d) }
        } else {
          dns.reverse(ip).then(names => {
          const d = displays.get(socket.id)
          if (!d) return
          d.host = (names && names[0]) ? names[0] : null
          displays.set(socket.id, d)
        }).catch(() => {})
        }
      }
      // Normalize: ensure unique screenIndex per connected client and consistent screenCount
      const d = displays.get(socket.id)
      if (d) {
        // Build set of used indices excluding current client
        const used = new Set<number>()
        for (const [id, val] of displays.entries()) {
          if (id === socket.id) continue
          if (typeof val.screenIndex === 'number' && val.screenIndex > 0) used.add(val.screenIndex)
        }
        let idx = (typeof d.screenIndex === 'number' && d.screenIndex > 0) ? d.screenIndex : 1
        // If index is already used, pick the smallest free positive integer
        while (used.has(idx)) idx += 1
        d.screenIndex = idx
        // Set screenCount to number of connected displays (upper bound for rotation window)
        d.screenCount = Math.max(used.size + 1, d.screenCount || 1)
      displays.set(socket.id, d)
      // Broadcast consistent screenCount to all clients
      const countAll = displays.size
      for (const [cid, val] of displays.entries()) {
        const idx = (typeof val.screenIndex === 'number' && val.screenIndex > 0) ? val.screenIndex : 1
        io.to(cid).emit('set_screen', { screenIndex: idx, screenCount: countAll })
      }
      }
    })
    // Allow client to update its observed IP after connect (from /api/ip)
    socket.on('update_client', (p: { clientIp?: string }) => {
      try {
        const d = displays.get(socket.id)
        if (!d) return
        if (p?.clientIp && typeof p.clientIp === 'string') {
          d.address = p.clientIp
          // Re-resolve hostname via mDNS or reverse DNS
          const ip = d.address.startsWith('::ffff:') ? d.address.slice(7) : d.address
          const mdns = getMdnsHostByIp(ip)
          if (mdns) d.host = mdns
          else dns.reverse(ip).then(names => {
            const cur = displays.get(socket.id)
            if (!cur) return
            cur.host = (names && names[0]) ? names[0] : null
            displays.set(socket.id, cur)
          }).catch(()=>{})
          displays.set(socket.id, d)
        }
      } catch {}
    })
    socket.on('unregister_display', () => {
      displays.delete(socket.id)
      app.log.info({ id: socket.id }, 'display unregistered')
    })
    // Send current sync state to new connections
    socket.emit('sync_state', { cycleOffset, anchorMs });
    // Allow clients (admin UI) to synchronize now or advance page globally
    socket.on('sync_now', () => {
      anchorMs = Date.now();
      io.emit('sync_state', { cycleOffset, anchorMs });
    });
    socket.on('next_page', () => {
      cycleOffset += 1;
      io.emit('sync_state', { cycleOffset, anchorMs });
    });
    socket.on('disconnect', () => {
      displays.delete(socket.id)
      app.log.info({ id: socket.id }, 'socket disconnected')
      // Keep indices, but update everyone with new screenCount
      const countAll = displays.size
      for (const [cid, val] of displays.entries()) {
        const idx = (typeof val.screenIndex === 'number' && val.screenIndex > 0) ? val.screenIndex : 1
        io.to(cid).emit('set_screen', { screenIndex: idx, screenCount: countAll })
      }
    });
  });

  // Bridge internal change events to clients
  onChange((p) => {
    io.emit('changed', p);
  });

  // Tick broadcaster
  setInterval(async () => {
    const epoch = Date.now();
    io.emit('tick', { epoch });
  }, 1000);

  // API: list connected display browsers
  app.get('/api/clients/displays', async () => {
    const vals = Array.from(displays.values())
    const withIdx = vals.filter(v => typeof v.screenIndex === 'number' && (v.screenIndex as number) > 0)
    const withoutIdx = vals.filter(v => !(typeof v.screenIndex === 'number' && (v.screenIndex as number) > 0))
    withIdx.sort((a,b) => (Number(a.screenIndex) - Number(b.screenIndex)))
    withoutIdx.sort((a,b) => (a.connectedAt - b.connectedAt))
    const ordered = [...withIdx, ...withoutIdx]
    return ordered.map((x, i) => ({
      id: x.id,
      // UI label index: contiguous 1..N for display order
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

  // Set a friendly label for a specific display (persisted in memory; client also receives and can store locally)
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
  // API: set display layout order (drag-and-drop from admin)
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
      // Sync all displays to the same anchor time so pages rotate together
      const now = Date.now()
      io.emit('sync_state', { anchorMs: now })
      io.emit('admin_changed', { kind: 'layout' })
      return { ok: true }
    } catch (e) {
      return reply.code(500).send({ error: 'failed' })
    }
  })

  // API: manual sync-now (like old Sync button)
  app.post('/api/clients/sync-now', { preHandler: requireAdmin }, async (_req, _reply) => {
    const now = Date.now()
    anchorMs = now
    io.emit('sync_state', { anchorMs, cycleOffset })
    return { ok: true }
  })

  // API: request all connected display browsers to hard-refresh
  app.post('/api/clients/reload', { preHandler: requireAdmin }, async (_req, _reply) => {
    io.emit('reload', { hard: true })
    return { ok: true }
  })

  // API: set display content (per browser)
  app.post('/api/clients/displays/:id/content', { preHandler: requireAdmin }, async (req, reply) => {
    const id = String((req.params as any).id)
    const sock = io.sockets.sockets.get(id)
    if (!sock) return reply.code(404).send({ error: 'Display not connected' })
    const body = (req as any).body || {}
    const showBeer = !!body.showBeer
    const showDrinks = !!body.showDrinks
    const showMedia = !!body.showMedia
    const d = displays.get(id)
    if (d) { d.showBeer = showBeer; d.showDrinks = showDrinks; d.showMedia = showMedia; displays.set(id, d) }
    try { if (d?.clientId) await setClientPrefs(d.clientId, { showBeer, showDrinks, showMedia }) } catch {}
    io.to(id).emit('set_content', { showBeer, showDrinks, showMedia })
    io.emit('admin_changed', { kind: 'content', id })
    return { ok: true }
  })

  // API: ask a specific display to show its identifier
  app.post('/api/clients/displays/:id/identify', { preHandler: requireAdmin }, async (req, reply) => {
    const id = String((req.params as any).id)
    const body = (req as any).body || {}
    const n = Number(body.n)
    const secs = Number(body.secs) || 5
    if (!io.sockets.sockets.get(id)) return reply.code(404).send({ error: 'Display not connected' })
    io.to(id).emit('identify', { n: Number.isFinite(n) ? n : undefined, secs })
    return { ok: true }
  })

  return app;
}

buildServer()
  .then((app) => app.listen({ port: PORT, host: '0.0.0.0' }))
  .then(() => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://localhost:${PORT}`);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
