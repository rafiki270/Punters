import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { decodeJwt } from 'jose'
import { prisma } from '../../core/prisma'
import { httpError } from '../../core/errors'
import { publicJwk, sessionSigningKey } from '../../core/keys'
import { newCodeVerifier, codeChallengeFor, newOpaqueId } from './pkce'
import { exchangeCode } from '../uoa/client'
import { mintSessionToken } from './session'

// __Host- prefixed cookies require Secure + Path=/ + no Domain attribute — browsers
// silently refuse to store them otherwise. Secure cookies also require an actual HTTPS
// origin, so local (http) dev falls back to a plain, non-prefixed cookie.
const IS_HTTPS = (process.env.RELAY_PUBLIC_URL ?? '').startsWith('https://')
const STATE_COOKIE = IS_HTTPS ? '__Host-punters_state' : 'punters_state'
const PKCE_TTL_MS = 5 * 60_000
const TICKET_TTL_MS = 60_000

async function bootstrapMemberships(
  userId: number,
  firstLogin: NonNullable<Awaited<ReturnType<typeof exchangeCode>>['firstLogin']>,
) {
  // UOA's firstLogin payload gives ids + roles but no human-readable names (see
  // AUTH_ARCHITECTURE.md) — placeholder names are renamable from the org settings panel.
  for (const org of firstLogin.memberships.orgs) {
    const organisation = await prisma.organisation.upsert({
      where: { uoaOrgId: org.orgId },
      update: {},
      create: { uoaOrgId: org.orgId, name: `Organisation ${org.orgId.slice(-6)}` },
    })
    await prisma.membership.upsert({
      where: { userId_organisationId_teamId: { userId, organisationId: organisation.id, teamId: null as unknown as number } },
      update: { orgRole: org.role },
      create: { userId, organisationId: organisation.id, teamId: null, orgRole: org.role },
    })
  }
  for (const team of firstLogin.memberships.teams) {
    const organisation = await prisma.organisation.upsert({
      where: { uoaOrgId: team.orgId },
      update: {},
      create: { uoaOrgId: team.orgId, name: `Organisation ${team.orgId.slice(-6)}` },
    })
    const teamRow = await prisma.team.upsert({
      where: { uoaTeamId: team.teamId },
      update: {},
      create: { uoaTeamId: team.teamId, organisationId: organisation.id, name: `Venue ${team.teamId.slice(-6)}` },
    })
    const orgRole = firstLogin.memberships.orgs.find((o) => o.orgId === team.orgId)?.role ?? 'member'
    await prisma.membership.upsert({
      where: { userId_organisationId_teamId: { userId, organisationId: organisation.id, teamId: teamRow.id } },
      update: { teamRole: team.role },
      create: { userId, organisationId: organisation.id, teamId: teamRow.id, orgRole, teamRole: team.role },
    })
  }
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/login/start', async (req, reply) => {
    const { returnTo } = z.object({ returnTo: z.string().url() }).parse(req.query)

    const codeVerifier = newCodeVerifier()
    const stateId = newOpaqueId()
    await prisma.pkceState.create({
      data: { id: stateId, codeVerifier, returnTo, expiresAt: new Date(Date.now() + PKCE_TTL_MS) },
    })

    reply.setCookie(STATE_COOKIE, stateId, {
      httpOnly: true,
      secure: IS_HTTPS,
      sameSite: 'lax',
      path: '/', // required for the __Host- prefix; also simpler to reason about than a narrower path
      maxAge: PKCE_TTL_MS / 1000,
    })

    const configUrl = `${process.env.RELAY_PUBLIC_URL}/uoa/config`
    const redirectUrl = `${process.env.RELAY_PUBLIC_URL}/auth/callback`
    const params = new URLSearchParams({
      config_url: configUrl,
      redirect_url: redirectUrl,
      code_challenge: codeChallengeFor(codeVerifier),
      code_challenge_method: 'S256',
    })
    return reply.redirect(`${process.env.UOA_BASE_URL}/auth?${params}`)
  })

  app.get('/auth/callback', async (req, reply) => {
    const { code } = z.object({ code: z.string() }).parse(req.query)
    const cookies = req.cookies as Record<string, string | undefined>
    const stateId = cookies[STATE_COOKIE]
    if (!stateId) throw httpError(400, 'Missing state cookie — start login again')

    const state = await prisma.pkceState.findUnique({ where: { id: stateId } })
    await prisma.pkceState.deleteMany({ where: { id: stateId } }) // single use regardless of outcome
    reply.clearCookie(STATE_COOKIE, { path: '/' })
    if (!state || state.expiresAt < new Date()) throw httpError(400, 'Login expired — start again')

    const redirectUrl = `${process.env.RELAY_PUBLIC_URL}/auth/callback`
    const result = await exchangeCode({ code, redirectUrl, codeVerifier: state.codeVerifier })

    const claims = decodeJwt(result.access_token)
    const sub = claims.sub!
    const email = String(claims.email)

    const user = await prisma.user.upsert({
      where: { uoaSub: sub },
      update: { email },
      create: { uoaSub: sub, email },
    })
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: result.refresh_token,
        expiresAt: new Date(Date.now() + result.refresh_token_expires_in * 1000),
      },
    })
    if (result.firstLogin) await bootstrapMemberships(user.id, result.firstLogin)

    const sessionJwt = await mintSessionToken(sub, email)
    const ticketId = newOpaqueId()
    await prisma.loginTicket.create({
      data: { id: ticketId, sessionJwt, expiresAt: new Date(Date.now() + TICKET_TTL_MS) },
    })

    const returnUrl = new URL(state.returnTo)
    returnUrl.searchParams.set('ticket', ticketId)
    return reply.redirect(returnUrl.toString())
  })

  // Called server-to-server by the venue's local server — never by the browser directly —
  // so the signed session token never appears in a URL or browser history.
  app.post('/session/exchange', async (req) => {
    const { ticket } = z.object({ ticket: z.string() }).parse(req.body)
    const row = await prisma.loginTicket.findUnique({ where: { id: ticket } })
    if (!row || row.redeemed || row.expiresAt < new Date()) throw httpError(400, 'Ticket is invalid, used, or expired')
    await prisma.loginTicket.update({ where: { id: ticket }, data: { redeemed: true } })
    return { sessionToken: row.sessionJwt, claims: decodeJwt(row.sessionJwt) }
  })

  app.get('/relay/.well-known/jwks.json', async () => {
    const { key, kid } = await sessionSigningKey()
    return { keys: [await publicJwk(key, kid)] }
  })
}
