import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generateKeyPair, exportPKCS8 } from 'jose'
import { buildFakeUoa } from './fakeUoa'

/**
 * Regression: every browser sign-in is an authorization-code grant, so UOA's firstLogin
 * payload (with the user's existing org/team memberships) arrives on EVERY login, not
 * just the literal first one. This used to 500 the callback (Prisma rejects null members
 * in compound-unique upserts) — meaning any returning user with memberships couldn't log
 * in at all — and would otherwise have duplicated rows (SQLite unique indexes treat NULL
 * as distinct). tests/api.test.ts misses this because its firstLogin has no memberships.
 */

const dir = mkdtempSync(path.join(tmpdir(), 'punters-relay-bootstrap-'))
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

// A returning user: their UOA account already belongs to an org and a team.
const { app: fakeUoa, url: fakeUoaUrl } = await buildFakeUoa({
  memberships: {
    orgs: [{ orgId: 'org_existing', role: 'owner' }],
    teams: [{ teamId: 'team_existing', orgId: 'org_existing', role: 'member' }],
  },
  pending_invites: [],
  capabilities: { can_create_org: false, can_accept_invite: false },
})
process.env.UOA_BASE_URL = fakeUoaUrl

const { buildRelayApp } = await import('../src/app')
const { prisma } = await import('../src/core/prisma')
const app = await buildRelayApp()

after(async () => {
  await app.close()
  await fakeUoa.close()
  await prisma.$disconnect()
})

async function loginOnce(): Promise<number> {
  const start = await app.inject({ method: 'GET', url: '/login/start?returnTo=' + encodeURIComponent('http://venue.local/cb') })
  const setCookie = start.headers['set-cookie']
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie
  const cookie = raw!.split(';')[0]
  const cb = await app.inject({ method: 'GET', url: '/auth/callback?code=x', headers: { cookie } })
  return cb.statusCode
}

test('a returning user with existing memberships can log in, repeatedly, without duplicates', async () => {
  for (let i = 0; i < 3; i++) {
    assert.equal(await loginOnce(), 302, `login ${i + 1} should redirect, not error`)
  }

  const memberships = await prisma.membership.findMany({ orderBy: { id: 'asc' } })
  assert.equal(memberships.length, 2, `expected 2 membership rows (org + team), got ${memberships.length}`)

  const orgLevel = memberships.find((m) => m.teamId === null)
  const teamLevel = memberships.find((m) => m.teamId !== null)
  assert.ok(orgLevel, 'org-level membership row exists')
  assert.equal(orgLevel!.orgRole, 'owner')
  assert.ok(teamLevel, 'team-level membership row exists')
  assert.equal(teamLevel!.teamRole, 'member')

  // The mirrored org/team rows themselves are also deduped.
  assert.equal(await prisma.organisation.count(), 1)
  assert.equal(await prisma.team.count(), 1)
})
