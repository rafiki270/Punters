import test from 'node:test'
import assert from 'node:assert/strict'
import { modeFromContentFlags, slideMatchesMode } from '../web/src/display/lib/displayMode'

test('modeFromContentFlags maps every combination of toggles', () => {
  assert.equal(modeFromContentFlags(true, true, true), 'everything', 'all toggles -> everything')
  assert.equal(modeFromContentFlags(true, true, false), 'all', 'beer + drinks -> all')
  assert.equal(modeFromContentFlags(true, false, false), 'beer', 'beer only')
  assert.equal(modeFromContentFlags(false, true, false), 'drinks', 'drinks only')
  assert.equal(modeFromContentFlags(false, false, true), 'ads', 'media only')
  assert.equal(modeFromContentFlags(true, false, true), 'everything', 'beer + media still treated as everything')
  assert.equal(modeFromContentFlags(false, true, true), 'everything', 'drinks + media still treated as everything')
  assert.equal(modeFromContentFlags(false, false, false), 'ads', 'fallback with no flags still defaults to ads')
})

test('slideMatchesMode accepts the correct slide types', () => {
  const slideTypes: Array<'beer'|'drinks'|'ad'|'adpair'> = ['beer', 'drinks', 'ad', 'adpair']
  for (const type of slideTypes) {
    assert.equal(slideMatchesMode('everything', type), true, `'everything' allows ${type}`)
  }
  assert.equal(slideMatchesMode('all', 'beer'), true)
  assert.equal(slideMatchesMode('all', 'drinks'), true)
  assert.equal(slideMatchesMode('all', 'ad'), false)
  assert.equal(slideMatchesMode('all', 'adpair'), false)
  assert.equal(slideMatchesMode('beer', 'beer'), true)
  assert.equal(slideMatchesMode('beer', 'drinks'), false)
  assert.equal(slideMatchesMode('beer', 'ad'), false)
  assert.equal(slideMatchesMode('drinks', 'drinks'), true)
  assert.equal(slideMatchesMode('drinks', 'beer'), false)
  assert.equal(slideMatchesMode('ads', 'ad'), true)
  assert.equal(slideMatchesMode('ads', 'adpair'), true)
  assert.equal(slideMatchesMode('ads', 'beer'), false)
  assert.equal(slideMatchesMode('ads', 'drinks'), false)
})
