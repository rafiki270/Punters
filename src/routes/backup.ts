import { FastifyInstance } from 'fastify'
import { requireAdmin } from '../auth'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { prisma } from '../db'

function resolveDbPath(): string {
  const url = process.env.DATABASE_URL || 'file:./prisma/dev.db'
  if (url.startsWith('file:')) {
    const p = url.slice('file:'.length)
    return path.resolve(process.cwd(), p)
  }
  // Fallback to default relative path if provider differs
  return path.resolve(process.cwd(), './prisma/dev.db')
}

export async function registerBackupRoutes(app: FastifyInstance) {
  // Download the SQLite database file
  app.get('/api/admin/backup/db', { preHandler: requireAdmin }, async (_req, reply) => {
    const dbPath = resolveDbPath()
    if (!fs.existsSync(dbPath)) {
      return reply.code(404).send({ error: 'Database file not found' })
    }
    const ts = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    const name = `punters-backup-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.db`
    reply.header('Content-Type', 'application/octet-stream')
    reply.header('Content-Disposition', `attachment; filename="${name}"`)
    return reply.send(fs.createReadStream(dbPath))
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
    const dbPath = resolveDbPath()
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

