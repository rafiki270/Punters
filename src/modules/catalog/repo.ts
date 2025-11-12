import {
  DefaultPrice,
  GlobalSettings,
  Prisma,
  PrismaClient,
  ServeSize,
} from '@prisma/client'

export type BeerPriceCreateManyInput = {
  beerId: number
  serveSizeId: number
  amountMinor: number
  currency: string
}

export interface CatalogRepo {
  listSizes(): Promise<ServeSize[]>
  createSize(data: Prisma.ServeSizeCreateInput): Promise<ServeSize>
  updateSize(id: number, data: Prisma.ServeSizeUpdateInput): Promise<ServeSize>
  deleteSize(id: number): Promise<void>
  countSizeUsage(id: number): Promise<number>
  defaultPricesForBeer(isGuest: boolean): Promise<Array<Pick<DefaultPrice, 'serveSizeId' | 'amountMinor'>>>
  currency(): Promise<string>
  insertBeerPrices(entries: BeerPriceCreateManyInput[]): Promise<void>
}

export function createCatalogRepo(prisma: PrismaClient): CatalogRepo {
  return {
    listSizes() {
      return prisma.serveSize.findMany({ orderBy: { displayOrder: 'asc' } })
    },
    createSize(data) {
      return prisma.serveSize.create({ data })
    },
    updateSize(id, data) {
      return prisma.serveSize.update({ where: { id }, data })
    },
    async deleteSize(id) {
      await prisma.serveSize.delete({ where: { id } })
    },
    async countSizeUsage(id) {
      const beerPriceCount = await prisma.price.count({ where: { serveSizeId: id } })
      let drinkPriceCount = 0
      try {
        drinkPriceCount = await prisma.drinkPrice.count({ where: { serveSizeId: id } })
      } catch {
        drinkPriceCount = 0
      }
      return beerPriceCount + drinkPriceCount
    },
    defaultPricesForBeer(isGuest) {
      return prisma.defaultPrice.findMany({
        where: { isGuest, serveSize: { forBeers: true } },
        select: { serveSizeId: true, amountMinor: true },
      })
    },
    async currency() {
      const settings = await prisma.globalSettings.findUnique({ where: { id: 1 } })
      return settings?.currency || 'GBP'
    },
    async insertBeerPrices(entries) {
      if (!entries.length) return
      await prisma.price.createMany({ data: entries })
    },
  }
}
