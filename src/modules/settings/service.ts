import { Prisma } from '@prisma/client'
import { ChangeTopic } from '../../lib/events'
import { SettingsUpdateInput } from './schema'
import { DefaultPriceWrite, SettingsPersistenceInput, SettingsRepo } from './repo'

type DiscoverySetter = (input: { mode?: 'server' | 'client' }) => Promise<void>

export type SettingsServiceDeps = {
  repo: SettingsRepo
  emitChange: (topic: ChangeTopic) => void
  setDiscoveryConfig: DiscoverySetter
}

export type SettingsService = ReturnType<typeof createSettingsService>

export function createSettingsService(deps: SettingsServiceDeps) {
  return {
    async getSettings() {
      const settings = await deps.repo.ensureSettings()
      const defaults = await deps.repo.listDefaultPrices()
      const maps = buildDefaultPriceMaps(defaults)
      return { ...settings, ...maps }
    },

    async updateSettings(input: SettingsUpdateInput) {
      const normalized = normalizeSettingsInput(input)
      const payload: SettingsPersistenceInput = {
        update: normalized.updateData,
        create: normalized.createData,
      }
      const updated = await deps.repo.upsertSettings(payload)
      if (normalized.defaultPriceWrites.length) {
        await deps.repo.upsertDefaultPrices(normalized.defaultPriceWrites)
      }
      if (normalized.desiredMode) {
        await deps.setDiscoveryConfig({ mode: normalized.desiredMode })
      }
      deps.emitChange('settings')
      return updated
    },
  }
}

export function buildDefaultPriceMaps(records: Array<{ serveSizeId: number; amountMinor: number; isGuest: boolean }>) {
  const defaultPrices: Record<string, number> = {}
  const defaultGuestPrices: Record<string, number> = {}
  for (const rec of records) {
    const key = String(rec.serveSizeId)
    if (rec.isGuest) defaultGuestPrices[key] = rec.amountMinor
    else defaultPrices[key] = rec.amountMinor
  }
  return { defaultPrices, defaultGuestPrices }
}

type NormalizedSettingsInput = {
  updateData: Prisma.GlobalSettingsUpdateInput
  createData: Prisma.GlobalSettingsCreateInput
  defaultPriceWrites: DefaultPriceWrite[]
  desiredMode?: 'server' | 'client'
}

export function normalizeSettingsInput(input: SettingsUpdateInput): NormalizedSettingsInput {
  const {
    defaultPrices,
    defaultGuestPrices,
    logoAssetId,
    backgroundAssetId,
    backgroundPreset,
    ...scalarSettings
  } = input

  const updateData: Prisma.GlobalSettingsUpdateInput = { ...scalarSettings }
  const createData: Prisma.GlobalSettingsCreateInput = { id: 1, ...scalarSettings }

  applyRelation(updateData, createData, 'logoAsset', logoAssetId)
  applyRelation(updateData, createData, 'backgroundAsset', backgroundAssetId)

  if (backgroundPreset !== undefined) {
    updateData.backgroundPreset = backgroundPreset
    createData.backgroundPreset = backgroundPreset
  }

  const defaultPriceWrites: DefaultPriceWrite[] = []
  collectDefaultPriceWrites(defaultPrices, false, defaultPriceWrites)
  collectDefaultPriceWrites(defaultGuestPrices, true, defaultPriceWrites)

  return {
    updateData,
    createData,
    defaultPriceWrites,
    desiredMode: input.mode,
  }
}

function applyRelation(
  updateData: Prisma.GlobalSettingsUpdateInput,
  createData: Prisma.GlobalSettingsCreateInput,
  field: 'logoAsset' | 'backgroundAsset',
  idValue?: number | null
) {
  if (idValue === undefined) return
  if (idValue === null) {
    updateData[field] = { disconnect: true }
    return
  }
  updateData[field] = { connect: { id: Number(idValue) } }
  createData[field] = { connect: { id: Number(idValue) } }
}

function collectDefaultPriceWrites(
  entries: Record<string, number> | undefined,
  isGuest: boolean,
  acc: DefaultPriceWrite[]
) {
  if (!entries) return
  for (const [serveSizeId, amount] of Object.entries(entries)) {
    acc.push({
      serveSizeId: Number(serveSizeId),
      amountMinor: Number(amount),
      isGuest,
    })
  }
}
