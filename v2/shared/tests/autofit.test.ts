import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitList, splitColumns } from '../src/autofit'

test('rows grow to fill space up to maxRow', () => {
  // 5 items in a 1000px column: ideal row ~196px, capped at 96.
  const r = fitList({ regionH: 1000, count: 5, columns: 1, minRow: 40, maxRow: 96, gap: 8 })
  assert.equal(r.rowH, 96)
  assert.equal(r.pages, 1)
  assert.equal(r.pageSize, 5)
})

test('rows shrink toward minRow before paginating', () => {
  // 20 items, 1000px: at min 40+8 gap → 21 fit, so one page, rows near min.
  const r = fitList({ regionH: 1000, count: 20, columns: 1, minRow: 40, maxRow: 96, gap: 8 })
  assert.equal(r.pages, 1)
  assert.ok(r.rowH >= 40 && r.rowH <= 96)
})

test('overflow paginates at minRow capacity', () => {
  // Capacity at min row: floor((500+8)/(40+8)) = 10 per column, 1 column.
  const r = fitList({ regionH: 500, count: 25, columns: 1, minRow: 40, maxRow: 96, gap: 8 })
  assert.equal(r.pageSize, 10)
  assert.equal(r.pages, 3)
  // 10 rows in 500px leaves a little slack, so rows sit just above the minimum.
  assert.ok(r.rowH >= 40 && r.rowH <= 96)
})

test('columns multiply capacity', () => {
  const r = fitList({ regionH: 500, count: 25, columns: 3, minRow: 40, maxRow: 96, gap: 8 })
  assert.equal(r.pages, 1)
  // 25 items over 3 columns = 9 rows needed; rows can grow above min.
  assert.equal(r.rowsPerColumn, 9)
  assert.ok(r.rowH >= 40)
})

test('degenerate regions produce zero pages, not crashes', () => {
  assert.equal(fitList({ regionH: 0, count: 10, columns: 2, minRow: 40, maxRow: 96, gap: 8 }).pages, 0)
  assert.equal(fitList({ regionH: 500, count: 0, columns: 2, minRow: 40, maxRow: 96, gap: 8 }).pages, 0)
})

test('splitColumns balances items', () => {
  assert.deepEqual(splitColumns([1, 2, 3, 4, 5], 2), [[1, 2, 3], [4, 5]])
  assert.deepEqual(splitColumns([1, 2], 3), [[1], [2], []])
})
