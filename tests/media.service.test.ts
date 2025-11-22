import test from 'node:test'
import assert from 'node:assert/strict'
import { createMediaService } from '../src/modules/media/service'

test('deleteAsset blocks when asset in use', async () => {
  const prisma: any = {
    beer: { count: async () => 1 },
    drink: { count: async () => 0 },
    cocktail: { count: async () => 0 },
    asset: { delete: async () => {} },
  }
  const service = createMediaService({ prisma, emitChange: () => {} })
  let threw = false
  try {
    await service.deleteAsset(1)
  } catch (err) {
    threw = (err as Error).message.includes('Asset is in use')
  }
  assert.equal(threw, true)
})

test('updateAsset updates visibility flags and emits change', async () => {
  let emitted = false
  const updates: any[] = []
  const prisma: any = {
    asset: {
      update: async ({ data }: any) => { updates.push(data); return { id: 2, ...data } },
    },
  }
  const service = createMediaService({ prisma, emitChange: () => { emitted = true } })
  const result = await service.updateAsset(2, { allowPair: false, fullscreen: true, hideLogo: true, visible: false })

  assert.equal(emitted, true)
  assert.equal(updates[0].visible, false)
  assert.equal(result.visible, false)
})
