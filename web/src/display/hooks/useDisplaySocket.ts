import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { modeFromContentFlags } from '../lib/displayMode'

type UseDisplaySocketArgs = {
  mode: 'server'|'client'
  remoteBase: string | null
  screenIndex: number
  screenCount: number
  deviceId: number | null
  loadAll: () => void | Promise<void>
  setEpoch: (value: number) => void
  setCycleOffset: (value: number) => void
  setAnchorMs: (value: number | null) => void
  setIdentify: (value: { n: number; until: number } | null) => void
  setScreenIndex: (value: number) => void
  setScreenCount: (value: number) => void
  setLocalDisplayMode: (value: 'everything'|'all'|'beer'|'drinks'|'ads') => void
  setLocalShowDrinks: (value: boolean) => void
  setLocalShowCocktails: (value: boolean) => void
}

export default function useDisplaySocket({
  mode,
  remoteBase,
  screenIndex,
  screenCount,
  deviceId,
  loadAll,
  setEpoch,
  setCycleOffset,
  setAnchorMs,
  setIdentify,
  setScreenIndex,
  setScreenCount,
  setLocalDisplayMode,
  setLocalShowDrinks,
  setLocalShowCocktails,
}: UseDisplaySocketArgs) {
  const socketRef = useRef<Socket | null>(null)
  const identifyTimer = useRef<number | null>(null)
  const screenIndexRef = useRef(screenIndex)
  const screenCountRef = useRef(screenCount)
  const deviceIdRef = useRef(deviceId)
  const clientIpRef = useRef<string | undefined>(undefined)

  useEffect(() => { screenIndexRef.current = screenIndex }, [screenIndex])
  useEffect(() => { screenCountRef.current = screenCount }, [screenCount])
  useEffect(() => { deviceIdRef.current = deviceId }, [deviceId])

  useEffect(() => {
    let url: string | undefined
    clientIpRef.current = undefined
    try {
      fetch('/api/ip')
        .then(r=>r.json())
        .then(info=>{ if (info && typeof info.clientIp === 'string') clientIpRef.current = info.clientIp })
        .catch(()=>{})
    } catch {}
    if (mode === 'client' && remoteBase) {
      url = remoteBase
    } else {
      try {
        const loc = window.location
        if (loc.port && loc.port !== '3000') {
          url = `${loc.protocol}//${loc.hostname}:3000`
        }
      } catch {}
    }
    const sock: Socket = io(url || '', { path: '/socket.io', transports: ['websocket', 'polling'], reconnection: true })
    const registerDisplay = () => {
      let label: string | undefined
      try { label = (localStorage.getItem('displayLabel') || undefined) ?? undefined } catch {}
      let clientId: string | undefined
      try {
        clientId = localStorage.getItem('displayClientId') || undefined
        if (!clientId) {
          clientId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
          localStorage.setItem('displayClientId', clientId)
        }
      } catch {}
      sock.emit('register_display', {
        screenIndex: screenIndexRef.current,
        screenCount: screenCountRef.current,
        deviceId: deviceIdRef.current,
        clientIp: clientIpRef.current,
        label,
        clientId,
      })
    }
    const onChanged = () => { loadAll() }
    const onTick = (p: { epoch: number }) => { if (typeof p?.epoch === 'number') setEpoch(p.epoch) }
    const onSyncState = (p: { cycleOffset?: number; anchorMs?: number|null }) => {
      if (typeof p.cycleOffset === 'number') setCycleOffset(p.cycleOffset)
      if ('anchorMs' in p) setAnchorMs(p.anchorMs ?? null)
    }
    const onIdentify = (p: { n?: number; secs?: number }) => {
      const secs = Number(p?.secs) || 5
      const n = typeof p?.n === 'number' ? p.n : 0
      setIdentify({ n, until: Date.now() + secs*1000 })
      if (identifyTimer.current) window.clearTimeout(identifyTimer.current)
      identifyTimer.current = window.setTimeout(() => setIdentify(null), secs*1000)
    }
    const onConnect = () => {
      try { registerDisplay() } catch {}
    }
    const ipWatcher = window.setInterval(() => {
      try {
        if (clientIpRef.current) {
          sock.emit('update_client', { clientIp: clientIpRef.current })
          window.clearInterval(ipWatcher)
        }
      } catch {}
    }, 500)
    const onConnectError = () => {}
    sock.on('connect', onConnect)
    sock.on('connect_error', onConnectError)
    sock.on('changed', onChanged)
    sock.on('tick', onTick)
    sock.on('sync_state', onSyncState)
    sock.on('identify', onIdentify)
    sock.on('reload', () => { try { window.location.reload() } catch {} })
    const onSetScreen = (p: { screenIndex?: number; screenCount?: number }) => {
      if (typeof p?.screenIndex === 'number') setScreenIndex(Math.max(1, p.screenIndex))
      if (typeof p?.screenCount === 'number') setScreenCount(Math.max(1, p.screenCount))
    }
    sock.on('set_screen', onSetScreen)
    const onSetContent = (p: { showBeer?: boolean; showDrinks?: boolean; showCocktails?: boolean; showMedia?: boolean }) => {
      const showBeer = !!p?.showBeer
      const showDrinks = !!p?.showDrinks
      const showCocktails = !!p?.showCocktails
      const showMedia = !!p?.showMedia
      const nextMode = modeFromContentFlags(showBeer, showDrinks, showCocktails, showMedia)
      setLocalDisplayMode(nextMode)
      setLocalShowDrinks(showDrinks)
      setLocalShowCocktails(showCocktails)
    }
    sock.on('set_content', onSetContent)
    const onSetLabel = (p: { label?: string }) => {
      try { localStorage.setItem('displayLabel', String(p?.label || '')) } catch {}
    }
    sock.on('set_label', onSetLabel)
    socketRef.current = sock
    return () => {
      try {
        sock.off('connect', onConnect)
        sock.off('connect_error', onConnectError)
        sock.off('changed', onChanged)
        sock.off('tick', onTick)
        sock.off('sync_state', onSyncState)
        sock.off('identify', onIdentify)
        sock.off('reload')
        sock.off('set_screen', onSetScreen)
        sock.off('set_content', onSetContent)
        sock.off('set_label', onSetLabel)
        window.clearInterval(ipWatcher)
        if (identifyTimer.current) {
          window.clearTimeout(identifyTimer.current)
          identifyTimer.current = null
        }
        if (sock.connected) {
          sock.emit('unregister_display')
          sock.disconnect()
        }
      } catch {}
      socketRef.current = null
    }
  }, [mode, remoteBase, loadAll, setEpoch, setCycleOffset, setAnchorMs, setIdentify, setScreenIndex, setScreenCount, setLocalDisplayMode, setLocalShowDrinks, setLocalShowCocktails])

  return socketRef
}
