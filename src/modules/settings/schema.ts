import { z } from 'zod'

const SettingsBaseSchema = z.object({
  themeMode: z.enum(['light', 'dark']),
  rotationSec: z.coerce.number().int().min(5).max(3600),
  defaultDisplayMode: z.enum(['all', 'beer', 'ads']),
  currency: z.string().min(1).max(8),
  defaultSizeId: z.coerce.number().int().nullable().optional(),
  defaultPrices: z.record(z.string(), z.coerce.number().int().nonnegative()).optional(),
  defaultGuestPrices: z.record(z.string(), z.coerce.number().int().nonnegative()).optional(),
  locale: z.string().min(2).max(10),
  mode: z.enum(['server', 'client']).optional(),
  logoAssetId: z.coerce.number().int().nullable().optional(),
  backgroundAssetId: z.coerce.number().int().nullable().optional(),
  backgroundPreset: z.string().min(1).max(200).nullable().optional(),
  cellScale: z.coerce.number().int().min(0).max(100).optional(),
  columnGap: z.coerce.number().int().min(0).max(200).optional(),
  logoPosition: z.enum(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-right']).optional(),
  logoScale: z.coerce.number().int().min(10).max(300).optional(),
  bgPosition: z.enum(['center', 'top', 'bottom', 'left', 'right']).optional(),
  bgScale: z.coerce.number().int().min(50).max(300).optional(),
  drinksCellScale: z.coerce.number().int().min(0).max(100).optional(),
  drinksItemsPerCol: z.coerce.number().int().min(1).max(200).optional(),
  drinksIndentPct: z.coerce.number().int().min(0).max(30).optional(),
  logoBgEnabled: z.coerce.boolean().optional(),
  logoBgColor: z.string().min(1).max(20).optional(),
  logoBgRounded: z.coerce.boolean().optional(),
  logoBgRadius: z.coerce.number().int().min(0).max(200).optional(),
  bgOpacity: z.coerce.number().int().min(0).max(100).optional(),
  logoPadX: z.coerce.number().int().min(0).max(200).optional(),
  logoPadY: z.coerce.number().int().min(0).max(200).optional(),
  pageBgColor: z.string().min(1).max(20).optional(),
  showFooter: z.coerce.boolean().optional(),
  beerColumns: z.coerce.number().int().min(1).max(6).optional(),
  itemsPerPage: z.coerce.number().int().min(1).max(500).optional(),
})

export const SettingsUpdateSchema = SettingsBaseSchema.partial()
export type SettingsUpdateInput = z.infer<typeof SettingsUpdateSchema>
