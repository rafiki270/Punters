import { FastifyInstance } from 'fastify'
import { requireAdmin } from '../auth'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { prisma } from '../db'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function crc32(buf: Buffer) {
  let c = ~0 >>> 0
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff]
  }
  return (~c) >>> 0
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[n] = c >>> 0
  }
  return table
})()

function writeUInt16LE(n: number) { const b = Buffer.allocUnsafe(2); b.writeUInt16LE(n >>> 0, 0); return b }
function writeUInt32LE(n: number) { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n >>> 0, 0); return b }

type ZipFile = { name: string; data: Buffer }

function buildStoreZip(files: ZipFile[]): Buffer {
  const encoder = new TextEncoder()
  const fileRecords: { nameBytes: Buffer; data: Buffer; crc: number; compSize: number; uncompSize: number; localOffset: number }[] = []
  const chunks: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const nameBytes = Buffer.from(f.name, 'utf8')
    const data = f.data
    const crc = crc32(data)
    const compSize = data.length
    const uncompSize = data.length
    const localHeader = Buffer.concat([
      writeUInt32LE(0x04034b50), // local file header sig
      writeUInt16LE(20),         // version needed
      writeUInt16LE(0),          // flags
      writeUInt16LE(0),          // compression: store
      writeUInt16LE(0),          // mod time
      writeUInt16LE(0),          // mod date
      writeUInt32LE(crc),
      writeUInt32LE(compSize),
      writeUInt32LE(uncompSize),
      writeUInt16LE(nameBytes.length),
      writeUInt16LE(0),          // extra len
      nameBytes,
    ])
    fileRecords.push({ nameBytes, data, crc, compSize, uncompSize, localOffset: offset })
    chunks.push(localHeader, data)
    offset += localHeader.length + data.length
  }
  // Central directory
  const cdirChunks: Buffer[] = []
  const cdirStart = offset
  for (const r of fileRecords) {
    const central = Buffer.concat([
      writeUInt32LE(0x02014b50), // central dir header sig
      writeUInt16LE(20),         // version made by
      writeUInt16LE(20),         // version needed
      writeUInt16LE(0),          // flags
      writeUInt16LE(0),          // compression
      writeUInt16LE(0),          // mod time
      writeUInt16LE(0),          // mod date
      writeUInt32LE(r.crc),
      writeUInt32LE(r.compSize),
      writeUInt32LE(r.uncompSize),
      writeUInt16LE(r.nameBytes.length),
      writeUInt16LE(0),          // extra len
      writeUInt16LE(0),          // comment len
      writeUInt16LE(0),          // disk start
      writeUInt16LE(0),          // internal attrs
      writeUInt32LE(0),          // external attrs
      writeUInt32LE(r.localOffset),
      r.nameBytes,
    ])
    cdirChunks.push(central)
    offset += central.length
  }
  const cdir = Buffer.concat(cdirChunks)
  const end = Buffer.concat([
    writeUInt32LE(0x06054b50), // end of central dir sig
    writeUInt16LE(0),          // disk
    writeUInt16LE(0),          // cdir disk
    writeUInt16LE(fileRecords.length),
    writeUInt16LE(fileRecords.length),
    writeUInt32LE(cdir.length),
    writeUInt32LE(cdirStart),
    writeUInt16LE(0),          // comment len
  ])
  return Buffer.concat([...chunks, cdir, end])
}

type ResolvedDb = { path: string | null; tried: string[] }

async function resolveDbPath(): Promise<ResolvedDb> {
  const cwd = process.cwd()
  const candidates: string[] = []
  const url = process.env.DATABASE_URL || 'file:./prisma/dev.db'
  if (url.startsWith('file:')) {
    const p = url.slice('file:'.length)
    // absolute vs relative
    candidates.push(path.isAbsolute(p) ? p : path.resolve(cwd, p))
  }
  // Common fallbacks
  candidates.push(path.resolve(cwd, './prisma/dev.db'))
  candidates.push(path.resolve(cwd, './data/dev.db'))
  candidates.push('/data/dev.db')
  // Try Prisma to ask SQLite for its file path
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(`PRAGMA database_list;`)
    const main = Array.isArray(rows) ? rows.find((r: any) => (r?.name || r?.[1]) === 'main') : null
    const file = main ? (main.file ?? main?.[2]) : null
    if (file && typeof file === 'string') {
      candidates.unshift(file)
    }
  } catch {}
  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return { path: c, tried: candidates } } catch {}
  }
  return { path: null, tried: candidates }
}

export async function registerBackupRoutes(app: FastifyInstance) {
  // Download the SQLite database file
  app.get('/api/admin/backup/db', { preHandler: requireAdmin }, async (_req, reply) => {
    const { path: dbPath, tried } = await resolveDbPath()
    if (!dbPath) return reply.code(404).send({ error: 'Database file not found', tried })
    const ts = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    const name = `punters-backup-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.db`
    reply.header('Content-Type', 'application/octet-stream')
    reply.header('Content-Disposition', `attachment; filename="${name}"`)
    return reply.send(fs.createReadStream(dbPath))
  })

  // Download a ZIP containing an SQL dump plus all image assets
  app.get('/api/admin/backup/zip', { preHandler: requireAdmin }, async (_req, reply) => {
    const { path: dbPath, tried } = await resolveDbPath()
    if (!dbPath) return reply.code(404).send({ error: 'Database file not found', tried })
    // Try to dump SQL via sqlite3 CLI; if not available, fall back to bundling the DB file
    const files: ZipFile[] = []
    try {
      const { stdout } = await execFileAsync('sqlite3', [dbPath, '.dump'], { maxBuffer: 1024 * 1024 * 200 })
      files.push({ name: 'database.sql', data: Buffer.from(stdout, 'utf8') })
    } catch {
      const note = `sqlite3 CLI not found on server.\nThis ZIP contains the raw SQLite database file instead of database.sql.\nFile: database.db\n`
      files.push({ name: 'README.txt', data: Buffer.from(note, 'utf8') })
      try { if (dbPath) files.push({ name: 'database.db', data: fs.readFileSync(dbPath) }) } catch {}
    }
    // Collect all assets with data
    const assets = await prisma.asset.findMany({ select: { id: true, filename: true, data: true } })
    for (const a of assets) {
      if (!a.data) continue
      const safeName = String(a.filename || `asset-${a.id}`).replace(/[\\/:*?"<>|]+/g, '_')
      files.push({ name: `images/${a.id}-${safeName}`, data: Buffer.from(a.data as unknown as Buffer) })
    }
    const zip = buildStoreZip(files)
    const ts = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    const name = `punters-backup-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.zip`
    reply.header('Content-Type', 'application/zip')
    reply.header('Content-Disposition', `attachment; filename="${name}"`)
    return reply.send(zip)
  })

  // Restore the SQLite database from an uploaded file
  app.post('/api/admin/restore/db', { preHandler: requireAdmin }, async (req, reply) => {
    const mp = await (req as any).file()
    if (!mp) return reply.code(400).send({ error: 'No file' })
    // Collect into buffer (DB likely small enough). Limit enforced by fastify-multipart.
    const chunks: Buffer[] = []
    for await (const chunk of mp.file) chunks.push(chunk as Buffer)
    if ((mp.file as any)?.truncated) return reply.code(413).send({ error: 'File too large (truncated)' })
    const buf = Buffer.concat(chunks)
    // Basic validation: SQLite magic header
    const magic = Buffer.from('SQLite format 3\0', 'utf8')
    if (buf.length < magic.length || !buf.slice(0, magic.length).equals(magic)) {
      return reply.code(400).send({ error: 'Invalid SQLite database file' })
    }
    const { path: dbPath, tried } = await resolveDbPath()
    if (!dbPath) return reply.code(500).send({ error: 'Database file not found', tried })
    const tmp = path.join(path.dirname(dbPath), `.restore-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    // Write to temp and then replace atomically
    fs.writeFileSync(tmp, buf)
    try {
      // Disconnect Prisma to release file handles
      try { await prisma.$disconnect() } catch {}
      fs.copyFileSync(tmp, dbPath)
    } finally {
      try { fs.unlinkSync(tmp) } catch {}
    }
    // Reconnect
    try { await prisma.$connect() } catch {}
    return { ok: true }
  })
}
