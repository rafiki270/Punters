import assert from 'node:assert/strict'
import { createCatalogService, SizeInUseError } from '../src/modules/catalog/service'
import { CatalogRepo } from '../src/modules/catalog/repo'

type Mock = Partial<CatalogRepo>

function makeRepo(overrides: Mock = {}): CatalogRepo {
  const notImpl = () => {
    throw new Error('not implemented')
  }
  return {
    listSizes: overrides.listSizes || notImpl,
    createSize: overrides.createSize || notImpl,
    updateSize: overrides.updateSize || notImpl,
    deleteSize: overrides.deleteSize || notImpl,
    countSizeUsage: overrides.countSizeUsage || notImpl,
    defaultPricesForBeer: overrides.defaultPricesForBeer || notImpl,
    currency: overrides.currency || notImpl,
    insertBeerPrices: overrides.insertBeerPrices || notImpl,
  }
}

function run(name: string, fn: () => Promise<void> | void) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`✔ ${name}`))
    .catch((err) => {
      console.error(`✖ ${name}`)
      console.error(err)
      process.exitCode = 1
    })
}

run('prefillBeerPrices writes defaults with current currency', async () => {
  const inserted: any[] = []
  const service = createCatalogService({
    repo: makeRepo({
      defaultPricesForBeer: async () => [{ serveSizeId: 1, amountMinor: 450 }],
      currency: async () => 'GBP',
      insertBeerPrices: async (entries) => {
        inserted.push(...entries)
      },
    }),
    emitChange: () => {},
  })

  await service.prefillBeerPrices({ beerId: 42, isGuest: false })

  assert.equal(inserted.length, 1)
  assert.deepEqual(inserted[0], { beerId: 42, serveSizeId: 1, amountMinor: 450, currency: 'GBP' })
})

run('deleteSize throws when counts exist', async () => {
  const service = createCatalogService({
    repo: makeRepo({
      countSizeUsage: async () => 2,
      deleteSize: async () => {},
    }),
    emitChange: () => {},
  })

  let caught = false
  try {
    await service.deleteSize(5)
  } catch (err) {
    caught = err instanceof SizeInUseError
  }
  assert.equal(caught, true)
})
