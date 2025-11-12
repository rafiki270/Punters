import { DefaultPrice, GlobalSettings, Prisma, PrismaClient } from '@prisma/client'

const DEFAULT_SETTINGS_SEED: Prisma.GlobalSettingsCreateInput = {
  id: 1,
  themeMode: 'dark',
  rotationSec: 90,
  defaultDisplayMode: 'all',
  currency: 'GBP',
  locale: 'en-GB',
  mode: 'server',
}

export type SettingsPersistenceInput = {
  update: Prisma.GlobalSettingsUpdateInput
  create: Prisma.GlobalSettingsCreateInput
}

export type DefaultPriceWrite = {
  serveSizeId: number
  amountMinor: number
  isGuest: boolean
}

export interface SettingsRepo {
  ensureSettings(): Promise<GlobalSettings>
  listDefaultPrices(): Promise<DefaultPrice[]>
  upsertSettings(payload: SettingsPersistenceInput): Promise<GlobalSettings>
  upsertDefaultPrices(entries: DefaultPriceWrite[]): Promise<void>
}

export function createSettingsRepo(prisma: PrismaClient): SettingsRepo {
  return {
    async ensureSettings() {
      const existing = await prisma.globalSettings.findUnique({ where: { id: 1 } })
      if (existing) return existing
      return prisma.globalSettings.create({ data: DEFAULT_SETTINGS_SEED })
    },
    listDefaultPrices() {
      return prisma.defaultPrice.findMany()
    },
    upsertSettings(payload) {
      return prisma.globalSettings.upsert({ where: { id: 1 }, update: payload.update, create: payload.create })
    },
    async upsertDefaultPrices(entries) {
      if (!entries.length) return
      await Promise.all(entries.map(entry => prisma.defaultPrice.upsert({
        where: { serveSizeId_isGuest: { serveSizeId: entry.serveSizeId, isGuest: entry.isGuest } },
        update: { amountMinor: entry.amountMinor },
        create: { serveSizeId: entry.serveSizeId, amountMinor: entry.amountMinor, isGuest: entry.isGuest },
      })))
    },
  }
}
