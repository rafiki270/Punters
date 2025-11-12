import { z } from 'zod'

export const DeviceCreateSchema = z.object({
  name: z.string().min(1),
  role: z.enum(['main', 'client']).default('client'),
  screenGroupId: z.number().int().nullable().optional(),
  screenIndex: z.number().int().min(1).default(1),
  displayMode: z.enum(['inherit', 'all', 'beer', 'ads']).default('inherit'),
  beerColumns: z.number().int().min(1).max(4).default(1),
  itemsPerColumn: z.number().int().min(1).max(30).default(10),
  cellScale: z.number().int().min(0).max(100).nullable().optional(),
  columnGap: z.number().int().min(0).max(200).nullable().optional(),
  logoPosition: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).nullable().optional(),
  logoScale: z.number().int().min(10).max(300).nullable().optional(),
  bgPosition: z.enum(['center','top','bottom','left','right']).nullable().optional(),
  bgScale: z.number().int().min(50).max(300).nullable().optional(),
})

export const DeviceUpdateSchema = DeviceCreateSchema.partial()
