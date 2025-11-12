import { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError, ZodSchema } from 'zod'

export class HttpError extends Error {
  statusCode: number
  details?: unknown

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message)
    this.statusCode = statusCode
    this.details = details
  }
}

export function httpError(statusCode: number, message: string, details?: unknown) {
  return new HttpError(statusCode, message, details)
}

export function parseBody<T>(req: FastifyRequest, schema: ZodSchema<T>): T {
  try {
    return schema.parse((req as any).body ?? {})
  } catch (err) {
    if (err instanceof ZodError) {
      throw httpError(400, 'Invalid request body', err.flatten())
    }
    throw err
  }
}

export function parseQuery<T>(req: FastifyRequest, schema: ZodSchema<T>): T {
  try {
    return schema.parse((req as any).query ?? {})
  } catch (err) {
    if (err instanceof ZodError) {
      throw httpError(400, 'Invalid query params', err.flatten())
    }
    throw err
  }
}

export async function handleRouteError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) {
    return reply.code(err.statusCode).send({ error: err.message, details: err.details })
  }
  reply.log.error({ err }, 'route handler crashed')
  return reply.code(500).send({ error: 'Internal Server Error' })
}

export function route<Req extends FastifyRequest = FastifyRequest>(handler: (req: Req, reply: FastifyReply) => Promise<unknown> | unknown) {
  return async (req: Req, reply: FastifyReply) => {
    try {
      return await handler(req, reply)
    } catch (err) {
      return handleRouteError(reply, err)
    }
  }
}
