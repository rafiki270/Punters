import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { prisma } from '../../core/prisma'
import { httpError } from '../../core/errors'
import type { AssetUrls } from '@punters/shared'

/**
 * Upload pipeline: probe the image, emit WebP renditions (never larger than the
 * source), keep the original as a fallback. Displays pick the rendition that fits.
 */

export const MEDIA_ROOT = path.resolve(process.env.MEDIA_DIR ?? path.join(process.cwd(), 'data', 'media'))

const RENDITIONS: { label: string; width: number }[] = [
  { label: 'thumb', width: 320 },
  { label: 'sm', width: 640 },
  { label: 'md', width: 1280 },
  { label: 'lg', width: 1920 },
]

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface AssetWithUrls {
  id: number
  purpose: string
  tag: string | null
  originalName: string
  mime: string
  width: number | null
  height: number | null
  sizeBytes: number
  createdAt: Date
  urls: AssetUrls
  /** Total bytes across WebP renditions, to show optimization savings in the admin. */
  optimizedBytes: number
}

export function variantUrl(assetId: number, fileName: string): string {
  return `/media/${assetId}/${fileName}`
}

function buildUrls(assetId: number, variants: { label: string; fileName: string }[]): AssetUrls {
  const byLabel = Object.fromEntries(variants.map((v) => [v.label, variantUrl(assetId, v.fileName)]))
  const fallback = byLabel['orig'] ?? Object.values(byLabel)[0] ?? ''
  return {
    thumb: byLabel['thumb'] ?? byLabel['sm'] ?? fallback,
    sm: byLabel['sm'] ?? byLabel['thumb'] ?? fallback,
    md: byLabel['md'] ?? byLabel['sm'] ?? fallback,
    lg: byLabel['lg'] ?? byLabel['md'] ?? fallback,
  }
}

export async function assetUrlsById(assetId: number | null | undefined): Promise<AssetUrls | null> {
  if (!assetId) return null
  const variants = await prisma.assetVariant.findMany({ where: { assetId } })
  if (variants.length === 0) return null
  return buildUrls(assetId, variants)
}

export function toAssetWithUrls(asset: {
  id: number
  purpose: string
  tag: string | null
  originalName: string
  mime: string
  width: number | null
  height: number | null
  sizeBytes: number
  createdAt: Date
  variants: { label: string; fileName: string; sizeBytes: number; format: string }[]
}): AssetWithUrls {
  const optimizedBytes = asset.variants
    .filter((v) => v.label !== 'orig')
    .reduce((a, v) => a + v.sizeBytes, 0)
  return {
    id: asset.id,
    purpose: asset.purpose,
    tag: asset.tag,
    originalName: asset.originalName,
    mime: asset.mime,
    width: asset.width,
    height: asset.height,
    sizeBytes: asset.sizeBytes,
    createdAt: asset.createdAt,
    urls: buildUrls(asset.id, asset.variants),
    optimizedBytes,
  }
}

export async function createAsset(input: {
  buffer: Buffer
  originalName: string
  mime: string
  purpose: string
  tag?: string | null
}): Promise<AssetWithUrls> {
  if (!ALLOWED_MIME.has(input.mime)) {
    throw httpError(400, `Unsupported image type '${input.mime}' — use JPG, PNG, or WebP`)
  }

  let meta: sharp.Metadata
  try {
    meta = await sharp(input.buffer).metadata()
  } catch {
    throw httpError(400, 'File is not a readable image')
  }
  const srcWidth = meta.width ?? 0
  const srcHeight = meta.height ?? 0
  if (!srcWidth || !srcHeight) throw httpError(400, 'Could not read image dimensions')

  const asset = await prisma.asset.create({
    data: {
      purpose: input.purpose,
      tag: input.tag ?? null,
      originalName: input.originalName,
      mime: input.mime,
      width: srcWidth,
      height: srcHeight,
      sizeBytes: input.buffer.length,
    },
  })

  const dir = path.join(MEDIA_ROOT, String(asset.id))
  await mkdir(dir, { recursive: true })

  const variantRows: { label: string; format: string; width: number; height: number; sizeBytes: number; fileName: string }[] = []

  for (const r of RENDITIONS) {
    const targetWidth = Math.min(r.width, srcWidth)
    const out = await sharp(input.buffer)
      .rotate() // respect EXIF orientation
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true })
    const fileName = `${r.label}.webp`
    await writeFile(path.join(dir, fileName), out.data)
    variantRows.push({
      label: r.label,
      format: 'webp',
      width: out.info.width,
      height: out.info.height,
      sizeBytes: out.info.size,
      fileName,
    })
    // Don't emit duplicate renditions once the source width is exhausted.
    if (targetWidth === srcWidth) break
  }

  const ext = input.mime === 'image/png' ? 'png' : input.mime === 'image/webp' ? 'webp' : 'jpg'
  const origName = `orig.${ext}`
  await writeFile(path.join(dir, origName), input.buffer)
  variantRows.push({ label: 'orig', format: ext, width: srcWidth, height: srcHeight, sizeBytes: input.buffer.length, fileName: origName })

  await prisma.assetVariant.createMany({ data: variantRows.map((v) => ({ ...v, assetId: asset.id })) })

  const full = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id }, include: { variants: true } })
  return toAssetWithUrls(full)
}

export async function deleteAsset(id: number): Promise<void> {
  const refs = await prisma.item.count({
    where: { OR: [{ imageAssetId: id }, { badgeAssetId: id }] },
  })
  if (refs > 0) throw httpError(409, `Image is used by ${refs} item(s) — remove it there first`)
  const settingsRefs = await prisma.settings.count({
    where: { OR: [{ logoAssetId: id }, { backgroundAssetId: id }] },
  })
  if (settingsRefs > 0) throw httpError(409, 'Image is used as the venue logo or background')

  await prisma.asset.delete({ where: { id } }) // variants cascade
  await rm(path.join(MEDIA_ROOT, String(id)), { recursive: true, force: true })
}
