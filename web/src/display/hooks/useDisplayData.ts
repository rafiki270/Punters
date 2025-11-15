import { useCallback, useState } from 'react'
import type { Ad, Device, Discovered, Settings, Size, TapBeer } from '../types'

const getFromStorage = (key: string) => {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export default function useDisplayData(deviceId: number | null) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [taps, setTaps] = useState<TapBeer[]>([])
  const [ads, setAds] = useState<Ad[]>([])
  const [sizes, setSizes] = useState<Size[]>([])
  const [drinkCategories, setDrinkCategories] = useState<any[]>([])
  const [drinks, setDrinks] = useState<any[]>([])
  const [mode, setMode] = useState<'server'|'client'>('server')
  const [servers, setServers] = useState<Discovered[]>([])
  const [remoteBase, setRemoteBaseState] = useState<string | null>(() => getFromStorage('remoteServer'))
  const [device, setDevice] = useState<Device | null>(null)
  const [cocktails, setCocktails] = useState<any[]>([])

  const setRemoteBase = useCallback((value: string | null) => {
    setRemoteBaseState(value)
    if (value) {
      try { localStorage.setItem('remoteServer', value) } catch {}
    } else {
      try { localStorage.removeItem('remoteServer') } catch {}
    }
  }, [])

  const loadAll = useCallback(async () => {
    try {
      const m = await fetch('/api/mode').then(r=>r.json()).catch(()=>({mode:'server'}))
      const modeNow: 'server'|'client' = m.mode === 'client' ? 'client' : 'server'
      setMode(modeNow)
      if (modeNow === 'client') {
        const list = await fetch('/api/discovery/servers').then(r=>r.json()).catch(()=>[])
        setServers(list)
        const saved = getFromStorage('remoteServer')
        if (saved && !remoteBase) setRemoteBaseState(saved)
      } else {
        setServers([])
      }
      const baseCandidate = remoteBase || getFromStorage('remoteServer')
      const base = (modeNow === 'client' && baseCandidate) ? baseCandidate : ''
      const [s, sz, bl, aa, cats, drs, cks] = await Promise.all([
        fetch(`${base}/api/settings`).then(r=>r.json()),
        fetch(`${base}/api/sizes`).then(r=>r.json()).catch(()=>[]),
        fetch(`${base}/api/display/beerlist`).then(r=>r.json()),
        fetch(`${base}/api/display/ads`).then(r=>r.json()),
        fetch(`${base}/api/drink-categories`).then(r=>r.json()).catch(()=>[]),
        fetch(`${base}/api/drinks?active=true&disabled=false&withPrices=true`).then(r=>r.json()).catch(()=>[]),
        fetch(`${base}/api/cocktails?active=true`).then(r=>r.json()).catch(()=>[]),
      ])
      setSettings(s)
      setSizes(sz)
      setTaps(bl)
      setAds(aa)
      setDrinkCategories(cats)
      setDrinks(drs)
      setCocktails(cks || [])
      if (deviceId != null) {
        const list: Device[] = await fetch(`${base}/api/devices`).then(r=>r.json()).catch(()=>[])
        const d = list.find(x => x.id === deviceId) || null
        setDevice(d)
      } else {
        setDevice(null)
      }
    } catch {
      /* swallow network errors to keep display running */
    }
  }, [deviceId, remoteBase])

  const contentBase = (mode === 'client' && remoteBase) ? remoteBase : ''

  return {
    settings,
    taps,
    ads,
    sizes,
    drinkCategories,
    drinks,
    cocktails,
    mode,
    servers,
    remoteBase,
    setRemoteBase,
    device,
    loadAll,
    contentBase,
  }
}
