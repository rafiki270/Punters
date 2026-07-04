import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generateKeyPair, exportPKCS8, importJWK, jwtVerify, decodeProtectedHeader } from 'jose'
import { buildFakeUoa } from './fakeUoa'

const dir = mkdtempSync(path.join(tmpdir(), 'punters-relay-test-'))
process.env.DATABASE_URL = `file:${path.join(dir, 'test.db')}`
process.env.NODE_ENV = 'test'
process.env.RELAY_PUBLIC_URL = 'http://relay.test'
process.env.UOA_DOMAIN = 'relay.test'
process.env.UOA_CONTACT_EMAIL = 'ops@relay.test'
process.env.UOA_CLIENT_SECRET = 'test-secret'
process.env.CONFIG_SIGNING_KID = 'test-config-kid'
process.env.SESSION_SIGNING_KID = 'test-session-kid'

const configKeys = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true })
const sessionKeys = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true })
process.env.CONFIG_SIGNING_PRIVATE_KEY_PEM = (await exportPKCS8(configKeys.privateKey)).replace(/\n/g, '\\n')
process.env.SESSION_SIGNING_PRIVATE_KEY_PEM = (await exportPKCS8(sessionKeys.privateKey)).replace(/\n/g, '\\n')

execSync('npx prisma db push --skip-generate', {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env },
  stdio: 'ignore',
})

const { app: fakeUoa, url: fakeUoaUrl } = await buildFakeUoa()
process.env.UOA_BASE_URL = fakeUoaUrl

const { buildRelayApp } = await import('../src/app')
const { prisma } = await import('../src/core/prisma')
const app = await buildRelayApp()

before(async () => app.ready())
after(async () => {
  await app.close()
  await fakeUoa.close()
  await prisma.$disconnect()
})

async function json(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, opts?: { body?: unknown; token?: string; cookie?: string }) {
  const headers: Record<string, string> = {}
  if (opts?.token) headers.authorization = `Bearer ${opts.token}`
  if (opts?.cookie) headers.cookie = opts.cookie
  const res = await app.inject({ method, url, payload: opts?.body as never, headers })
  return { status: res.statusCode, body: res.json(), headers: res.headers }
}

function extractCookie(setCookieHeader: string | string[] | undefined, name: string): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader.find((c) => c.startsWith(`${name}=`)) : setCookieHeader
  const match = raw?.match(new RegExp(`${name}=([^;]+)`))
  if (!match) throw new Error(`cookie ${name} not found in ${JSON.stringify(setCookieHeader)}`)
  return `${name}=${match[1]}`
}

test('config JWT is signed and verifies against its own published JWKS', async () => {
  const configRes = await app.inject({ method: 'GET', url: '/uoa/config' })
  assert.equal(configRes.statusCode, 200)
  assert.equal(configRes.headers['content-type'], 'application/jwt')
  const jwt = configRes.body

  const jwksRes = await json('GET', '/uoa/jwks.json')
  const jwk = jwksRes.body.keys[0]
  assert.equal(jwk.kid, 'test-config-kid')
  // The published JWKS must never carry private key material.
  for (const field of ['d', 'p', 'q', 'dp', 'dq', 'qi']) assert.equal(field in jwk, false, `JWKS leaked private field '${field}'`)

  const header = decodeProtectedHeader(jwt)
  assert.equal(header.alg, 'RS256')
  assert.equal(header.kid, 'test-config-kid')

  // Verify through the *published* JWKS, not the locally-held key — this is the check
  // that actually exercises what a real client (UOA) does, and catches the class of bug
  // where the JWKS endpoint serves something a real verifier can't (or shouldn't) use.
  const publishedKey = await importJWK(jwk, 'RS256')
  const { payload } = await jwtVerify(jwt, publishedKey)
  assert.equal(payload.domain, 'relay.test')
  assert.equal(payload.jwks_url, 'https://relay.test/uoa/jwks.json')
  assert.ok(Array.isArray(payload.redirect_urls))
  assert.ok((payload.ui_theme as Record<string, unknown>).colors)
})

let sessionToken: string
let orgId: number
let teamId: number
let serviceToken: string

test('full login flow: start -> callback -> ticket -> session exchange', async () => {
  const start = await app.inject({ method: 'GET', url: '/login/start?returnTo=' + encodeURIComponent('http://venue.local/admin/auth/callback') })
  assert.equal(start.statusCode, 302)
  const location = new URL(start.headers.location as string)
  assert.equal(location.origin + location.pathname, `${fakeUoaUrl}/auth`)
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256')
  assert.ok(location.searchParams.get('code_challenge'))
  assert.equal(location.searchParams.get('redirect_url'), 'http://relay.test/auth/callback')

  // RELAY_PUBLIC_URL is http in this test env, so the cookie falls back to a plain name
  // (not __Host-, which real browsers refuse without Secure+HTTPS). Whichever name is
  // used, it must carry Path=/ — a narrower path silently breaks __Host- cookies in a
  // real browser even though Fastify's inject() doesn't enforce that itself.
  const setCookieHeader = start.headers['set-cookie']
  const rawSetCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader
  assert.ok(rawSetCookie?.includes('punters_state='))
  assert.ok(rawSetCookie?.includes('Path=/'), `expected Path=/, got: ${rawSetCookie}`)
  assert.ok(!rawSetCookie?.includes('Path=/auth/callback'))

  const stateCookie = extractCookie(setCookieHeader, 'punters_state')

  const callback = await app.inject({ method: 'GET', url: '/auth/callback?code=fake-code', headers: { cookie: stateCookie } })
  assert.equal(callback.statusCode, 302)
  const returnUrl = new URL(callback.headers.location as string)
  assert.equal(returnUrl.origin + returnUrl.pathname, 'http://venue.local/admin/auth/callback')
  const ticket = returnUrl.searchParams.get('ticket')!
  assert.ok(ticket)

  const exchanged = await json('POST', '/session/exchange', { body: { ticket } })
  assert.equal(exchanged.status, 200)
  assert.equal(exchanged.body.claims.email, 'bar@example.com')
  sessionToken = exchanged.body.sessionToken

  const replay = await json('POST', '/session/exchange', { body: { ticket } })
  assert.equal(replay.status, 400) // one-time use
})

test('relay session JWT verifies against the relay JWKS endpoint', async () => {
  const jwks = await json('GET', '/relay/.well-known/jwks.json')
  const jwk = jwks.body.keys[0]
  assert.equal(jwk.kid, 'test-session-kid')
  for (const field of ['d', 'p', 'q', 'dp', 'dq', 'qi']) assert.equal(field in jwk, false, `JWKS leaked private field '${field}'`)
  const publishedKey = await importJWK(jwk, 'RS256')
  const { payload } = await jwtVerify(sessionToken, publishedKey)
  assert.equal(payload.email, 'bar@example.com')
  assert.equal(payload.sub, 'user_1')
})

test('create organisation and first venue, then bind', async () => {
  const org = await json('POST', '/relay/organisations', { token: sessionToken, body: { name: 'Test Taverns Group' } })
  assert.equal(org.status, 200)
  orgId = org.body.organisation.id

  const venue = await json('POST', `/relay/organisations/${orgId}/venues`, { token: sessionToken, body: { name: 'Test Venue One' } })
  assert.equal(venue.status, 200)
  teamId = venue.body.team.id
  assert.equal(venue.body.team.uoaLinked, false)
  assert.ok(venue.body.team.uoaTeamId.startsWith('local:'))

  const memberships = await json('GET', '/relay/me/memberships', { token: sessionToken })
  assert.equal(memberships.body.orgs.length, 1)
  assert.equal(memberships.body.teams.length, 1)
  assert.equal(memberships.body.teams[0].teamName, 'Test Venue One')

  const bind1 = await json('POST', `/relay/venues/${teamId}/bind`, { token: sessionToken })
  assert.equal(bind1.status, 200)
  serviceToken = bind1.body.serviceToken
  assert.equal(bind1.body.orgId, orgId)
  assert.equal(bind1.body.teamId, teamId)

  const bind2 = await json('POST', `/relay/venues/${teamId}/bind`, { token: sessionToken })
  assert.equal(bind2.body.serviceToken, serviceToken) // reuses the existing token, doesn't mint a new one
})

test('theme: org admin sets it, venue service token reads the merged result', async () => {
  const update = await json('PUT', `/relay/organisations/${orgId}/theme`, { token: sessionToken, body: { colors: { primary: '#ff6600' } } })
  assert.equal(update.status, 200)
  assert.equal(update.body.theme.colors.primary, '#ff6600')

  const read = await json('GET', `/relay/teams/${teamId}/theme`, { token: serviceToken })
  assert.equal(read.status, 200)
  assert.equal(read.body.theme.colors.primary, '#ff6600')

  const wrongTeam = await json('GET', `/relay/teams/${teamId + 999}/theme`, { token: serviceToken })
  assert.equal(wrongTeam.status, 403)
})

let sharedItemId: number

test('shared catalog: create, pull delta, update, pull again, soft delete', async () => {
  const category = await json('POST', `/relay/organisations/${orgId}/categories`, { token: sessionToken, body: { kind: 'beer', name: 'House Beers' } })
  assert.equal(category.status, 200)

  const created = await json('POST', `/relay/organisations/${orgId}/items`, {
    token: sessionToken,
    body: { kind: 'beer', name: 'House Lager', categoryId: category.body.category.id, prices: [{ sizeName: 'Pint', amountMinor: 600 }] },
  })
  assert.equal(created.status, 200)
  sharedItemId = created.body.item.id

  const pull1 = await json('GET', `/relay/teams/${teamId}/catalog?since=0`, { token: serviceToken })
  assert.equal(pull1.body.version, 1)
  assert.equal(pull1.body.items.length, 1)
  assert.equal(pull1.body.items[0].name, 'House Lager')
  assert.equal(pull1.body.items[0].categoryName, 'House Beers')
  assert.deepEqual(pull1.body.items[0].prices, [{ sizeName: 'Pint', amountMinor: 600 }])

  const pullNoChange = await json('GET', `/relay/teams/${teamId}/catalog?since=1`, { token: serviceToken })
  assert.equal(pullNoChange.body.items.length, 0) // early-exit: nothing changed since version 1

  const updated = await json('PUT', `/relay/items/${sharedItemId}`, { token: sessionToken, body: { name: 'House Lager (Updated)' } })
  assert.equal(updated.status, 200)
  const pull2 = await json('GET', `/relay/teams/${teamId}/catalog?since=1`, { token: serviceToken })
  assert.equal(pull2.body.version, 2)
  assert.equal(pull2.body.items[0].name, 'House Lager (Updated)')

  const deleted = await json('DELETE', `/relay/items/${sharedItemId}`, { token: sessionToken })
  assert.equal(deleted.status, 200)
  const pull3 = await json('GET', `/relay/teams/${teamId}/catalog?since=2`, { token: serviceToken })
  assert.equal(pull3.body.items[0].active, false) // soft delete, not vanished
})

test('a plain member cannot write the shared catalog', async () => {
  // Promote a second fake user to plain "member" and confirm they're rejected.
  const member = await prisma.user.create({ data: { uoaSub: 'user_member', email: 'member@example.com' } })
  await prisma.membership.create({ data: { userId: member.id, organisationId: orgId, teamId: null, orgRole: 'member' } })
  const { mintSessionToken } = await import('../src/modules/auth/session')
  const memberToken = await mintSessionToken('user_member', 'member@example.com')

  const attempt = await json('POST', `/relay/organisations/${orgId}/items`, { token: memberToken, body: { kind: 'beer', name: 'Should fail' } })
  assert.equal(attempt.status, 403)
})

test('service token cannot be used where a human session is required', async () => {
  const attempt = await json('GET', `/relay/organisations/${orgId}`, { token: serviceToken })
  assert.equal(attempt.status, 401) // requireUser rejects a token it can't verify as a session JWT
})
