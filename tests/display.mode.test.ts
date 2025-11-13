import test from 'node:test'
import assert from 'node:assert/strict'
import { modeFromContentFlags, slideMatchesMode } from '../web/src/display/lib/displayMode'

test('modeFromContentFlags maps every combination of toggles', () => {
  assert.equal(modeFromContentFlags(true, true, true, true), 'everything', 'all toggles -> everything')
  assert.equal(modeFromContentFlags(true, true, true, false), 'all', 'beer + drinks/cocktails -> all')
  assert.equal(modeFromContentFlags(true, false, false, false), 'beer', 'beer only')
  assert.equal(modeFromContentFlags(false, true, false, false), 'drinks', 'drinks only')
  assert.equal(modeFromContentFlags(false, false, true, false), 'drinks', 'cocktails only still counts as drinks mode')
  assert.equal(modeFromContentFlags(false, false, false, true), 'ads', 'media only')
  assert.equal(modeFromContentFlags(true, false, true, true), 'everything', 'beer + cocktails + media -> everything')
  assert.equal(modeFromContentFlags(false, true, true, false), 'drinks', 'drinks + cocktails still drinks mode')
  assert.equal(modeFromContentFlags(false, false, false, false), 'ads', 'fallback with no flags still defaults to ads')
})

test('slideMatchesMode accepts the correct slide types', () => {
  const slideTypes: Array<'beer'|'drinks'|'cocktails'|'ad'|'adpair'> = ['beer', 'drinks', 'cocktails', 'ad', 'adpair']
  for (const type of slideTypes) {
    assert.equal(slideMatchesMode('everything', type), true, `'everything' allows ${type}`)
  }
  assert.equal(slideMatchesMode('all', 'beer'), true)
  assert.equal(slideMatchesMode('all', 'drinks'), true)
  assert.equal(slideMatchesMode('all', 'cocktails'), true)
  assert.equal(slideMatchesMode('all', 'ad'), false)
  assert.equal(slideMatchesMode('all', 'adpair'), false)
  assert.equal(slideMatchesMode('beer', 'beer'), true)
  assert.equal(slideMatchesMode('beer', 'drinks'), false)
  assert.equal(slideMatchesMode('beer', 'cocktails'), false)
  assert.equal(slideMatchesMode('beer', 'ad'), false)
  assert.equal(slideMatchesMode('drinks', 'drinks'), true)
  assert.equal(slideMatchesMode('drinks', 'cocktails'), true)
  assert.equal(slideMatchesMode('drinks', 'beer'), false)
  assert.equal(slideMatchesMode('ads', 'ad'), true)
  assert.equal(slideMatchesMode('ads', 'adpair'), true)
  assert.equal(slideMatchesMode('ads', 'beer'), false)
  assert.equal(slideMatchesMode('ads', 'drinks'), false)
  assert.equal(slideMatchesMode('ads', 'cocktails'), false)
})
