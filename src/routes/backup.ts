import { FastifyInstance } from 'fastify'
import { requireAdmin } from '../auth'
import path from 'node:path'
import fs from 'node:fs'
import { prisma } from '../db'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pkg from '../../package.json'
import { createBackupArchive, extractDatabaseFromUpload } from '../modules/backup/archive'

const execFileAsync = promisify(execFile)

const pkgVersion = (pkg as { version?: string })?.version
const backupGenerator = pkgVersion ? `punters@${pkgVersion}` : undefined

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
    const notes: string[] = []
    const dbBuffer = fs.readFileSync(dbPath)
    let sqlDump: Buffer | undefined
    try {
      const { stdout } = await execFileAsync('sqlite3', [dbPath, '.dump'], { maxBuffer: 1024 * 1024 * 200 })
      sqlDump = Buffer.from(stdout, 'utf8')
    } catch {
      notes.push('sqlite3 CLI not available when this backup was created; database.sql omitted.')
    }
    const assets = await prisma.asset.findMany({ select: { id: true, filename: true, data: true } })
    const assetInputs = assets
      .filter(a => a.data)
      .map(a => ({
        id: a.id,
        filename: a.filename || `asset-${a.id}`,
        data: Buffer.from(a.data as unknown as Buffer),
      }))
    const { zip } = createBackupArchive({
      dbBuffer,
      sqlDump,
      assets: assetInputs,
      generator: backupGenerator,
      notes: notes.length ? notes : undefined,
    })
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
    let dbBuffer: Buffer
    try {
      const extracted = await extractDatabaseFromUpload(buf)
      dbBuffer = extracted.db
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.code(400).send({ error: msg })
    }
    const { path: dbPath, tried } = await resolveDbPath()
    if (!dbPath) return reply.code(500).send({ error: 'Database file not found', tried })
    const tmp = path.join(path.dirname(dbPath), `.restore-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    // Write to temp and then replace atomically
    fs.writeFileSync(tmp, dbBuffer)
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
