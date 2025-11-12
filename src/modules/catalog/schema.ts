import { z } from 'zod'

export const SizeCreateSchema = z.object({
  name: z.string().min(1),
  volumeMl: z.number().int().positive(),
  displayOrder: z.number().int().optional(),
  forBeers: z.boolean().optional(),
  forDrinks: z.boolean().optional(),
})

export const SizeUpdateSchema = SizeCreateSchema.partial()

export type SizeCreateInput = z.infer<typeof SizeCreateSchema>
export type SizeUpdateInput = z.infer<typeof SizeUpdateSchema>
