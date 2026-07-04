import type { FastifyInstance } from 'fastify'
import { Server as SocketServer } from 'socket.io'
import { changeBus } from './events'

/**
 * Socket layer: broadcasts change events and a periodic clock tick. Screens use the
 * tick to keep their server-clock offset honest; everything else is fetch-on-change.
 */
export function attachSockets(app: FastifyInstance): SocketServer {
  const io = new SocketServer(app.server, {
    cors: { origin: true },
  })

  const unsubscribe = changeBus.onChange((e) => {
    io.emit('changed', e)
  })

  const tick = setInterval(() => {
    io.emit('tick', { now: Date.now() })
  }, 10_000)

  app.addHook('onClose', async () => {
    clearInterval(tick)
    unsubscribe()
    await io.close()
  })

  return io
}
