import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { ZodError } from 'zod'
import { HttpError } from './core/errors'
import { MEDIA_ROOT } from './modules/media/service'
import { settingsRoutes, getSettings } from './modules/settings/routes'
import { mediaRoutes } from './modules/media/routes'
import { catalogRoutes } from './modules/catalog/routes'
import { tapsRoutes } from './modules/taps/routes'
import { screensRoutes } from './modules/screens/routes'
import { displayRoutes } from './modules/display/routes'
import { authRoutes, SESSION_COOKIE } from './modules/auth/routes'
import { orgRoutes } from './modules/org/routes'
import { verifyRelaySession } from './core/relayClient'

// Public even when a venue is bound and auth is enforced: TVs never sign in, and the
// auth routes themselves must be reachable before a session exists.
const PUBLIC_API_PREFIXES = ['/api/display', '/api/auth', '/api/health']
// Individual TV-facing routes that live under an otherwise-admin-only prefix.
const PUBLIC_API_EXACT = new Set(['/api/screens/hello'])

function isPublicApiPath(url: string): boolean {
  const path = url.split('?')[0]
  return PUBLIC_API_EXACT.has(path) || PUBLIC_API_PREFIXES.some((p) => path.startsWith(p))
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })

  await app.register(cors, { origin: true, credentials: true })
  await app.register(cookie)
  await app.register(multipart)

  // Auth gate: every /api/* route requires a signed-in session except displays (TVs never
  // sign in) and the auth routes themselves. Once signed in, a not-yet-bound venue is
  // blocked from the rest of the admin API too — the frontend routes it through the
  // bind flow first (see AUTH_ARCHITECTURE.md's "Venue binding" section).
  app.addHook('onRequest', async (req, reply) => {
    if (process.env.AUTH_DISABLED === 'true') return // local dev convenience — never set this for a real venue
    if (!req.url.startsWith('/api/')) return
    if (isPublicApiPath(req.url)) return
    const token = req.cookies[SESSION_COOKIE]
    if (!token) return reply.status(401).send({ error: 'Sign in required' })
    try {
      await verifyRelaySession(token)
    } catch {
      return reply.status(401).send({ error: 'Sign in required' })
    }
    const settings = await getSettings()
    if (settings.orgId == null) return reply.status(428).send({ error: 'This venue is not bound to an organisation yet' })
  })

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.statusCode).send({ error: err.message })
    if (err instanceof ZodError) {
      const first = err.errors[0]
      return reply.status(400).send({ error: `${first.path.join('.')}: ${first.message}` })
    }
    app.log.error(err)
    return reply.status(500).send({ error: 'Internal error' })
  })

  // Optimized media renditions.
  mkdirSync(MEDIA_ROOT, { recursive: true })
  await app.register(fastifyStatic, {
    root: MEDIA_ROOT,
    prefix: '/media/',
    decorateReply: true,
    maxAge: '365d',
    immutable: true,
  })

  await app.register(authRoutes)
  await app.register(orgRoutes)
  await app.register(settingsRoutes)
  await app.register(mediaRoutes)
  await app.register(catalogRoutes)
  await app.register(tapsRoutes)
  await app.register(screensRoutes)
  await app.register(displayRoutes)

  app.get('/api/health', async () => ({ ok: true, version: 2 }))

  // Production: serve the built web app; '/' is the display, '/admin' the console.
  const webDist = path.resolve(process.cwd(), '../web/dist')
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      decorateReply: false,
    })
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/media/')) {
        return reply.status(404).send({ error: 'Not found' })
      }
      return reply.sendFile('index.html', webDist)
    })
  }

  return app
}
