import { PrismaClient } from '@prisma/client'
import sizeOf from 'image-size'
import { ChangeTopic } from '../../lib/events'
import { httpError } from '../../core/http'
import { AssetOrderSchema, AssetUpdateSchema } from './schema'

export type MediaServiceDeps = {
  prisma: PrismaClient
  emitChange: (topic: ChangeTopic) => void
}

export function createMediaService({ prisma, emitChange }: MediaServiceDeps) {
  return {
    listAssets() {
      return prisma.asset.findMany({
        where: {
          beersWithBadge: { none: {} },
          OR: [
            { tags: null },
            { tags: '' },
            { tags: { notIn: ['style:logo', 'style:background', 'drink:logo', 'cocktail:image'] } },
          ],
        },
        orderBy: [
          { displayOrder: 'asc' },
          { createdAt: 'desc' },
        ],
      })
    },

    async updateAsset(id: number, payload: unknown) {
      const data = AssetUpdateSchema.parse(payload)
      try {
        const updated = await prisma.asset.update({
          where: { id },
          data: {
            allowPair: data.allowPair ?? undefined,
            fullscreen: data.fullscreen ?? undefined,
            requireLogo: data.requireLogo ?? undefined,
            hideLogo: data.hideLogo ?? undefined,
            visible: data.visible ?? undefined,
            displayOrder: data.displayOrder ?? undefined,
          },
        })
        emitChange('media')
        return updated
      } catch {
        throw httpError(404, 'Not found')
      }
    },

    async reorderAssets(payload: unknown) {
      const { ids } = AssetOrderSchema.parse(payload)
      for (let i = 0; i < ids.length; i += 1) {
        await prisma.asset.update({ where: { id: ids[i] }, data: { displayOrder: i } })
      }
      emitChange('media')
      return { ok: true }
    },

    async uploadAsset(mp: any) {
      if (!mp) throw httpError(400, 'No file')
      const mime = mp.mimetype || ''
      if (!['image/jpeg', 'image/png'].includes(mime)) {
        throw httpError(400, 'Only JPG/PNG allowed')
      }
      const chunks: Buffer[] = []
      for await (const chunk of mp.file) chunks.push(chunk as Buffer)
      if ((mp.file as any)?.truncated) {
        throw httpError(413, 'File too large (truncated)')
      }
      const buf = Buffer.concat(chunks)
      let dims: any
      try { dims = sizeOf(buf) } catch {}
      const tag = (mp.fields?.tag?.value as string | undefined) || ''
      const asset = await prisma.asset.create({
        data: {
          type: 'image',
          filename: mp.filename || 'upload',
          mimeType: mime,
          width: typeof dims?.width === 'number' ? dims.width : null,
          height: typeof dims?.height === 'number' ? dims.height : null,
          sizeBytes: buf.length,
          data: buf,
          tags: tag,
          fullscreen: true,
        },
      })
      emitChange('media')
      return asset
    },

    async deleteAsset(id: number) {
      const beerUse = await prisma.beer.count({ where: { badgeAssetId: id } })
      const drinkUse = await prisma.drink.count({ where: { logoAssetId: id } }).catch(() => 0)
      const cocktailUse = await prisma.cocktail.count({ where: { imageAssetId: id } }).catch(() => 0)
      if (beerUse > 0 || (drinkUse ?? 0) > 0 || (cocktailUse ?? 0) > 0) {
        throw httpError(400, 'Asset is in use and cannot be deleted from Media.')
      }
      await prisma.asset.delete({ where: { id } }).catch(() => {})
      emitChange('media')
      return { ok: true }
    },

    async streamAsset(id: number) {
      const asset = await prisma.asset.findUnique({ where: { id } })
      if (!asset || !asset.data) throw httpError(404, 'Not found')
      return asset
    },
  }
}
