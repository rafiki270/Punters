import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generateKeyPair } from 'jose'
import { buildFakeRelay } from './fakeRelay'

// Point Prisma at a scratch database before anything imports the client.
const dir = mkdtempSync(path.join(tmpdir(), 'punters-v2-test-'))
process.env.DATABASE_URL = `file:${path.join(dir, 'test.db')}`
process.env.MEDIA_DIR = path.join(dir, 'media')
process.env.NODE_ENV = 'test'

execSync('npx prisma db push --skip-generate', {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env },
  stdio: 'ignore',
})

// A signed-in, bound venue is the normal case this suite exercises — the sign-in chain
// itself (login, binding, sync) is covered by relay/tests. Stand up a fake relay JWKS
// endpoint so the server's real session-verification code path runs unmodified.
const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true })
const fakeRelay = await buildFakeRelay(privateKey, publicKey, 'test-session-kid')
process.env.RELAY_URL = fakeRelay.url

const { buildApp } = await import('../src/app')
const { prisma } = await import('../src/core/prisma')

const app = await buildApp()
const sessionToken = await fakeRelay.mintSessionToken('user_1', 'owner@example.com')
const sessionCookie = `punters_session=${sessionToken}`

before(async () => {
  await app.ready()
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { orgId: 1, orgName: 'Test Org', teamId: 1, teamName: 'Test Venue', relayServiceToken: 'vst_test' },
    create: { id: 1, orgId: 1, orgName: 'Test Org', teamId: 1, teamName: 'Test Venue', relayServiceToken: 'vst_test' },
  })
})

after(async () => {
  await app.close()
  await fakeRelay.app.close()
  await prisma.$disconnect()
})

async function json(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
  const res = await app.inject({ method, url, payload: payload as never, headers: { cookie: sessionCookie } })
  return { status: res.statusCode, body: res.json() }
}

test('settings bootstrap and update', async () => {
  const get = await json('GET', '/api/settings')
  assert.equal(get.status, 200)
  assert.equal(get.body.settings.currency, 'GBP')

  const put = await json('PUT', '/api/settings', { venueName: 'Test Tavern', currency: 'EUR' })
  assert.equal(put.status, 200)
  assert.equal(put.body.settings.venueName, 'Test Tavern')
})

test('item CRUD with prices', async () => {
  const size = (await json('POST', '/api/sizes', { name: 'Pint', volumeMl: 568, kinds: 'beer,cider' })).body.size

  const created = await json('POST', '/api/items', {
    kind: 'beer',
    name: 'Test IPA',
    producer: 'Test Brewery',
    style: 'IPA',
    abv: 6,
    prices: [{ sizeId: size.id, amountMinor: 650 }],
  })
  assert.equal(created.status, 200)
  assert.equal(created.body.item.prices.length, 1)

  const updated = await json('PUT', `/api/items/${created.body.item.id}`, {
    prices: [{ sizeId: size.id, amountMinor: 700 }, { sizeId: null, amountMinor: 500 }],
  })
  assert.equal(updated.body.item.prices.length, 2)

  const food = await json('POST', '/api/items', {
    kind: 'food',
    name: 'Test Burger',
    spicyLevel: 2,
    vegan: false,
    prices: [{ sizeId: null, amountMinor: 1400 }],
  })
  assert.equal(food.status, 200)

  const bad = await json('POST', '/api/items', { kind: 'sandwich', name: 'Nope' })
  assert.equal(bad.status, 400)
})

test('taps workflow: count, assign, kick, history', async () => {
  await json('POST', '/api/taps/count', { count: 4 })
  let taps = (await json('GET', '/api/taps')).body.taps
  assert.equal(taps.length, 4)

  const beer = (await json('GET', '/api/items?kind=beer')).body.items[0]
  await json('POST', '/api/taps/1/assign', { itemId: beer.id })
  taps = (await json('GET', '/api/taps')).body.taps
  assert.equal(taps[0].item.name, 'Test IPA')

  // Inline creation, then replacement history.
  await json('POST', '/api/taps/1/assign', { item: { kind: 'beer', name: 'Inline Lager', abv: 4.2 } })
  const history = (await json('GET', '/api/taps/1/history')).body.history
  assert.equal(history.length, 2)
  assert.equal(history[1].removedReason, 'replaced')

  await json('POST', '/api/taps/1/kick', {})
  taps = (await json('GET', '/api/taps')).body.taps
  assert.equal(taps[0].status, 'kicked')
  assert.equal(taps[0].item, null)

  // Shrinking the count deletes trailing taps.
  await json('POST', '/api/taps/count', { count: 2 })
  taps = (await json('GET', '/api/taps')).body.taps
  assert.equal(taps.length, 2)
})

test('screen pairing and display feed', async () => {
  const hello = await json('POST', '/api/screens/hello', { width: 1920, height: 1080 })
  assert.equal(hello.status, 200)
  const screen = hello.body.screen
  assert.ok(screen.pairCode.length === 6)

  // Feed before claiming: pair code, no zone.
  let feed = await json('GET', `/api/display/feed?key=${screen.key}`)
  assert.equal(feed.body.zone, null)
  assert.equal(feed.body.screen.pairCode, screen.pairCode)

  // Claim into a zone with a page.
  const zone = (await json('POST', '/api/zones', { name: 'Test wall' })).body.zone
  await json('PUT', `/api/screens/${screen.id}`, { zoneId: zone.id, name: 'Left TV' })
  const page = (await json('POST', `/api/zones/${zone.id}/pages`, { templateId: 'tap-board' })).body.page
  assert.equal(page.name, 'Tap board')

  const badTemplate = await json('POST', `/api/zones/${zone.id}/pages`, { templateId: 'no-such' })
  assert.equal(badTemplate.status, 400)

  feed = await json('GET', `/api/display/feed?key=${screen.key}`)
  assert.equal(feed.body.zone.name, 'Test wall')
  assert.equal(feed.body.screen.pairCode, null)
  assert.equal(feed.body.pages.length, 1)
  assert.ok(Array.isArray(feed.body.pages[0].content.main.items))
  assert.ok(typeof feed.body.serverNow === 'number')

  // Same key hellos back to the same screen.
  const again = await json('POST', '/api/screens/hello', { key: screen.key })
  assert.equal(again.body.screen.id, screen.id)
})

test('menu slot config overrides resolve in the feed', async () => {
  const zone = (await json('POST', '/api/zones', { name: 'Food wall' })).body.zone
  const page = (await json('POST', `/api/zones/${zone.id}/pages`, { templateId: 'list-1col' })).body.page
  await json('PUT', `/api/pages/${page.id}`, {
    config: { main: { source: { kinds: ['food'] }, columns: 2, minRow: 50, maxRow: 90 } },
  })
  const hello = await json('POST', '/api/screens/hello', {})
  await json('PUT', `/api/screens/${hello.body.screen.id}`, { zoneId: zone.id })
  const feed = await json('GET', `/api/display/feed?key=${hello.body.screen.key}`)
  const items = feed.body.pages[0].content.main.items
  assert.ok(items.length >= 1)
  assert.ok(items.every((i: { kind: string }) => i.kind === 'food'))
})
