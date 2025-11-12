import assert from 'node:assert/strict'
import { createMediaService } from '../src/modules/media/service'

async function run(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`✔ ${name}`)
  } catch (err) {
    console.error(`✖ ${name}`)
    throw err
  }
}

run('deleteAsset blocks when asset in use', async () => {
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
