import { z } from 'zod'

export const AssetUpdateSchema = z.object({
  allowPair: z.boolean().optional(),
  fullscreen: z.boolean().optional(),
  requireLogo: z.boolean().optional(),
  hideLogo: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
})

export const AssetOrderSchema = z.object({
  ids: z.array(z.number().int()),
})
