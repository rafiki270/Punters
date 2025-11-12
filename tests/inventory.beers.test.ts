import test from 'node:test'
import assert from 'node:assert/strict'
import { createBeersService } from '../src/modules/inventory/beers'
import { PrismaClient } from '@prisma/client'

type MockPrisma = Partial<Record<keyof PrismaClient, any>>

function createService(prismaOverrides: MockPrisma, prefillSpy: () => Promise<void> = async () => {}) {
  const prisma = prismaOverrides as PrismaClient
  const changes: string[] = []
  const service = createBeersService({
    prisma,
    emitChange: (topic) => changes.push(topic),
    prefillBeerPrices: async () => prefillSpy(),
  })
  return { service, changes }
}

test('create beer triggers prefill and emits change', async () => {
  let prefills = 0
  const prisma = {
    beer: {
      create: async ({ data }: any) => ({ id: 10, ...data }),
    },
  }
  const { service, changes } = createService(prisma, async () => {
    prefills += 1
  })
  const created = await service.create({ name: 'Test', brewery: 'Demo', style: 'IPA', prefillPrices: true })
  assert.equal(created.id, 10)
  assert.equal(prefills, 1)
  assert.deepEqual(changes, ['beers'])
})

test('update clears unused badge assets', async () => {
  let deleted = false
  const prisma = {
    beer: {
      findUnique: async () => ({ badgeAssetId: 5 }),
      update: async ({ data }: any) => ({ id: 1, ...data }),
      count: async () => 0,
    },
    globalSettings: {
      count: async () => 0,
    },
    asset: {
      delete: async () => {
        deleted = true
      },
    },
  }
  const { service } = createService(prisma)
  await service.update(1, { badgeAssetId: null })
  assert.equal(deleted, true)
})
