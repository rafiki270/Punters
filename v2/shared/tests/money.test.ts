import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatMoney, parseMoney } from '../src/money'

test('formatMoney drops decimals on whole amounts', () => {
  assert.equal(formatMoney(600, 'GBP'), '£6')
  assert.equal(formatMoney(650, 'GBP'), '£6.50')
})

test('parseMoney handles user input shapes', () => {
  assert.equal(parseMoney('6'), 600)
  assert.equal(parseMoney('6.5'), 650)
  assert.equal(parseMoney('£6.50'), 650)
  assert.equal(parseMoney('6,50'), 650)
  assert.equal(parseMoney(''), null)
  assert.equal(parseMoney('abc'), null)
  assert.equal(parseMoney('-2'), null)
})
