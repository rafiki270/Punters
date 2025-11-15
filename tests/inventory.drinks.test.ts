import test from 'node:test'
import assert from 'node:assert/strict'
import { createDrinksService } from '../src/modules/inventory/drinks'
import { PrismaClient } from '@prisma/client'

test('createDrink creates category when only name is provided', async () => {
  let createdCategory = false
  let createdDrinkData: any = null
  const prisma = {
    drinkCategory: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        createdCategory = true
        return { id: 33, ...data }
      },
    },
    drink: {
      create: async ({ data }: any) => {
        createdDrinkData = data
        return { id: 77, ...data }
      },
    },
  } as unknown as PrismaClient
  const emitted: string[] = []
  const service = createDrinksService({ prisma, emitChange: (topic) => emitted.push(topic) })
  const drink = await service.createDrink({ name: 'Cider', categoryName: 'Ciders' })
  assert.equal(drink.id, 77)
  assert.equal(createdCategory, true)
  assert.equal(createdDrinkData.disabled, false)
  assert.deepEqual(emitted, ['drinks'])
})

test('listDrinks forwards disabled filter', async () => {
  let receivedWhere: any = null
  const prisma = {
    drinkCategory: {} as any,
    drink: {
      findMany: async ({ where }: any) => {
        receivedWhere = where
        return []
      },
    },
  } as unknown as PrismaClient
  const service = createDrinksService({ prisma, emitChange: () => {} })
  await service.listDrinks({ active: true, disabled: false })
  assert.ok(receivedWhere)
  assert.equal(receivedWhere.active, true)
  assert.equal(receivedWhere.disabled, false)
})
