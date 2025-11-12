import { ChangeTopic } from '../../lib/events'
import { SizeCreateInput, SizeUpdateInput } from './schema'
import { BeerPriceCreateManyInput, CatalogRepo } from './repo'

export class SizeInUseError extends Error {
  constructor(message = 'Cannot delete size with existing prices') {
    super(message)
  }
}

export type CatalogServiceDeps = {
  repo: CatalogRepo
  emitChange: (topic: ChangeTopic) => void
}

export type CatalogService = ReturnType<typeof createCatalogService>

export function createCatalogService({ repo, emitChange }: CatalogServiceDeps) {
  return {
    listSizes() {
      return repo.listSizes()
    },

    async createSize(input: SizeCreateInput) {
      const data = {
        ...input,
        forBeers: input.forBeers ?? true,
        forDrinks: input.forDrinks ?? true,
      }
      const created = await repo.createSize(data)
      emitChange('sizes')
      return created
    },

    async updateSize(id: number, input: SizeUpdateInput) {
      const updated = await repo.updateSize(id, input)
      emitChange('sizes')
      return updated
    },

    async deleteSize(id: number) {
      const usage = await repo.countSizeUsage(id)
      if (usage > 0) throw new SizeInUseError()
      await repo.deleteSize(id)
      emitChange('sizes')
    },

    async prefillBeerPrices(opts: { beerId: number; isGuest: boolean }) {
      const defaults = await repo.defaultPricesForBeer(opts.isGuest)
      if (!defaults.length) return
      const currency = await repo.currency()
      const entries: BeerPriceCreateManyInput[] = defaults.map((d) => ({
        beerId: opts.beerId,
        serveSizeId: d.serveSizeId,
        amountMinor: d.amountMinor,
        currency,
      }))
      await repo.insertBeerPrices(entries)
    },
  }
}
