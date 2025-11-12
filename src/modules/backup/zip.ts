import { inflateRawSync } from 'node:zlib'

export type ZipFile = { name: string; data: Buffer }

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

function writeUInt16LE(n: number) {
  const b = Buffer.allocUnsafe(2)
  b.writeUInt16LE(n >>> 0, 0)
  return b
}

function writeUInt32LE(n: number) {
  const b = Buffer.allocUnsafe(4)
  b.writeUInt32LE(n >>> 0, 0)
  return b
}

export function buildStoreZip(files: ZipFile[]): Buffer {
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
      writeUInt32LE(0x04034b50),
      writeUInt16LE(20),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt32LE(crc),
      writeUInt32LE(compSize),
      writeUInt32LE(uncompSize),
      writeUInt16LE(nameBytes.length),
      writeUInt16LE(0),
      nameBytes,
    ])
    fileRecords.push({ nameBytes, data, crc, compSize, uncompSize, localOffset: offset })
    chunks.push(localHeader, data)
    offset += localHeader.length + data.length
  }
  const cdirChunks: Buffer[] = []
  const cdirStart = offset
  for (const r of fileRecords) {
    const central = Buffer.concat([
      writeUInt32LE(0x02014b50),
      writeUInt16LE(20),
      writeUInt16LE(20),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt32LE(r.crc),
      writeUInt32LE(r.compSize),
      writeUInt32LE(r.uncompSize),
      writeUInt16LE(r.nameBytes.length),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt32LE(0),
      writeUInt32LE(r.localOffset),
      r.nameBytes,
    ])
    cdirChunks.push(central)
    offset += central.length
  }
  const cdir = Buffer.concat(cdirChunks)
  const end = Buffer.concat([
    writeUInt32LE(0x06054b50),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(fileRecords.length),
    writeUInt16LE(fileRecords.length),
    writeUInt32LE(cdir.length),
    writeUInt32LE(cdirStart),
    writeUInt16LE(0),
  ])
  return Buffer.concat([...chunks, cdir, end])
}

export function isZipBuffer(buf: Buffer) {
  return buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50
}

export function parseZip(buf: Buffer): ZipFile[] {
  const entries: ZipFile[] = []
  let offset = 0
  while (offset + 4 <= buf.length) {
    const sig = buf.readUInt32LE(offset)
    if (sig === 0x04034b50) {
      if (offset + 30 > buf.length) throw new Error('ZIP local header truncated')
      const compression = buf.readUInt16LE(offset + 8)
      const compSize = buf.readUInt32LE(offset + 18)
      const nameLen = buf.readUInt16LE(offset + 26)
      const extraLen = buf.readUInt16LE(offset + 28)
      const nameStart = offset + 30
      const nameEnd = nameStart + nameLen
      const dataStart = nameEnd + extraLen
      const dataEnd = dataStart + compSize
      if (dataEnd > buf.length) throw new Error('ZIP entry truncated')
      const name = buf.toString('utf8', nameStart, nameEnd)
      const rawData = buf.subarray(dataStart, dataEnd)
      let data: Buffer
      if (compression === 0) data = Buffer.from(rawData)
      else if (compression === 8) data = inflateRawSync(rawData)
      else throw new Error(`Unsupported ZIP compression method: ${compression}`)
      entries.push({ name, data })
      offset = dataEnd
      continue
    }
    if (sig === 0x02014b50 || sig === 0x06054b50) {
      break
    }
    throw new Error('Unexpected ZIP signature')
  }
  return entries
}
