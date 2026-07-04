import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { ZodError } from 'zod'
import { HttpError } from './core/errors'
import { MEDIA_ROOT } from './modules/media/service'
import { settingsRoutes } from './modules/settings/routes'
import { mediaRoutes } from './modules/media/routes'
import { catalogRoutes } from './modules/catalog/routes'
import { tapsRoutes } from './modules/taps/routes'
import { screensRoutes } from './modules/screens/routes'
import { displayRoutes } from './modules/display/routes'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })

  await app.register(cors, { origin: true })
  await app.register(multipart)

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
