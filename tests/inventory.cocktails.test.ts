import test from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { createCocktailsService } from '../src/modules/inventory/cocktails'

test('create cocktail inherits global currency and emits change', async () => {
  const prisma = {
    globalSettings: {
      findUnique: async () => ({ currency: 'EUR' }),
    },
    cocktail: {
      create: async ({ data }: any) => ({ id: 10, ...data }),
    },
  } as unknown as PrismaClient
  const emitted: string[] = []
  const service = createCocktailsService({ prisma, emitChange: (topic) => emitted.push(topic) })
  const cocktail = await service.create({ name: 'Negroni', priceMinor: 950 })
  assert.equal(cocktail.currency, 'EUR')
  assert.equal(cocktail.priceMinor, 950)
  assert.deepEqual(emitted, ['cocktails'])
})

test('softDelete marks cocktail inactive', async () => {
  const prisma = {
    globalSettings: {
      findUnique: async () => ({ currency: 'GBP' }),
    },
    cocktail: {
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
  } as unknown as PrismaClient
  const emitted: string[] = []
  const service = createCocktailsService({ prisma, emitChange: (topic) => emitted.push(topic) })
  const updated = await service.softDelete(42)
  assert.equal(updated.active, false)
  assert.deepEqual(emitted, ['cocktails'])
})
