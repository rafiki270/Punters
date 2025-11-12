import assert from 'node:assert/strict'
import { createDeviceService } from '../src/modules/devices/service'

async function run(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`✔ ${name}`)
  } catch (err) {
    console.error(`✖ ${name}`)
    throw err
  }
}

run('create device emits change', async () => {
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
