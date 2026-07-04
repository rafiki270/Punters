import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) socket = io({ transports: ['websocket', 'polling'] })
  return socket
}

/** Subscribe to server change events; returns an unsubscribe function. */
export function onChanged(listener: (e: { scope: string; zoneId?: number }) => void): () => void {
  const s = getSocket()
  s.on('changed', listener)
  return () => s.off('changed', listener)
}

export function onTick(listener: (e: { now: number }) => void): () => void {
  const s = getSocket()
  s.on('tick', listener)
  return () => s.off('tick', listener)
}
