import assert from 'node:assert/strict'
import { createDrinksService } from '../src/modules/inventory/drinks'
import { PrismaClient } from '@prisma/client'

async function run(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`✔ ${name}`)
  } catch (err) {
    console.error(`✖ ${name}`)
    throw err
  }
}

run('createDrink creates category when only name is provided', async () => {
  let createdCategory = false
  const prisma = {
    drinkCategory: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createdCategory = true
        return { id: 33, ...data }
      },
    },
    drink: {
      create: async ({ data }: any) => ({ id: 77, ...data }),
    },
  } as unknown as PrismaClient
  const emitted: string[] = []
  const service = createDrinksService({ prisma, emitChange: (topic) => emitted.push(topic) })
  const drink = await service.createDrink({ name: 'Cider', categoryName: 'Ciders' })
  assert.equal(drink.id, 77)
  assert.equal(createdCategory, true)
  assert.deepEqual(emitted, ['drinks'])
})
