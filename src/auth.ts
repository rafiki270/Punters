import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from './db'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'punters-dev-secret'

export function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const settings = await prisma.globalSettings.findUnique({ where: { id: 1 } })
  if (!settings?.authEnabled) return // open access

  const auth = req.headers['authorization']
  const token = (auth && auth.startsWith('Bearer ')) ? auth.slice(7) : (req.cookies?.token as string | undefined)
  if (!token) {
    reply.code(401).send({ error: 'Unauthorized' })
    return
  }
  try {
    jwt.verify(token, JWT_SECRET)
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
    return
  }
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const body = (req as any).body as { password?: string }
    const password = body?.password || ''
    const s = await prisma.globalSettings.findUnique({ where: { id: 1 } })
    if (!s?.authEnabled || !s.adminPasswordHash) {
      return reply.code(400).send({ error: 'Auth not enabled' })
    }
    const ok = await bcrypt.compare(password, s.adminPasswordHash)
    if (!ok) return reply.code(401).send({ error: 'Invalid credentials' })
    const token = signToken({ role: 'admin' })
    reply.setCookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/' })
    return { token }
  })

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie('token', { path: '/' })
    return { ok: true }
  })

  app.get('/api/auth/status', async (req) => {
    const s = await prisma.globalSettings.findUnique({ where: { id: 1 } })
    const auth = req.headers['authorization']
    const token = (auth && auth.startsWith('Bearer ')) ? auth.slice(7) : (req.cookies?.token as string | undefined)
    let authenticated = false
    if (token) {
      try { jwt.verify(token, JWT_SECRET); authenticated = true } catch {}
    }
    return { authEnabled: !!s?.authEnabled, authenticated }
  })

  app.post('/api/auth/set-password', async (req, reply) => {
    const body = (req as any).body as { current?: string; password: string; confirm?: string; enable?: boolean }
    if (!body?.password || body.password.length < 4) return reply.code(400).send({ error: 'Password too short' })
    if (body.confirm !== undefined && body.confirm !== body.password) return reply.code(400).send({ error: 'Passwords do not match' })
    const s = await prisma.globalSettings.findUnique({ where: { id: 1 } })
    // If auth is enabled and a password exists, require current password to change it
    if (s?.authEnabled && s.adminPasswordHash) {
      if (!body.current) return reply.code(400).send({ error: 'Current password required' })
      const ok = await bcrypt.compare(body.current, s.adminPasswordHash)
      if (!ok) return reply.code(401).send({ error: 'Invalid current password' })
    }
    const hash = await bcrypt.hash(body.password, 10)
    const updated = await prisma.globalSettings.upsert({
      where: { id: 1 },
      update: { authEnabled: body.enable ?? true, adminPasswordHash: hash },
      create: { id: 1, themeMode: 'light', rotationSec: 90, defaultDisplayMode: 'all', currency: 'GBP', locale: 'en-GB', authEnabled: true, adminPasswordHash: hash }
    })
    return { authEnabled: updated.authEnabled }
  })
}
