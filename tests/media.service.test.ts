import test from 'node:test'
import assert from 'node:assert/strict'
import { createMediaService } from '../src/modules/media/service'

test('deleteAsset blocks when asset in use', async () => {
  const prisma: any = {
    beer: { count: async () => 1 },
    drink: { count: async () => 0 },
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
