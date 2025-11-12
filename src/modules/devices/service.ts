import { PrismaClient } from '@prisma/client'
import { ChangeTopic } from '../../lib/events'
import { DeviceCreateSchema, DeviceUpdateSchema } from './schema'
import { httpError } from '../../core/http'

export function createDeviceService({ prisma, emitChange }: { prisma: PrismaClient; emitChange: (topic: ChangeTopic) => void }) {
  return {
    list: () => prisma.device.findMany({ orderBy: { id: 'asc' } }),
    async create(payload: unknown) {
      const data = DeviceCreateSchema.parse(payload)
      const created = await prisma.device.create({ data })
      emitChange('devices')
      return created
    },
    async update(id: number, payload: unknown) {
      const data = DeviceUpdateSchema.parse(payload)
      try {
        const updated = await prisma.device.update({ where: { id }, data })
        emitChange('devices')
        return updated
      } catch {
        throw httpError(404, 'Not found')
      }
    },
    async remove(id: number) {
      try {
        await prisma.device.delete({ where: { id } })
        emitChange('devices')
        return { ok: true }
      } catch {
        throw httpError(404, 'Not found')
      }
    },
  }
}
