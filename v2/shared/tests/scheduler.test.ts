import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rotationState, chunkIndex } from '../src/scheduler'

const pages = [
  { id: 1, durationSec: 10 },
  { id: 2, durationSec: 20 },
  { id: 3, durationSec: 5 },
]

test('rotationState walks pages by elapsed time', () => {
  const epoch = 1_000_000
  assert.equal(rotationState(pages, epoch, epoch).index, 0)
  assert.equal(rotationState(pages, epoch, epoch + 9_999).index, 0)
  assert.equal(rotationState(pages, epoch, epoch + 10_000).index, 1)
  assert.equal(rotationState(pages, epoch, epoch + 29_999).index, 1)
  assert.equal(rotationState(pages, epoch, epoch + 30_000).index, 2)
  // wraps at the 35s cycle
  assert.equal(rotationState(pages, epoch, epoch + 35_000).index, 0)
  assert.equal(rotationState(pages, epoch, epoch + 35_000 * 7 + 12_000).index, 1)
})

test('rotationState reports remaining and cycle', () => {
  const epoch = 0
  const s = rotationState(pages, epoch, 4_000)
  assert.equal(s.remainingSec, 6)
  assert.equal(s.elapsedSec, 4)
  assert.equal(s.cycleSec, 35)
})

test('two screens with the same inputs agree exactly', () => {
  const epoch = 123_456
  for (const now of [epoch + 1, epoch + 9_999, epoch + 10_001, epoch + 200_000]) {
    const a = rotationState(pages, epoch, now)
    const b = rotationState(pages, epoch, now)
    assert.deepEqual(a, b)
  }
})

test('rotationState handles empty and pre-epoch input', () => {
  assert.equal(rotationState([], 0, 100).index, -1)
  // clock slightly behind the epoch clamps to the first page
  assert.equal(rotationState(pages, 5_000, 4_000).index, 0)
})

test('durations are floored at 1s to avoid a zero-length cycle', () => {
  const s = rotationState([{ id: 1, durationSec: 0 }], 0, 500)
  assert.equal(s.index, 0)
  assert.equal(s.cycleSec, 1)
})

test('chunkIndex divides a page across sub-pages', () => {
  assert.equal(chunkIndex(1, 30, 15), 0)
  assert.equal(chunkIndex(3, 30, 0), 0)
  assert.equal(chunkIndex(3, 30, 10), 1)
  assert.equal(chunkIndex(3, 30, 20), 2)
  assert.equal(chunkIndex(3, 30, 29.9), 2)
  // elapsed can momentarily equal the duration; stay on the last chunk
  assert.equal(chunkIndex(3, 30, 30), 2)
})
