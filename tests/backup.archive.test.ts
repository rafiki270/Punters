import test from 'node:test'
import assert from 'node:assert/strict'
import { createBackupArchive, extractDatabaseFromUpload, parseBackupArchive, setBackupSqliteRebuilderForTests } from '../src/modules/backup/archive'
import { buildStoreZip, parseZip } from '../src/modules/backup/zip'

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'utf8')

function makeDbBuffer(fillByte = 0) {
  const buf = Buffer.alloc(512, fillByte)
  SQLITE_HEADER.copy(buf)
  return buf
}

test('createBackupArchive emits manifest, db, sql, and assets', async () => {
  const db = makeDbBuffer(1)
  const sql = Buffer.from('CREATE TABLE sample(id INTEGER);', 'utf8')
  const assets = [
    { id: 1, filename: 'logo.png', data: Buffer.from([1, 2, 3]) },
    { id: 2, filename: 'banner?.jpg', data: Buffer.from([4, 5]) },
  ]
  const { zip } = createBackupArchive({ dbBuffer: db, sqlDump: sql, assets, generator: 'unit-test', notes: ['note'] })
  const parsed = parseBackupArchive(zip)
  assert.ok(parsed.manifest, 'manifest missing')
  assert.equal(parsed.manifest?.database.filename, 'database.db')
  assert.equal(parsed.manifest?.database.dump?.filename, 'database.sql')
  assert.equal(parsed.manifest?.assets.files.length, 2)
  assert.equal(parsed.manifest?.assets.files.some(file => file.path.includes('?')), false)
  const extracted = await extractDatabaseFromUpload(zip)
  assert.equal(extracted.source, 'zip-db')
  assert.equal(extracted.db.equals(db), true)
})

test('extractDatabaseFromUpload falls back to SQL dump when database.db missing', async () => {
  const sql = Buffer.from('CREATE TABLE legacy(id INTEGER);', 'utf8')
  const zip = buildStoreZip([{ name: 'database.sql', data: sql }])
  const rebuilt = makeDbBuffer(2)
  setBackupSqliteRebuilderForTests(async dump => {
    assert.equal(dump.equals(sql), true)
    return rebuilt
  })
  try {
    const extracted = await extractDatabaseFromUpload(zip)
    assert.equal(extracted.source, 'zip-sql')
    assert.equal(extracted.db.equals(rebuilt), true)
  } finally {
    setBackupSqliteRebuilderForTests(null)
  }
})

test('extractDatabaseFromUpload accepts raw SQLite db buffers', async () => {
  const db = makeDbBuffer(3)
  const extracted = await extractDatabaseFromUpload(db)
  assert.equal(extracted.source, 'db')
  assert.equal(extracted.db.equals(db), true)
})

test('extractDatabaseFromUpload rejects tampered backups when hash mismatches', async () => {
  const db = makeDbBuffer(4)
  const sql = Buffer.from('CREATE TABLE whatever(id INTEGER);', 'utf8')
  const assets: { id: number; filename: string; data: Buffer }[] = []
  const { zip } = createBackupArchive({ dbBuffer: db, sqlDump: sql, assets })
  const entries = parseZip(zip)
  const mutatedEntries = entries.map(entry => {
    if (entry.name === 'database.db') {
      const corrupted = Buffer.from(entry.data)
      corrupted[SQLITE_HEADER.length] = (corrupted[SQLITE_HEADER.length] ^ 0xff) & 0xff
      return { name: entry.name, data: corrupted }
    }
    return entry
  })
  const tamperedZip = buildStoreZip(mutatedEntries)
  await assert.rejects(() => extractDatabaseFromUpload(tamperedZip), /integrity check/)
})
