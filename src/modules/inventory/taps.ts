import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { httpError } from '../../core/http'
import { ChangeTopic } from '../../lib/events'
import { PrefillBeerPrices } from './beers'

export const TapAssignSchema = z.object({
  beerId: z.number().int().optional(),
  beer: z
    .object({
      name: z.string().min(1),
      brewery: z.string().min(1),
      style: z.string().min(1),
      abv: z.number().optional(),
      ibu: z.number().int().optional(),
      description: z.string().optional(),
      colorHex: z.string().optional(),
      tags: z.string().optional(),
      badgeAssetId: z.number().int().optional(),
      isGuest: z.boolean().optional(),
    })
    .optional(),
})

export const TapStatusSchema = z.object({ status: z.enum(['on', 'off', 'coming_soon', 'kicked']) })
export const TapConfigSchema = z.object({ count: z.number().int().nonnegative() })

export type TapAssignInput = z.infer<typeof TapAssignSchema>

export function createTapsService({
  prisma,
  emitChange,
  prefillBeerPrices,
}: {
  prisma: PrismaClient
  emitChange: (topic: ChangeTopic) => void
  prefillBeerPrices: PrefillBeerPrices
}) {
  return {
    list: async () => {
      const taps = await prisma.tap.findMany({ include: { beer: true }, orderBy: { number: 'asc' } })
      return taps.map((t) => ({
        tapNumber: t.number,
        status: t.status,
        beer: t.beer
          ? {
              id: t.beer.id,
              name: t.beer.name,
              brewery: t.beer.brewery,
              style: t.beer.style,
              abv: t.beer.abv,
              badgeAssetId: t.beer.badgeAssetId,
              isGuest: t.beer.isGuest,
            }
          : null,
      }))
    },

    listDisplayBeers: async () => {
      const taps = await prisma.tap.findMany({
        where: { beerId: { not: null } },
        include: { beer: { include: { prices: { include: { size: true } } } } },
        orderBy: { number: 'asc' },
      })
      return taps.map((t) => ({
        tapNumber: t.number,
        status: t.status,
        beer: t.beer
          ? {
              id: t.beer.id,
              name: t.beer.name,
              brewery: t.beer.brewery,
              style: t.beer.style,
              abv: t.beer.abv,
              badgeAssetId: t.beer.badgeAssetId,
              isGuest: t.beer.isGuest,
              colorHex: (t.beer as any).colorHex,
              prices: t.beer.prices,
            }
          : null,
      }))
    },

    async setTapCount(count: number) {
      const existing = await prisma.tap.findMany()
      const existingNums = new Set(existing.map((t) => t.number))
      const toCreate: number[] = []
      for (let i = 1; i <= count; i += 1) {
        if (!existingNums.has(i)) toCreate.push(i)
      }
      if (toCreate.length) {
        await prisma.tap.createMany({ data: toCreate.map((n) => ({ number: n })) })
      }
      const toRemove = existing.filter((t) => t.number > count)
      for (const tap of toRemove) {
        await prisma.tap.delete({ where: { number: tap.number } })
      }
      const taps = await prisma.tap.findMany({ orderBy: { number: 'asc' } })
      emitChange('taps')
      return { count, taps }
    },

    async assignTap(number: number, payload: TapAssignInput) {
      await prisma.tap.upsert({ where: { number }, update: {}, create: { number } })
      let beerId = payload.beerId
      if (!beerId && payload.beer) {
        const beer = await prisma.beer.create({ data: { ...payload.beer, isGuest: !!payload.beer.isGuest } })
        beerId = beer.id
      }
      if (!beerId) throw httpError(400, 'beerId or beer payload required')

      const latest = await prisma.tapAssignment.findFirst({
        where: { tapNumber: number, removedAt: null },
        orderBy: { assignedAt: 'desc' },
      })
      if (latest) {
        await prisma.tapAssignment.update({ where: { id: latest.id }, data: { removedAt: new Date(), removedReason: 'replaced' } })
      }

      await prisma.tap.update({ where: { number }, data: { beerId, status: 'on' } })
      await prisma.tapAssignment.create({ data: { tapNumber: number, beerId } })

      const priceCount = await prisma.price.count({ where: { beerId } })
      if (priceCount === 0) {
        const beer = await prisma.beer.findUnique({ where: { id: beerId } })
        await prefillBeerPrices({ beerId, isGuest: !!beer?.isGuest })
      }

      emitChange('taps')
      return { ok: true }
    },

    async clearTap(number: number) {
      const tap = await prisma.tap.findUnique({ where: { number } })
      if (!tap) return { ok: true }
      if (tap.beerId != null) {
        const latest = await prisma.tapAssignment.findFirst({
          where: { tapNumber: number, removedAt: null },
          orderBy: { assignedAt: 'desc' },
        })
        if (latest) {
          await prisma.tapAssignment.update({ where: { id: latest.id }, data: { removedAt: new Date(), removedReason: 'cleared' } })
        }
      }
      await prisma.tap.update({ where: { number }, data: { beerId: null } })
      emitChange('taps')
      return { ok: true }
    },

    async setStatus(number: number, status: 'on' | 'off' | 'coming_soon' | 'kicked') {
      await prisma.tap.upsert({ where: { number }, update: { status }, create: { number, status } })
      if (status === 'kicked') {
        const latest = await prisma.tapAssignment.findFirst({
          where: { tapNumber: number, removedAt: null },
          orderBy: { assignedAt: 'desc' },
        })
        if (latest) {
          await prisma.tapAssignment.update({ where: { id: latest.id }, data: { removedAt: new Date(), removedReason: 'kicked' } })
        }
      }
      emitChange('taps')
      return { ok: true }
    },

    async history(number: number) {
      return prisma.tapAssignment.findMany({
        where: { tapNumber: number },
        include: { beer: true },
        orderBy: { assignedAt: 'desc' },
      })
    },
  }
}
