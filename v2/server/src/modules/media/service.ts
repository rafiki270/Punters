import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { prisma } from '../../core/prisma'
import { httpError } from '../../core/errors'
import { probeVideo, extractPosterFrame } from './probe'
import type { AssetUrls } from '@punters/shared'

/**
 * Upload pipeline: probe the image, emit WebP renditions (never larger than the
 * source), keep the original as a fallback. Displays pick the rendition that fits.
 *
 * Videos bypass sharp entirely: the original (mp4/webm) is stored as-is under the
 * 'orig' variant. If `ffprobe`/`ffmpeg` are on PATH, we best-effort extract a duration
 * and a poster frame — the poster is then run through the same WebP rendition pipeline
 * so video ads/slots get real thumb/sm/md/lg previews. Neither binary is guaranteed to
 * be present, and probing a corrupt file can fail — either way the video is still
 * stored; only the poster/duration are skipped.
 */

export const MEDIA_ROOT = path.resolve(process.env.MEDIA_DIR ?? path.join(process.cwd(), 'data', 'media'))

const RENDITIONS: { label: string; width: number }[] = [
  { label: 'thumb', width: 320 },
  { label: 'sm', width: 640 },
  { label: 'md', width: 1280 },
  { label: 'lg', width: 1920 },
]

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const VIDEO_MIME = new Set(['video/mp4', 'video/webm'])
const ALLOWED_MIME = new Set([...IMAGE_MIME, ...VIDEO_MIME])

type MediaType = 'image' | 'video'

interface VariantRow {
  label: string
  format: string
  width: number
  height: number
  sizeBytes: number
  fileName: string
}

export interface AssetWithUrls {
  id: number
  purpose: string
  tag: string | null
  originalName: string
  mime: string
  mediaType: MediaType
  width: number | null
  height: number | null
  sizeBytes: number
  durationSec: number | null
  createdAt: Date
  urls: AssetUrls
  /** Only set for video assets — the /media/... URL of the stored original file. */
  videoUrl: string | null
  /** Total bytes across WebP renditions, to show optimization savings in the admin. */
  optimizedBytes: number
}

export interface AssetMedia {
  /** Poster/image URLs; null if this is a video with no extractable poster. */
  imageUrls: AssetUrls | null
  mediaType: MediaType
  videoUrl: string | null
  durationSec: number | null
}

export function variantUrl(assetId: number, fileName: string): string {
  return `/media/${assetId}/${fileName}`
}

function findVariant(variants: { label: string; fileName: string }[], label: string) {
  return variants.find((v) => v.label === label)
}

function origVariantUrl(assetId: number, variants: { label: string; fileName: string }[]): string | null {
  const orig = findVariant(variants, 'orig')
  return orig ? variantUrl(assetId, orig.fileName) : null
}

function buildUrls(
  assetId: number,
  variants: { label: string; fileName: string }[],
  mediaType: MediaType,
): AssetUrls {
  const byLabel = Object.fromEntries(variants.map((v) => [v.label, variantUrl(assetId, v.fileName)]))
  if (mediaType === 'video') {
    // 'orig' is the video file itself here — never a valid <img>/background-image src —
    // so poster renditions (thumb/sm/md/lg) are the only usable fallback chain. If none
    // were generated (no ffmpeg, or probing failed), every field is '' and callers must
    // treat that as "no poster available".
    const posterFallback = byLabel['lg'] ?? byLabel['md'] ?? byLabel['sm'] ?? byLabel['thumb'] ?? ''
    return {
      thumb: byLabel['thumb'] ?? posterFallback,
      sm: byLabel['sm'] ?? posterFallback,
      md: byLabel['md'] ?? posterFallback,
      lg: byLabel['lg'] ?? posterFallback,
    }
  }
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
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, include: { variants: true } })
  if (!asset || asset.variants.length === 0) return null
  return buildUrls(asset.id, asset.variants, asset.mediaType as MediaType)
}

/** Like assetUrlsById, but also reports mediaType/videoUrl/durationSec — for slots
 * (e.g. the single-image slot) that need to know whether to render a video instead. */
export async function assetMediaById(assetId: number | null | undefined): Promise<AssetMedia | null> {
  if (!assetId) return null
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, include: { variants: true } })
  if (!asset || asset.variants.length === 0) return null
  const mediaType = asset.mediaType as MediaType
  const urls = buildUrls(asset.id, asset.variants, mediaType)
  const hasPoster = urls.thumb !== ''
  return {
    imageUrls: hasPoster ? urls : null,
    mediaType,
    videoUrl: mediaType === 'video' ? origVariantUrl(asset.id, asset.variants) : null,
    durationSec: asset.durationSec,
  }
}

export function toAssetWithUrls(asset: {
  id: number
  purpose: string
  tag: string | null
  originalName: string
  mime: string
  mediaType: string
  width: number | null
  height: number | null
  sizeBytes: number
  durationSec: number | null
  createdAt: Date
  variants: { label: string; fileName: string; sizeBytes: number; format: string }[]
}): AssetWithUrls {
  const optimizedBytes = asset.variants
    .filter((v) => v.label !== 'orig')
    .reduce((a, v) => a + v.sizeBytes, 0)
  const mediaType = asset.mediaType as MediaType
  return {
    id: asset.id,
    purpose: asset.purpose,
    tag: asset.tag,
    originalName: asset.originalName,
    mime: asset.mime,
    mediaType,
    width: asset.width,
    height: asset.height,
    sizeBytes: asset.sizeBytes,
    durationSec: asset.durationSec,
    createdAt: asset.createdAt,
    urls: buildUrls(asset.id, asset.variants, mediaType),
    videoUrl: mediaType === 'video' ? origVariantUrl(asset.id, asset.variants) : null,
    optimizedBytes,
  }
}

/** Runs a source image (or an extracted video poster frame) through the standard WebP
 * rendition ladder, writing files to `dir` and returning the variant rows (excludes 'orig'). */
async function writeImageRenditions(dir: string, srcBuffer: Buffer, srcWidth: number, srcHeight: number): Promise<VariantRow[]> {
  const rows: VariantRow[] = []
  for (const r of RENDITIONS) {
    const targetWidth = Math.min(r.width, srcWidth || r.width)
    const out = await sharp(srcBuffer)
      .rotate() // respect EXIF orientation
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true })
    const fileName = `${r.label}.webp`
    await writeFile(path.join(dir, fileName), out.data)
    rows.push({
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
  return rows
}

async function createImageAsset(input: {
  buffer: Buffer
  originalName: string
  mime: string
  purpose: string
  tag?: string | null
}): Promise<AssetWithUrls> {
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
      mediaType: 'image',
      width: srcWidth,
      height: srcHeight,
      sizeBytes: input.buffer.length,
    },
  })

  const dir = path.join(MEDIA_ROOT, String(asset.id))
  await mkdir(dir, { recursive: true })

  const variantRows = await writeImageRenditions(dir, input.buffer, srcWidth, srcHeight)

  const ext = input.mime === 'image/png' ? 'png' : input.mime === 'image/webp' ? 'webp' : 'jpg'
  const origName = `orig.${ext}`
  await writeFile(path.join(dir, origName), input.buffer)
  variantRows.push({ label: 'orig', format: ext, width: srcWidth, height: srcHeight, sizeBytes: input.buffer.length, fileName: origName })

  await prisma.assetVariant.createMany({ data: variantRows.map((v) => ({ ...v, assetId: asset.id })) })

  const full = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id }, include: { variants: true } })
  return toAssetWithUrls(full)
}

async function createVideoAsset(input: {
  buffer: Buffer
  originalName: string
  mime: string
  purpose: string
  tag?: string | null
}): Promise<AssetWithUrls> {
  const asset = await prisma.asset.create({
    data: {
      purpose: input.purpose,
      tag: input.tag ?? null,
      originalName: input.originalName,
      mime: input.mime,
      mediaType: 'video',
      width: null,
      height: null,
      sizeBytes: input.buffer.length,
    },
  })

  const dir = path.join(MEDIA_ROOT, String(asset.id))
  await mkdir(dir, { recursive: true })

  const ext = input.mime === 'video/webm' ? 'webm' : 'mp4'
  const origName = `orig.${ext}`
  const origPath = path.join(dir, origName)
  await writeFile(origPath, input.buffer)

  const variantRows: VariantRow[] = [
    { label: 'orig', format: ext, width: 0, height: 0, sizeBytes: input.buffer.length, fileName: origName },
  ]

  // Best-effort: probing/poster extraction never blocks or fails the upload.
  let durationSec: number | null = null
  let probedWidth: number | null = null
  let probedHeight: number | null = null
  try {
    const probe = await probeVideo(origPath)
    if (probe) {
      durationSec = probe.durationSec
      probedWidth = probe.width
      probedHeight = probe.height
    }
    const poster = await extractPosterFrame(origPath)
    if (poster) {
      const posterMeta = await sharp(poster).metadata()
      const posterWidth = posterMeta.width ?? probedWidth ?? 0
      const posterHeight = posterMeta.height ?? probedHeight ?? 0
      if (posterWidth && posterHeight) {
        const posterRows = await writeImageRenditions(dir, poster, posterWidth, posterHeight)
        variantRows.push(...posterRows)
        probedWidth = probedWidth ?? posterWidth
        probedHeight = probedHeight ?? posterHeight
      }
    }
  } catch {
    // ffprobe/ffmpeg missing, unparsable output, or a corrupt file — store the video
    // anyway with no poster/duration.
  }

  await prisma.assetVariant.createMany({ data: variantRows.map((v) => ({ ...v, assetId: asset.id })) })
  await prisma.asset.update({
    where: { id: asset.id },
    data: { durationSec, width: probedWidth, height: probedHeight },
  })

  const full = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id }, include: { variants: true } })
  return toAssetWithUrls(full)
}

export async function createAsset(input: {
  buffer: Buffer
  originalName: string
  mime: string
  purpose: string
  tag?: string | null
}): Promise<AssetWithUrls> {
  if (!ALLOWED_MIME.has(input.mime)) {
    throw httpError(400, `Unsupported media type '${input.mime}' — use JPG, PNG, WebP, MP4, or WebM`)
  }
  if (VIDEO_MIME.has(input.mime)) return createVideoAsset(input)
  return createImageAsset(input)
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
