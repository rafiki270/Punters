import path from 'node:path';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { Server as IOServer } from 'socket.io';
import { registerSettingsRoutes } from './routes/settings';
import { registerSizeRoutes } from './routes/sizes';
import { registerBeerRoutes } from './routes/beers';
import { registerTapRoutes } from './routes/taps';
import { registerI18nRoutes } from './routes/i18n';
import { registerMediaRoutes } from './routes/media';
import { registerDeviceRoutes } from './routes/devices';
import { registerAuthRoutes } from './auth';
import { registerAdminRoutes } from './routes/admin';
import { registerDisplayRoutes } from './routes/display';
import { registerNetworkRoutes } from './routes/network';
import { registerBackupRoutes } from './routes/backup';
import { onChange } from './events';
import { startDiscovery, getDiscovered, suggestUniqueName } from './discovery';
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
    const preferredName = (s as any)?.instanceName || (mode === 'server' ? 'punters-server' : 'punters-client')
    startDiscovery(PORT, mode, preferredName)
  } catch {
    startDiscovery(PORT, 'server', 'punters-server')
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
  // Global sync state (memory-only)
  let cycleOffset = 0;
  let anchorMs: number | null = null; // if set, cycles derive from (epoch - anchorMs)
  io.on('connection', (socket) => {
    app.log.info({ id: socket.id }, 'socket connected');
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
    socket.on('disconnect', () => app.log.info({ id: socket.id }, 'socket disconnected'));
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
