import { createHash } from 'node:crypto'
import { buildStoreZip, isZipBuffer, parseZip, ZipFile } from './zip'

export const BACKUP_FORMAT_VERSION = 1

export type BackupManifestAsset = {
  id: number
  filename: string
  path: string
  sizeBytes: number
  sha256: string
}

export type BackupManifest = {
  formatVersion: number
  generatedAt: string
  generator?: string
  database: {
    engine: 'sqlite'
    filename: string
    sizeBytes: number
    sha256: string
  }
  assets: {
    directory: string
    files: BackupManifestAsset[]
    totalBytes: number
  }
}

export type BackupAssetInput = {
  id: number
  filename: string
  data: Buffer
}

export type CreateBackupArchiveArgs = {
  dbBuffer: Buffer
  assets: BackupAssetInput[]
  generator?: string
}

export type CreateBackupArchiveResult = {
  zip: Buffer
  manifest: BackupManifest
}

export function createBackupArchive(args: CreateBackupArchiveArgs): CreateBackupArchiveResult {
  const { dbBuffer, assets, generator } = args
  const assetEntries = assets.map(asset => {
    const safeName = sanitizeAssetName(asset.filename)
    const entryPath = `images/${asset.id}-${safeName}`
    const manifestAsset: BackupManifestAsset = {
      id: asset.id,
      filename: asset.filename,
      path: entryPath,
      sizeBytes: asset.data.length,
      sha256: hash(asset.data),
    }
    return { manifest: manifestAsset, file: { name: entryPath, data: asset.data } satisfies ZipFile }
  })
  const manifestAssets = assetEntries.map(entry => entry.manifest)
  const manifest: BackupManifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    generator,
    database: {
      engine: 'sqlite',
      filename: 'database.db',
      sizeBytes: dbBuffer.length,
      sha256: hash(dbBuffer),
    },
    assets: {
      directory: 'images',
      files: manifestAssets,
      totalBytes: manifestAssets.reduce((sum, asset) => sum + asset.sizeBytes, 0),
    },
  }
  const files: ZipFile[] = [
    { name: manifest.database.filename, data: dbBuffer },
  ]
  for (const asset of assetEntries) {
    files.push(asset.file)
  }
  files.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') })
  return { zip: buildStoreZip(files), manifest }
}

export type ParsedBackupArchive = {
  entries: Map<string, Buffer>
  manifest?: BackupManifest
}

export function parseBackupArchive(buffer: Buffer): ParsedBackupArchive {
  const entries = new Map<string, Buffer>()
  for (const entry of parseZip(buffer)) {
    entries.set(entry.name, entry.data)
  }
  const manifestEntry = entries.get('manifest.json')
  let manifest: BackupManifest | undefined
  if (manifestEntry) {
    try {
      manifest = JSON.parse(manifestEntry.toString('utf8'))
    } catch (err) {
      throw new Error('Failed to parse manifest.json from backup archive')
    }
  }
  return { entries, manifest }
}

export type ExtractedDatabase = {
  db: Buffer
  manifest?: BackupManifest
  source: 'zip-db' | 'db'
}

export async function extractDatabaseFromUpload(buffer: Buffer): Promise<ExtractedDatabase> {
  if (isZipBuffer(buffer)) {
    const archive = parseBackupArchive(buffer)
    const manifest = archive.manifest
    const dbFileName = manifest?.database?.filename || 'database.db'
    const dbEntry = archive.entries.get(dbFileName) || archive.entries.get('database.db')
    if (dbEntry) {
      verifyHashIfPresent(dbEntry, manifest?.database?.sha256, 'database')
      return { db: dbEntry, manifest, source: 'zip-db' }
    }
    throw new Error('Backup ZIP is missing database.db')
  }
  if (!isValidSqliteDb(buffer)) {
    throw new Error('Invalid SQLite database file')
  }
  return { db: buffer, source: 'db' }
}

function hash(buf: Buffer) {
  return createHash('sha256').update(buf).digest('hex')
}

function sanitizeAssetName(filename: string) {
  return String(filename || 'asset').replace(/[\\/:*?"<>|]+/g, '_')
}

function isValidSqliteDb(buf: Buffer) {
  const magic = Buffer.from('SQLite format 3\0', 'utf8')
  return buf.length >= magic.length && buf.subarray(0, magic.length).equals(magic)
}

function verifyHashIfPresent(data: Buffer, expected: string | undefined, label: string) {
  if (!expected) return
  const actual = hash(data)
  if (actual !== expected) {
    throw new Error(`Backup ${label} failed integrity check`)
  }
}

export function isLikelyZip(buffer: Buffer) {
  return isZipBuffer(buffer)
}

export function isValidSqlite(buffer: Buffer) {
  return isValidSqliteDb(buffer)
}
