import { useEffect, useState } from 'react'
import ArrangementsPanel from '../../admin/panels/ArrangementsPanel'
import MediaPanel from '../../admin/panels/MediaPanel'
import SystemPanel from '../../admin/panels/SystemPanel'
import type { Discovered, Settings, Size } from '../types'
import BeersPanel from './panels/BeersPanel'
import DrinksPanel from './panels/DrinksPanel'
import CocktailsPanel from './panels/CocktailsPanel'
import SizesPanel from './panels/SizesPanel'
import StylePanel from './panels/StylePanel'
import TapsPanel from './panels/TapsPanel'
import SettingsPanel from './panels/SettingsPanel'

type AdminOverlayProps = {
  isOpen: boolean
  sizes: Size[]
  settings: Settings | null
  onClose: () => void
  onRefresh: () => void
  mode: 'server' | 'client'
  servers: Discovered[]
  remoteBase: string | null
  onSelectServer: (url: string) => void
  localDisplayMode: 'everything' | 'all' | 'beer' | 'drinks' | 'ads'
  setLocalDisplayMode: (v: 'everything' | 'all' | 'beer' | 'drinks' | 'ads') => void
  localShowDrinks: boolean
  setLocalShowDrinks: (v: boolean) => void
  localBeerColumns: number
  setLocalBeerColumns: (n: number) => void
  localItemsPerPage: number
  setLocalItemsPerPage: (n: number) => void
  localDrinksCellScale: number
  setLocalDrinksCellScale: (n: number) => void
  localDrinksItemsPerCol: number
  setLocalDrinksItemsPerCol: (n: number) => void
  localBeerItemsPerCol: number
  setLocalBeerItemsPerCol: (n: number) => void
  localDrinksIndentPct: number
  setLocalDrinksIndentPct: (n: number) => void
  setBeerLocalCellScale: (n: number) => void
  setBeerLocalColumns: (n: number) => void
  setBeerOverrideFlag: (v: boolean) => void
  setDrinksOverrideFlag: (v: boolean) => void
}

export default function AdminOverlay({
  isOpen,
  sizes,
  settings,
  onClose,
  onRefresh,
  mode,
  servers,
  remoteBase,
  onSelectServer,
  localDisplayMode,
  setLocalDisplayMode,
  localShowDrinks,
  setLocalShowDrinks,
  localBeerColumns,
  setLocalBeerColumns,
  localItemsPerPage,
  setLocalItemsPerPage,
  localDrinksCellScale,
  setLocalDrinksCellScale,
  localDrinksItemsPerCol,
  setLocalDrinksItemsPerCol,
  localBeerItemsPerCol,
  setLocalBeerItemsPerCol,
  localDrinksIndentPct,
  setLocalDrinksIndentPct,
  setBeerLocalCellScale,
  setBeerLocalColumns,
  setBeerOverrideFlag,
  setDrinksOverrideFlag,
}: AdminOverlayProps) {
  const [uiMode, setUiMode] = useState<'server'|'client'>(mode)
  const tabs: Array<{key: string; label: string}> = [
    { key: 'settings', label: 'Settings' },
    ...(uiMode==='server' ? [
      { key: 'style', label: 'Style' },
      { key: 'sizes', label: 'Sizes' },
      { key: 'beers', label: 'Beers' },
      { key: 'taps', label: 'Taps' },
      { key: 'cocktails', label: 'Cocktails' },
      { key: 'drinks', label: 'Other drinks' },
      { key: 'media', label: 'Media' },
      { key: 'arrange', label: 'Arrangements' },
      { key: 'system', label: 'System' },
    ] as any : [])
  ]
  // Persist last-opened tab per session
  const normalizeTabKey = (value: string | null) => {
    if (value === 'backup') return 'system'
    return value
  }
  const [tab, setTab] = useState<string>(() => {
    const savedRaw = typeof window !== 'undefined' ? sessionStorage.getItem('adminLastTab') : null
    const saved = normalizeTabKey(savedRaw)
    // If in client mode, force Settings
    if ((mode !== 'server') && saved && saved !== 'settings') return 'settings'
    return saved || 'settings'
  })
  useEffect(() => {
    try { sessionStorage.setItem('adminLastTab', tab) } catch {}
  }, [tab])
  useEffect(()=>{ if (uiMode !== 'server' && tab !== 'settings') setTab('settings') }, [uiMode, tab])

  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
    } else {
      const timer = setTimeout(() => setShouldRender(false), 300); // Match duration
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div className={`fixed inset-0 z-20 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`} onClick={onClose}>
      <div className={`absolute right-3 top-12 w-[95vw] max-w-5xl max-h-[85vh] overflow-auto rounded-md bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700 shadow-xl p-4
        transition-all duration-300 ease-out transform ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`} onClick={(e)=>e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-2 text-sm">
              {tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded border ${tab===t.key?'bg-neutral-100 border-neutral-300 dark:bg-neutral-800 dark:border-neutral-600':'bg-neutral-100/60 dark:bg-neutral-800/40 border-transparent'}`}>{t.label}</button>
              ))}
            </div>
            <button onClick={onClose} className="px-3 py-1.5 rounded bg-neutral-700 text-white border border-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">Close</button>
          </div>
        {tab === 'settings' && <SettingsPanel sizes={sizes} settings={settings} onRefresh={onRefresh} />}
        {uiMode==='server' && tab === 'style' && <StylePanel settings={settings} onRefresh={onRefresh} localDrinksCellScale={localDrinksCellScale} setLocalDrinksCellScale={(n)=>{ setLocalDrinksCellScale(n); localStorage.setItem('drinksCellScale', String(n)) }} localDrinksItemsPerCol={localDrinksItemsPerCol} setLocalDrinksItemsPerCol={(n)=>{ setLocalDrinksItemsPerCol(n); localStorage.setItem('drinksItemsPerCol', String(n)) }} localBeerItemsPerCol={localBeerItemsPerCol} setLocalBeerItemsPerCol={(n)=>{ setLocalBeerItemsPerCol(n); localStorage.setItem('beerItemsPerCol', String(n)) }} localDrinksIndentPct={localDrinksIndentPct} setDrinksIndent={setLocalDrinksIndentPct} setBeerLocalCellScale={setBeerLocalCellScale} setBeerLocalColumns={setBeerLocalColumns} setBeerOverrideFlag={setBeerOverrideFlag} setDrinksOverrideFlag={setDrinksOverrideFlag} />}
        {uiMode==='server' && tab === 'sizes' && <SizesPanel onRefresh={onRefresh} />}
        {uiMode==='server' && tab === 'beers' && <BeersPanel sizes={sizes} onRefresh={onRefresh} />}
        {uiMode==='server' && tab === 'taps' && <TapsPanel onRefresh={onRefresh} />}
        {uiMode==='server' && tab === 'cocktails' && <CocktailsPanel currency={settings?.currency} onRefresh={onRefresh} />}
        {uiMode==='server' && tab === 'drinks' && <DrinksPanel sizes={sizes} onRefresh={onRefresh} />}
        {uiMode==='server' && tab === 'media' && <MediaPanel onRefresh={onRefresh} />}
        {uiMode==='server' && tab === 'system' && <SystemPanel />}
        {uiMode==='server' && tab === 'arrange' && <ArrangementsPanel />}
        {/* Devices tab removed */}
      </div>
    </div>
  )
}
