import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeTheme, shouldApplySharedItem, type SharedCatalogItem } from '../src/relay'

test('mergeTheme falls through to org theme when no overrides', () => {
  const org = { colors: { primary: '#111' }, fonts: { fontFamily: 'sans' }, logoUrl: 'https://x/logo.png' }
  assert.deepEqual(mergeTheme(org, null), org)
  assert.deepEqual(mergeTheme(org, undefined), org)
  assert.deepEqual(mergeTheme(org, {}), org)
})

test('mergeTheme overrides whole field groups, not individual fields', () => {
  const org = { colors: { primary: '#111', bg: '#fff' }, fonts: { fontFamily: 'sans' }, logoUrl: 'https://x/logo.png' }
  const venue = { colors: { primary: '#f00' } } // venue supplies a full replacement palette
  const merged = mergeTheme(org, venue)
  assert.deepEqual(merged.colors, { primary: '#f00' }) // not merged with org's bg
  assert.deepEqual(merged.fonts, org.fonts) // untouched group falls through
  assert.equal(merged.logoUrl, org.logoUrl)
})

test('mergeTheme allows explicitly clearing the logo with null', () => {
  const org = { logoUrl: 'https://x/logo.png' }
  assert.equal(mergeTheme(org, { logoUrl: null }).logoUrl, null)
  assert.equal(mergeTheme(org, {}).logoUrl, 'https://x/logo.png')
})

const baseItem: SharedCatalogItem = {
  id: 1,
  kind: 'beer',
  name: 'House Lager',
  producer: null,
  style: null,
  abv: null,
  description: null,
  categoryName: null,
  vegan: false,
  vegetarian: false,
  glutenFree: false,
  dairyFree: false,
  spicyLevel: 0,
  imageUrl: null,
  prices: [],
  active: true,
  updatedAt: '2026-01-02T00:00:00.000Z',
}

test('shouldApplySharedItem skips items the venue has forked', () => {
  assert.equal(shouldApplySharedItem({ overridden: true, sharedUpdatedAt: '2026-01-01T00:00:00.000Z' }, baseItem), false)
})

test('shouldApplySharedItem applies when there is no local copy yet', () => {
  assert.equal(shouldApplySharedItem(null, baseItem), true)
})

test('shouldApplySharedItem applies only strictly newer updates', () => {
  assert.equal(shouldApplySharedItem({ overridden: false, sharedUpdatedAt: '2026-01-01T00:00:00.000Z' }, baseItem), true)
  assert.equal(shouldApplySharedItem({ overridden: false, sharedUpdatedAt: '2026-01-02T00:00:00.000Z' }, baseItem), false)
  assert.equal(shouldApplySharedItem({ overridden: false, sharedUpdatedAt: '2026-01-03T00:00:00.000Z' }, baseItem), false)
})
