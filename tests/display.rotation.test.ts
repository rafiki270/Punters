import test from 'node:test'
import assert from 'node:assert/strict'
import { computeAllModeIndex, resolvePauseToggle, computePausedNextSnapshot } from '../web/src/display/lib/slidePicker'

test('computeAllModeIndex cycles slides when slide count <= screen count', () => {
  const slidesLen = 2
  const screenCount = 2

  const cycle0 = computeAllModeIndex(slidesLen, screenCount, 1, 0)
  const cycle1 = computeAllModeIndex(slidesLen, screenCount, 1, 1)
  const cycle2 = computeAllModeIndex(slidesLen, screenCount, 1, 2)

  assert.equal(cycle0, 0)
  assert.equal(cycle1, 1)
  assert.equal(cycle2, 0)

  const screen2Cycle0 = computeAllModeIndex(slidesLen, screenCount, 2, 0)
  const screen2Cycle1 = computeAllModeIndex(slidesLen, screenCount, 2, 1)
  assert.equal(screen2Cycle0, 1)
  assert.equal(screen2Cycle1, 0)
})

test('computeAllModeIndex matches legacy behavior when slides exceed screens', () => {
  const slidesLen = 5
  const screenCount = 2
  const screenIndex = 1

  const idx0 = computeAllModeIndex(slidesLen, screenCount, screenIndex, 0)
  const idx1 = computeAllModeIndex(slidesLen, screenCount, screenIndex, 1)
  const idx2 = computeAllModeIndex(slidesLen, screenCount, screenIndex, 2)

  assert.equal(idx0, 0)
  assert.equal(idx1, 2)
  assert.equal(idx2, 4)
})

test('computeAllModeIndex handles non-positive inputs gracefully', () => {
  assert.equal(computeAllModeIndex(0, 2, 1, 0), null)
  assert.equal(computeAllModeIndex(3, 0, 0, 0), 0)
  assert.equal(computeAllModeIndex(3, -5, -2, -1), 2)
})

test('resolvePauseToggle captures a snapshot when pausing', () => {
  const next = resolvePauseToggle(false, 7, 42)
  assert.equal(next.paused, true)
  assert.deepEqual(next.snapshot, { idx: 7, secsLeft: 42 })
})

test('resolvePauseToggle clears snapshot when resuming', () => {
  const next = resolvePauseToggle(true, 1, 10)
  assert.equal(next.paused, false)
  assert.equal(next.snapshot, null)
})

test('computePausedNextSnapshot advances the paused slide index', () => {
  const result = computePausedNextSnapshot(3, 1, 50, { idx: 1, secsLeft: 25 })
  assert.deepEqual(result, { idx: 2, secsLeft: 25 })
})

test('computePausedNextSnapshot wraps and seeds secsLeft when needed', () => {
  const result = computePausedNextSnapshot(2, 1, 99, null)
  assert.deepEqual(result, { idx: 0, secsLeft: 99 })
})

test('computePausedNextSnapshot returns null when there are no slides', () => {
  assert.equal(computePausedNextSnapshot(0, 0, 10, null), null)
})
