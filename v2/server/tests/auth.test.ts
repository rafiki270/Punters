import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generateKeyPair } from 'jose'
import { buildFakeRelay } from './fakeRelay'

const dir = mkdtempSync(path.join(tmpdir(), 'punters-v2-auth-test-'))
process.env.DATABASE_URL = `file:${path.join(dir, 'test.db')}`
process.env.MEDIA_DIR = path.join(dir, 'media')
process.env.NODE_ENV = 'test'

execSync('npx prisma db push --skip-generate', {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env },
  stdio: 'ignore',
})

const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true })
const fakeRelay = await buildFakeRelay(privateKey, publicKey, 'test-session-kid')
process.env.RELAY_URL = fakeRelay.url

const { buildApp } = await import('../src/app')
const { prisma } = await import('../src/core/prisma')
const app = await buildApp()
const validToken = await fakeRelay.mintSessionToken('user_1', 'owner@example.com')

before(async () => app.ready())
after(async () => {
  await app.close()
  await fakeRelay.app.close()
  await prisma.$disconnect()
})

test('unauthenticated admin API calls are rejected, display and health stay public', async () => {
  const items = await app.inject({ method: 'GET', url: '/api/items' })
  assert.equal(items.statusCode, 401)

  const health = await app.inject({ method: 'GET', url: '/api/health' })
  assert.equal(health.statusCode, 200)

  const hello = await app.inject({ method: 'POST', url: '/api/screens/hello', payload: {} })
  assert.equal(hello.statusCode, 200) // TV bootstrap must never require a session
})

test('a garbage session cookie is rejected the same as no cookie', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/items', headers: { cookie: 'punters_session=not-a-real-jwt' } })
  assert.equal(res.statusCode, 401)
})

test('a valid session but unbound venue is blocked with 428, not 401', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/items', headers: { cookie: `punters_session=${validToken}` } })
  assert.equal(res.statusCode, 428)
})

test('/api/auth/me reflects authentication and binding state', async () => {
  const anon = await app.inject({ method: 'GET', url: '/api/auth/me' })
  assert.equal(anon.json().authenticated, false)

  const signedIn = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `punters_session=${validToken}` } })
  const body = signedIn.json()
  assert.equal(body.authenticated, true)
  assert.equal(body.user.email, 'owner@example.com')
  assert.equal(body.venueBound, false)
})

test('binding once succeeds; a second bind attempt is rejected', async () => {
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { orgId: 1, orgName: 'Test Org', teamId: 1, teamName: 'Test Venue', relayServiceToken: 'vst_test' },
    create: { id: 1, orgId: 1, orgName: 'Test Org', teamId: 1, teamName: 'Test Venue', relayServiceToken: 'vst_test' },
  })

  const now = await app.inject({ method: 'GET', url: '/api/items', headers: { cookie: `punters_session=${validToken}` } })
  assert.equal(now.statusCode, 200)

  const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `punters_session=${validToken}` } })
  const body = me.json()
  assert.equal(body.venueBound, true)
  assert.equal(body.team.name, 'Test Venue')

  // Already bound — the route's own guard rejects before ever calling the relay.
  const rebind = await app.inject({
    method: 'POST',
    url: '/api/auth/bind',
    payload: { teamId: 2 },
    headers: { cookie: `punters_session=${validToken}` },
  })
  assert.equal(rebind.statusCode, 409)
})

test('AUTH_DISABLED bypasses the gate entirely for local dev', async () => {
  process.env.AUTH_DISABLED = 'true'
  try {
    const res = await app.inject({ method: 'GET', url: '/api/items' })
    assert.equal(res.statusCode, 200)
  } finally {
    process.env.AUTH_DISABLED = 'false'
  }
})
