import { EventEmitter } from 'node:events'

export type ChangeTopic = 'settings'|'beers'|'taps'|'media'|'sizes'|'devices'|'drinks'

const ev = new EventEmitter()

export function emitChange(topic: ChangeTopic) {
  ev.emit('change', { topic, ts: Date.now() })
}

export function onChange(handler: (p: { topic: ChangeTopic; ts: number }) => void) {
  ev.on('change', handler)
}
