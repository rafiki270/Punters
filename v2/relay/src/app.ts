import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import { ZodError } from 'zod'
import { HttpError } from './core/errors'
import { uoaConfigRoutes } from './modules/uoa/config'
import { authRoutes } from './modules/auth/routes'
import { orgsRoutes } from './modules/orgs/routes'
import { catalogRoutes } from './modules/catalog/routes'

export async function buildRelayApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })

  await app.register(cors, { origin: true, credentials: true })
  await app.register(cookie)

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.statusCode).send({ error: err.message })
    if (err instanceof ZodError) {
      const first = err.errors[0]
      return reply.status(400).send({ error: `${first.path.join('.')}: ${first.message}` })
    }
    app.log.error(err)
    return reply.status(500).send({ error: 'Internal error' })
  })

  await app.register(uoaConfigRoutes)
  await app.register(authRoutes)
  await app.register(orgsRoutes)
  await app.register(catalogRoutes)

  app.get('/health', async () => ({ ok: true, service: 'punters-relay' }))

  return app
}
