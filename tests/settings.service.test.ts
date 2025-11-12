import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDefaultPriceMaps, normalizeSettingsInput } from '../src/modules/settings/service'

test('buildDefaultPriceMaps splits guest and regular defaults', () => {
  const maps = buildDefaultPriceMaps([
    { serveSizeId: 1, amountMinor: 450, isGuest: false },
    { serveSizeId: 2, amountMinor: 500, isGuest: true },
    { serveSizeId: 3, amountMinor: 550, isGuest: false },
  ])

  assert.deepEqual(maps.defaultPrices, { '1': 450, '3': 550 })
  assert.deepEqual(maps.defaultGuestPrices, { '2': 500 })
})

test('normalizeSettingsInput prepares relation updates and default price writes', () => {
  const normalized = normalizeSettingsInput({
    logoAssetId: 99,
    backgroundAssetId: null,
    backgroundPreset: 'chalkboard',
    defaultPrices: { '1': 400 },
    defaultGuestPrices: { '2': 500 },
    rotationSec: 120,
    themeMode: 'dark',
    defaultDisplayMode: 'all',
    currency: 'GBP',
    locale: 'en-GB',
    mode: 'server',
  })

  assert.equal((normalized.updateData.logoAsset as any)?.connect?.id, 99)
  assert.equal((normalized.createData.logoAsset as any)?.connect?.id, 99)
  assert.deepEqual(normalized.updateData.backgroundAsset, { disconnect: true })
  assert.equal(normalized.createData.backgroundAsset, undefined)
  assert.equal(normalized.updateData.backgroundPreset, 'chalkboard')
  assert.equal(normalized.createData.backgroundPreset, 'chalkboard')
  assert.equal(normalized.defaultPriceWrites.length, 2)
  assert.deepEqual(normalized.defaultPriceWrites, [
    { serveSizeId: 1, amountMinor: 400, isGuest: false },
    { serveSizeId: 2, amountMinor: 500, isGuest: true },
  ])
  assert.equal(normalized.desiredMode, 'server')
})
