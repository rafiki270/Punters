import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../core/prisma'
import { httpError } from '../../core/errors'
import { verifyRelaySession, relay } from '../../core/relayClient'
import { getSettings } from '../settings/routes'

export const SESSION_COOKIE = 'punters_session'

async function currentSession(req: { cookies: Record<string, string | undefined> }) {
  const token = req.cookies[SESSION_COOKIE]
  if (!token) return null
  try {
    return { token, ...(await verifyRelaySession(token)) }
  } catch {
    return null
  }
}

export async function authRoutes(app: FastifyInstance) {
  // Public: the web bundle has no build-time knowledge of the relay's public address,
  // so it asks the local server (which does, via env) where to send the browser.
  app.get('/api/auth/config', async () => ({
    loginUrl: `${process.env.RELAY_PUBLIC_URL ?? process.env.RELAY_URL ?? 'http://localhost:4100'}/login/start`,
  }))

  app.get('/api/auth/me', async (req) => {
    const session = await currentSession(req)
    const settings = await getSettings()
    if (!session) return { authenticated: false, venueBound: settings.orgId != null }
    return {
      authenticated: true,
      user: { sub: session.sub, email: session.email },
      venueBound: settings.orgId != null,
      org: settings.orgId ? { id: settings.orgId, name: settings.orgName } : null,
      team: settings.teamId ? { id: settings.teamId, name: settings.teamName } : null,
    }
  })

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })

  // Hit directly by the browser after the relay's OAuth chain completes (see
  // AUTH_ARCHITECTURE.md) — exchanges the one-time ticket for a real session, server-to-
  // server, so the signed token never appears in a URL or browser history on this hop either.
  app.get('/admin/auth/callback', async (req, reply) => {
    const { ticket } = z.object({ ticket: z.string() }).parse(req.query)
    const { sessionToken } = await relay.exchangeTicket(ticket)
    reply.setCookie(SESSION_COOKIE, sessionToken, { httpOnly: true, sameSite: 'lax', path: '/' })
    return reply.redirect('/admin')
  })

  app.get('/api/auth/relay-memberships', async (req) => {
    const session = await currentSession(req)
    if (!session) throw httpError(401, 'Not signed in')
    return relay.memberships(session.token)
  })

  app.post('/api/auth/create-organisation', async (req) => {
    const session = await currentSession(req)
    if (!session) throw httpError(401, 'Not signed in')
    const { name } = z.object({ name: z.string().trim().min(1) }).parse(req.body)
    return relay.createOrganisation(session.token, name)
  })

  app.post('/api/auth/create-venue', async (req) => {
    const session = await currentSession(req)
    if (!session) throw httpError(401, 'Not signed in')
    const { orgId, name } = z.object({ orgId: z.number().int(), name: z.string().trim().min(1) }).parse(req.body)
    return relay.createVenue(session.token, orgId, name)
  })

  // One-time: binds this physical server to a venue. Immutable once set, like `mode`.
  app.post('/api/auth/bind', async (req) => {
    const session = await currentSession(req)
    if (!session) throw httpError(401, 'Not signed in')
    const settings = await getSettings()
    if (settings.orgId != null) throw httpError(409, 'This server is already bound to a venue')
    const { teamId } = z.object({ teamId: z.number().int() }).parse(req.body)
    const bound = await relay.bindVenue(session.token, teamId)
    await prisma.settings.update({
      where: { id: 1 },
      data: {
        orgId: bound.orgId,
        orgName: bound.orgName,
        teamId: bound.teamId,
        teamName: bound.teamName,
        relayServiceToken: bound.serviceToken,
        venueName: bound.teamName,
      },
    })
    return { ok: true }
  })
}
