import test from 'node:test'
import assert from 'node:assert/strict'
import { createDeviceService } from '../src/modules/devices/service'

test('create device emits change', async () => {
  const prisma: any = {
    device: {
      create: async ({ data }: any) => ({ id: 1, ...data }),
      findMany: async () => [],
    },
  }
  const events: string[] = []
  const service = createDeviceService({ prisma, emitChange: (topic) => events.push(topic) })
  const device = await service.create({ name: 'Screen A' })
  assert.equal(device.name, 'Screen A')
  assert.deepEqual(events, ['devices'])
})
