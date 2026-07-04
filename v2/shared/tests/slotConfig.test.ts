import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IMAGE_DEFAULTS, ADS_DEFAULTS } from '../src/templates/types'

test('image and ads slots default to rounded corners at 12px', () => {
  assert.equal(IMAGE_DEFAULTS.roundedCorners, true)
  assert.equal(IMAGE_DEFAULTS.cornerRadius, 12)
  assert.equal(ADS_DEFAULTS.roundedCorners, true)
  assert.equal(ADS_DEFAULTS.cornerRadius, 12)
})
