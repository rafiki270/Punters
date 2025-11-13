import { useEffect, useState } from 'react'
import ArrangementsPanel from '../../admin/panels/ArrangementsPanel'
import MediaPanel from '../../admin/panels/MediaPanel'
import SystemPanel from '../../admin/panels/SystemPanel'
import type { Discovered, Settings, Size } from '../types'
import BeersPanel from './panels/BeersPanel'
import DrinksPanel from './panels/DrinksPanel'
import SettingsPanel from './panels/SettingsPanel'
import SizesPanel from './panels/SizesPanel'
import StylePanel from './panels/StylePanel'
import TapsPanel from './panels/TapsPanel'

export default function AdminPage() {
  const [uiMode, setUiMode] = useState<'server'|'client'>('server')
  const [sizes, setSizes] = useState<Size[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [servers, setServers] = useState<Discovered[]>([])
  const [remoteBase, setRemoteBase] = useState<string | null>(null)
  const [localDisplayMode, setLocalDisplayMode] = useState<'everything'|'all'|'beer'|'drinks'|'ads'>(()=> {
    const stored = localStorage.getItem('localDisplayMode')
    return (stored === 'everything' || stored === 'all' || stored === 'beer' || stored === 'drinks' || stored === 'ads') ? stored : 'all'
  })
  const [localDrinksCellScale, setLocalDrinksCellScale] = useState<number>(()=>{ const v=Number(localStorage.getItem('drinksCellScale')||''); return Number.isFinite(v)?v:50 })
  const [localDrinksItemsPerCol, setLocalDrinksItemsPerCol] = useState<number>(()=>{ const v=Number(localStorage.getItem('drinksItemsPerCol')||''); return Number.isFinite(v)&&v>0?v:10 })
  const [localBeerItemsPerCol, setLocalBeerItemsPerCol] = useState<number>(()=>{ const v=Number(localStorage.getItem('beerItemsPerCol')||''); return Number.isFinite(v)&&v>0?v:10 })
  const [adminDrinksIndentPct, setAdminDrinksIndentPct] = useState<number>(()=>{ const v=Number(localStorage.getItem('drinksIndentPct')||''); return Number.isFinite(v)?Math.max(0,Math.min(30,v)):10 })
  const [localShowDrinks, setLocalShowDrinks] = useState<boolean>(()=> { const v=localStorage.getItem('localShowDrinks'); return v==null?true:v==='true' })

  const normalizeStandaloneTab = (value: string | null) => value === 'backup' ? 'system' : value
  const [tab, setTab] = useState<string>(() => {
    const savedRaw = typeof window !== 'undefined' ? sessionStorage.getItem('adminLastTab') : null
    const saved = normalizeStandaloneTab(savedRaw)
    return saved || 'settings'
  })
  useEffect(() => { try { sessionStorage.setItem('adminLastTab', tab) } catch {} }, [tab])
  useEffect(()=>{ if (uiMode !== 'server' && tab !== 'settings') setTab('settings') }, [uiMode, tab])

  async function loadAll() {
    try {
      const m = await fetch('/api/mode').then(r=>r.json()).catch(()=>({mode:'server'}))
      const modeNow: 'server'|'client' = m.mode === 'client' ? 'client' : 'server'
      setUiMode(modeNow)
      if (modeNow === 'client') {
        const list = await fetch('/api/discovery/servers').then(r=>r.json()).catch(()=>[])
        setServers(list)
        const saved = localStorage.getItem('remoteServer')
        if (saved) setRemoteBase(saved)
      }
      const base = (modeNow === 'client' && (localStorage.getItem('remoteServer'))) ? localStorage.getItem('remoteServer')! : ''
      const [s, sz] = await Promise.all([
        fetch(`${base}/api/settings`).then(r=>r.json()),
        fetch(`${base}/api/sizes`).then(r=>r.json()).catch(()=>[]),
      ])
      setSettings(s)
      setSizes(sz)
    } catch {}
  }
  useEffect(() => { loadAll() }, [])

  const tabs: Array<{key: string; label: string}> = [
    { key: 'settings', label: 'Settings' },
    ...(uiMode==='server' ? [
      { key: 'style', label: 'Style' },
      { key: 'sizes', label: 'Sizes' },
      { key: 'beers', label: 'Beers' },
      { key: 'taps', label: 'Taps' },
      { key: 'drinks', label: 'Other drinks' },
      { key: 'media', label: 'Media' },
      { key: 'arrange', label: 'Arrangements' },
      { key: 'system', label: 'System' },
    ] as any : [])
  ]

  return (
    <div className="min-h-screen p-4 max-w-5xl mx-auto text-neutral-900 dark:text-neutral-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-2 text-sm">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded border ${tab===t.key?'bg-neutral-100 border-neutral-300 dark:bg-neutral-800 dark:border-neutral-600':'bg-neutral-100/60 dark:bg-neutral-800/40 border-transparent'}`}>{t.label}</button>
          ))}
        </div>
      </div>
      {tab === 'settings' && <SettingsPanel sizes={sizes} settings={settings} onRefresh={loadAll} />}
      {uiMode==='server' && tab === 'style' && <StylePanel settings={settings} onRefresh={loadAll} localDrinksCellScale={localDrinksCellScale} setLocalDrinksCellScale={(n)=>{ setLocalDrinksCellScale(n); localStorage.setItem('drinksCellScale', String(n)) }} localDrinksItemsPerCol={localDrinksItemsPerCol} setLocalDrinksItemsPerCol={(n)=>{ setLocalDrinksItemsPerCol(n); localStorage.setItem('drinksItemsPerCol', String(n)) }} localBeerItemsPerCol={localBeerItemsPerCol} setLocalBeerItemsPerCol={(n)=>{ setLocalBeerItemsPerCol(n); localStorage.setItem('beerItemsPerCol', String(n)) }} localDrinksIndentPct={adminDrinksIndentPct} setDrinksIndent={(n)=>{ setAdminDrinksIndentPct(n); localStorage.setItem('drinksIndentPct', String(n)) }} showLocalOverrides={false} />}
      {uiMode==='server' && tab === 'sizes' && <SizesPanel onRefresh={loadAll} />}
      {uiMode==='server' && tab === 'beers' && <BeersPanel sizes={sizes} onRefresh={loadAll} />}
      {uiMode==='server' && tab === 'taps' && <TapsPanel onRefresh={loadAll} />}
      {uiMode==='server' && tab === 'drinks' && <DrinksPanel sizes={sizes} onRefresh={loadAll} />}
      {uiMode==='server' && tab === 'media' && <MediaPanel onRefresh={loadAll} />}
      {uiMode==='server' && tab === 'system' && <SystemPanel />}
      {uiMode==='server' && tab === 'arrange' && <ArrangementsPanel />}
    </div>
  )
}
