import { useEffect, useRef, useState } from 'react'
import type { Settings } from '../../types'

type StylePanelProps = {
  settings: Settings | null
  onRefresh: () => void
  localDrinksCellScale: number
  setLocalDrinksCellScale: (n: number) => void
  localDrinksItemsPerCol: number
  setLocalDrinksItemsPerCol: (n: number) => void
  localBeerItemsPerCol: number
  setLocalBeerItemsPerCol: (n: number) => void
  localDrinksIndentPct: number
  setDrinksIndent: (n: number) => void
  setBeerLocalCellScale?: (n: number) => void
  setBeerLocalColumns?: (n: number) => void
  setBeerOverrideFlag?: (v: boolean) => void
  setDrinksOverrideFlag?: (v: boolean) => void
  showLocalOverrides?: boolean
}

export default function StylePanel({
  settings,
  onRefresh,
  localDrinksCellScale,
  setLocalDrinksCellScale,
  localDrinksItemsPerCol,
  setLocalDrinksItemsPerCol,
  localBeerItemsPerCol,
  setLocalBeerItemsPerCol,
  localDrinksIndentPct,
  setDrinksIndent,
  setBeerLocalCellScale = () => {},
  setBeerLocalColumns = () => {},
  setBeerOverrideFlag = () => {},
  setDrinksOverrideFlag = () => {},
  showLocalOverrides = true,
}: StylePanelProps) {
  const [theme, setTheme] = useState<'light'|'dark'>(settings?.themeMode || 'dark')
  const [logoPreview, setLogoPreview] = useState<string | null>(settings?.logoAssetId ? `/api/assets/${settings.logoAssetId}/content` : null)
  const [bgPreview, setBgPreview] = useState<string | null>(settings?.backgroundAssetId ? `/api/assets/${settings.backgroundAssetId}/content` : null)
  const [localCellScale, setLocalCellScale] = useState<number>((settings as any)?.cellScale ?? 50)
  const [localColumnGap, setLocalColumnGap] = useState<number>((settings as any)?.columnGap ?? 40)
  const [localBeerColumns, setLocalBeerColumns] = useState<number>((settings as any)?.beerColumns ?? 1)
  const [localItemsPerPage, setLocalItemsPerPage] = useState<number>((settings as any)?.itemsPerPage ?? 10)
  const [localLogoPosition, setLocalLogoPosition] = useState<'top-left'|'top-center'|'top-right'|'bottom-left'|'bottom-right'>(((settings as any)?.logoPosition as any) ?? 'top-center')
  const [localLogoScale, setLocalLogoScale] = useState<number>((settings as any)?.logoScale ?? 100)
  const [localBgPosition, setLocalBgPosition] = useState<'center'|'top'|'bottom'|'left'|'right'>(((settings as any)?.bgPosition as any) ?? 'center')
  const [localBgScale, setLocalBgScale] = useState<number>((settings as any)?.bgScale ?? 100)
  const [bgPresets, setBgPresets] = useState<Array<{path:string; name:string}>>([])
  const [bgPresetSel, setBgPresetSel] = useState<string>('custom')
  const [logoBgEnabled, setLogoBgEnabled] = useState<boolean>((settings as any)?.logoBgEnabled ?? false)
  const [logoBgColor, setLogoBgColor] = useState<string>((settings as any)?.logoBgColor ?? '#000000')
  const [logoBgRounded, setLogoBgRounded] = useState<boolean>((settings as any)?.logoBgRounded ?? false)
  const [logoBgRadius, setLogoBgRadius] = useState<number>((settings as any)?.logoBgRadius ?? 15)
  const [localBgOpacity, setLocalBgOpacity] = useState<number>((settings as any)?.bgOpacity ?? 100)
  const [localPageBgColor, setLocalPageBgColor] = useState<string>((settings as any)?.pageBgColor ?? '#000000')
  const [showFooter, setShowFooter] = useState<boolean>((settings as any)?.showFooter ?? true)
  const [localLogoPadX, setLocalLogoPadX] = useState<number>((settings as any)?.logoPadX ?? 8)
  const [localLogoPadY, setLocalLogoPadY] = useState<number>((settings as any)?.logoPadY ?? 8)
  // Per-group local override toggles
  const [beerOverride, setBeerOverride] = useState<boolean>(()=>{ try { return localStorage.getItem('beerLocalOverride')==='true' } catch { return false } })
  const [drinksOverride, setDrinksOverride] = useState<boolean>(()=>{ try { return localStorage.getItem('drinksLocalOverride')==='true' } catch { return false } })
  // Track recent user edits to drinks controls to avoid clobber during saves
  const drinksEditTsRef = useRef<number>(0)
  useEffect(()=>{ if (settings) { setTheme(settings.themeMode); setLogoPreview(settings.logoAssetId?`/api/assets/${settings.logoAssetId}/content`:null); setBgPreview(settings.backgroundAssetId?`/api/assets/${settings.backgroundAssetId}/content`:null); setLocalCellScale((settings as any).cellScale ?? 50); setLocalColumnGap((settings as any).columnGap ?? 40); setLocalBeerColumns((settings as any).beerColumns ?? 1); setLocalItemsPerPage((settings as any).itemsPerPage ?? 10); setLocalLogoPosition(((settings as any).logoPosition as any) ?? 'top-center'); setLocalLogoScale((settings as any).logoScale ?? 100); setLocalBgPosition(((settings as any).bgPosition as any) ?? 'center'); setLocalBgScale((settings as any).bgScale ?? 100); setBgPresetSel(((settings as any)?.backgroundPreset as string) ?? 'custom') } },[settings])
  // When override is enabled, prefer local-saved values for beer fields
  useEffect(() => {
    if (!settings) return
    if (beerOverride) {
      const ls = Number(localStorage.getItem('beerLocal_cellScale')||'')
      const lc = Number(localStorage.getItem('beerLocal_columns')||'')
      if (Number.isFinite(ls)) setLocalCellScale(ls)
      if (Number.isFinite(lc) && lc>=1) setLocalBeerColumns(lc)
    }
  }, [beerOverride, settings])
  useEffect(()=>{ if (settings) { setLogoBgEnabled((settings as any).logoBgEnabled ?? false); setLogoBgColor((settings as any).logoBgColor ?? '#000000'); setLogoBgRounded((settings as any).logoBgRounded ?? false); setLogoBgRadius((settings as any).logoBgRadius ?? 15); setLocalBgOpacity((settings as any).bgOpacity ?? 100); setLocalPageBgColor((settings as any).pageBgColor ?? '#000000'); setShowFooter((settings as any).showFooter ?? true) } }, [settings])
  useEffect(()=>{ fetch('/api/backgrounds').then(r=>r.json()).then(setBgPresets).catch(()=>setBgPresets([])) }, [])
  // Reflect server drinks values into UI controls when override is OFF and not actively saving
  useEffect(()=>{
    if (!settings || drinksOverride || savingDrinksRef.current) return
    // Avoid clobbering user during recent interactions (1.2s window)
    if (Date.now() - drinksEditTsRef.current < 1200) return
    const s: any = settings
    if (typeof s.drinksCellScale === 'number' && s.drinksCellScale !== localDrinksCellScale) setLocalDrinksCellScale(s.drinksCellScale)
    if (typeof s.drinksItemsPerCol === 'number' && s.drinksItemsPerCol>0 && s.drinksItemsPerCol !== localDrinksItemsPerCol) setLocalDrinksItemsPerCol(s.drinksItemsPerCol)
    if (typeof s.drinksIndentPct === 'number') {
      const v = Math.max(0, Math.min(30, s.drinksIndentPct))
      if (v !== localDrinksIndentPct) setDrinksIndent(v)
    }
  }, [settings, drinksOverride, localDrinksCellScale, localDrinksItemsPerCol, localDrinksIndentPct])
  useEffect(()=>{ if (settings) { setLocalLogoPadX((settings as any).logoPadX ?? 8); setLocalLogoPadY((settings as any).logoPadY ?? 8) } }, [settings])
  // When drinks override is OFF, reflect server values in the UI controls,
  // but avoid clobbering user edits while a save is in flight.
  const savingDrinksRef = useRef(false)

  const saveTheme = async () => {
    const apiBase = (() => {
      try {
        const m = (settings as any)?.mode as 'server'|'client'|undefined
        const remote = localStorage.getItem('remoteServer') || ''
        if (m === 'client' && remote) return remote
      } catch {}
      return ''
    })()
    const base: any = {
      themeMode: theme,
      rotationSec: settings?.rotationSec ?? 90,
      defaultDisplayMode: settings?.defaultDisplayMode ?? 'all',
      currency: settings?.currency ?? 'GBP',
      defaultSizeId: settings?.defaultSizeId ?? null,
      locale: settings?.locale ?? 'en-GB',
      logoAssetId: settings?.logoAssetId ?? null,
      backgroundAssetId: settings?.backgroundAssetId ?? null,
      backgroundPreset: bgPresetSel==='custom' ? null : bgPresetSel,
      // style defaults
      columnGap: localColumnGap,
      logoPosition: localLogoPosition,
      logoScale: localLogoScale,
      bgPosition: localBgPosition,
      bgScale: localBgScale,
      logoBgEnabled,
      logoBgColor,
      logoBgRounded,
      logoBgRadius,
      bgOpacity: localBgOpacity,
      pageBgColor: localPageBgColor,
      showFooter,
      logoPadX: localLogoPadX,
      logoPadY: localLogoPadY,
      // itemsPerPage persisted from beer settings below (unless overridden)
    }
    // Only persist beer cell scale/columns to server when not locally overridden (or when local overrides are hidden)
    const effBeerOverride = showLocalOverrides ? beerOverride : false
    const effDrinksOverride = showLocalOverrides ? drinksOverride : false
    if (!effBeerOverride) {
      base.cellScale = localCellScale
      base.beerColumns = localBeerColumns
      // Persist global itemsPerPage derived from columns x items-per-column
      const derivedItemsPerPage = Math.max(1, Number(localBeerColumns || 1)) * Math.max(1, Number(localBeerItemsPerCol || 1))
      base.itemsPerPage = derivedItemsPerPage
    }
    // Persist drinks styles to server when not locally overridden
    if (!effDrinksOverride) {
      savingDrinksRef.current = true
      base.drinksCellScale = localDrinksCellScale
      base.drinksItemsPerCol = localDrinksItemsPerCol
      base.drinksIndentPct = localDrinksIndentPct
    }
    try {
      const res = await fetch(`${apiBase}/api/settings`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(base) })
      if (!res.ok) {
        const msg = await res.text().catch(()=> '')
        alert(msg || 'Failed to save settings')
        return
      }
      await onRefresh()
    } finally {
      savingDrinksRef.current = false
    }
  }

  // Auto-save on change (debounced)
  const saveTimer = useRef<any>(null)
  useEffect(() => {
    if (!settings) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { saveTheme() }, 700)
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }
  }, [theme, localCellScale, localColumnGap, localLogoPosition, localLogoScale, localBgPosition, localBgScale, logoBgEnabled, logoBgColor, logoBgRounded, logoBgRadius, localBgOpacity, localBeerColumns, localBeerItemsPerCol, localItemsPerPage, localLogoPadX, localLogoPadY, localPageBgColor, bgPresetSel, showFooter, localDrinksCellScale, localDrinksItemsPerCol, localDrinksIndentPct, drinksOverride])

  const uploadAndSet = async (kind: 'logo'|'background', file: File) => {
    const fd = new FormData(); fd.append('file', file); fd.append('tag', kind==='logo'?'style:logo':'style:background')
    const res = await fetch('/api/upload', { method:'POST', body: fd })
    if (!res.ok) { alert('Upload failed'); return }
    const asset = await res.json()
    const body = {
      themeMode: settings?.themeMode || 'dark',
      rotationSec: settings?.rotationSec ?? 90,
      defaultDisplayMode: settings?.defaultDisplayMode ?? 'all',
      currency: settings?.currency ?? 'GBP',
      defaultSizeId: settings?.defaultSizeId ?? null,
      locale: settings?.locale ?? 'en-GB',
      logoAssetId: kind==='logo' ? asset.id : (settings?.logoAssetId ?? null),
      backgroundAssetId: kind==='background' ? asset.id : (settings?.backgroundAssetId ?? null),
    }
    await fetch('/api/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    if (kind==='background') {
      setBgPresetSel('custom')
      setBgPreview(`/api/assets/${asset.id}/content`)
    }
    await onRefresh()
  }

  const clearImage = async (kind:'logo'|'background') => {
    const body = {
      themeMode: settings?.themeMode || 'dark',
      rotationSec: settings?.rotationSec ?? 90,
      defaultDisplayMode: settings?.defaultDisplayMode ?? 'all',
      currency: settings?.currency ?? 'GBP',
      defaultSizeId: settings?.defaultSizeId ?? null,
      locale: settings?.locale ?? 'en-GB',
      logoAssetId: kind==='logo' ? null : (settings?.logoAssetId ?? null),
      backgroundAssetId: kind==='background' ? null : (settings?.backgroundAssetId ?? null),
    }
    await fetch('/api/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    await onRefresh()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm mb-1">Theme</label>
        <select value={theme} onChange={e=>setTheme(e.target.value as 'light'|'dark')} className="w-40 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
        
      </div>
      

      {/* Beer/Drinks controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-neutral-300 dark:border-neutral-700 rounded p-3">
          <div className="font-semibold mb-2 flex items-center justify-between">
            <span>Beer Display</span>
            {showLocalOverrides ? (
              <label className="text-xs flex items-center gap-2">
                <input type="checkbox" checked={beerOverride} onChange={(e)=>{ const v=e.target.checked; setBeerOverride(v); try{ localStorage.setItem('beerLocalOverride', String(v)); if (v) { localStorage.setItem('beerLocal_cellScale', String(localCellScale)); localStorage.setItem('beerLocal_columns', String(localBeerColumns)); setBeerLocalCellScale(localCellScale); setBeerLocalColumns(localBeerColumns); } }catch{}; setBeerOverrideFlag(v); onRefresh() }} />
                Use local override
              </label>
            ) : null}
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Beer Cell Scale {beerOverride ? '(local override)' : '(default)'}</label>
              <input type="range" min={0} max={100} value={localCellScale} onChange={e=>{ const n=Number(e.target.value); setLocalCellScale(n); if (beerOverride) { try{ localStorage.setItem('beerLocal_cellScale', String(n)) }catch{}; setBeerLocalCellScale(n) } }} className="w-60" />
              <div className="text-xs opacity-70 mt-1">{localCellScale}% — controls image and typography scale.</div>
            </div>
            <div>
              <label className="block text-sm mb-1">Beer Columns {beerOverride ? '(local override)' : '(default)'}</label>
              <input type="number" min={1} max={6} value={localBeerColumns} onChange={e=>{ const n=Math.max(1, Math.min(6, Number(e.target.value)||1)); setLocalBeerColumns(n); if (beerOverride) { try{ localStorage.setItem('beerLocal_columns', String(n)) }catch{}; setBeerLocalColumns(n) } }} className="w-40 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
            </div>
            <div>
              <label className="block text-sm mb-1">Beer Items per Column {beerOverride ? '(local override)' : '(default)'}</label>
              {(() => {
                const computedDefault = (() => {
                  const ipp = (settings as any)?.itemsPerPage
                  const cols = Math.max(1, Number(localBeerColumns || 1))
                  return (typeof ipp === 'number' && ipp > 0) ? Math.max(1, Math.round(ipp / cols)) : (Number.isFinite(localBeerItemsPerCol as any) ? localBeerItemsPerCol : 10)
                })()
                const value = beerOverride ? localBeerItemsPerCol : computedDefault
                return (
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={value}
                    onChange={e=>{ const n=Math.max(1, Math.min(50, Number(e.target.value)||1)); setLocalBeerItemsPerCol(n); try{localStorage.setItem('beerItemsPerCol', String(n))}catch{} }}
                    className="w-40 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700"
                  />
                )
              })()}
            </div>
          </div>
        </div>
        <div className="border border-neutral-300 dark:border-neutral-700 rounded p-3">
          <div className="font-semibold mb-2 flex items-center justify-between">
            <span>Drinks Display</span>
            {showLocalOverrides ? (
              <label className="text-xs flex items-center gap-2">
                <input type="checkbox" checked={drinksOverride} onChange={(e)=>{ const v=e.target.checked; setDrinksOverride(v); try{ localStorage.setItem('drinksLocalOverride', String(v)); if (v) { localStorage.setItem('drinksCellScale', String(localDrinksCellScale)); localStorage.setItem('drinksItemsPerCol', String(localDrinksItemsPerCol)); localStorage.setItem('drinksIndentPct', String(localDrinksIndentPct)); } }catch{}; setDrinksOverrideFlag(v); onRefresh() }} />
                Use local override
              </label>
            ) : null}
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Drinks Cell Scale {drinksOverride ? '(local override)' : '(default)'}</label>
              <input type="range" min={0} max={100} value={localDrinksCellScale} onChange={e=>{ drinksEditTsRef.current = Date.now(); setLocalDrinksCellScale(Number(e.target.value)) }} className="w-60" />
              <div className="text-xs opacity-70 mt-1">{localDrinksCellScale}% — controls drinks typography scale.</div>
            </div>
            <div>
              <label className="block text-sm mb-1">Drinks Items per Column</label>
              <input type="range" min={10} max={60} value={localDrinksItemsPerCol} onChange={e=>{ drinksEditTsRef.current = Date.now(); setLocalDrinksItemsPerCol(Math.max(10, Math.min(60, Number(e.target.value)||10)))} } className="w-60" />
              <div className="text-xs opacity-70 mt-1">{localDrinksItemsPerCol} items</div>
            </div>
            <div>
              <label className="block text-sm mb-1">Drinks indentation (% of cell)</label>
              <input type="range" min={0} max={30} value={Number.isFinite(localDrinksIndentPct as any) ? localDrinksIndentPct : 10} onChange={e=>{ drinksEditTsRef.current = Date.now(); const n=Math.max(0, Math.min(30, Number(e.target.value)||0)); setDrinksIndent(n); try{ localStorage.setItem('drinksIndentPct', String(n)) } catch {} }} className="w-60" />
              <div className="text-xs opacity-70 mt-1">{localDrinksIndentPct}%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-neutral-300 dark:border-neutral-700 rounded p-3">
          <div className="font-semibold mb-1">Logo</div>
          {logoPreview ? (
            <div className="mb-2"><img src={logoPreview} alt="logo" className="h-20 object-contain" /></div>
          ) : <div className="mb-2 text-xs opacity-60">No logo set</div>}
          <input type="file" accept="image/*" onChange={e=>{ const f=e.target.files?.[0]; if(f) uploadAndSet('logo', f).finally(()=>{ (e.target as HTMLInputElement).value='' }) }} className="block w-full text-sm text-neutral-900 dark:text-neutral-100 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 dark:file:bg-neutral-700 dark:hover:file:bg-neutral-600" />
          {settings?.logoAssetId && <button onClick={()=>clearImage('logo')} className="ml-2 text-sm px-2 py-1 rounded bg-neutral-700 text-white border border-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">Clear</button>}
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm">
            <label className="flex items-center gap-2">Position
              <select value={localLogoPosition} onChange={e=>setLocalLogoPosition(e.target.value as any)} className="px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
                <option value="top-left">Top Left</option>
                <option value="top-center">Top Center</option>
                <option value="top-right">Top Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-right">Bottom Right</option>
              </select>
            </label>
            <label className="flex items-center gap-2">Size
              <input type="range" min={10} max={300} value={localLogoScale} onChange={e=>setLocalLogoScale(Number(e.target.value))} />
              <span className="opacity-70">{localLogoScale}%</span>
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2"><input type="checkbox" checked={logoBgEnabled} onChange={e=>setLogoBgEnabled(e.target.checked)} /> Background</label>
              <label className="flex items-center gap-2">Color
                <input type="color" value={logoBgColor} onChange={e=>setLogoBgColor(e.target.value)} className="h-7 w-10 p-0 bg-transparent border-2 border-black dark:border-white rounded" />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2"><input type="checkbox" checked={logoBgRounded} onChange={e=>setLogoBgRounded(e.target.checked)} /> Rounded Corners</label>
              <label className="flex items-center gap-2">Radius
                <input type="number" min={0} max={200} value={logoBgRadius} onChange={e=>setLogoBgRadius(Math.max(0, Math.min(200, Number(e.target.value)||0)))} className="w-24 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
              </label>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-3">Padding X
                <input type="range" min={0} max={100} value={localLogoPadX} onChange={e=>setLocalLogoPadX(Number(e.target.value))} />
                <span className="opacity-70 ml-2 min-w-[3.5rem] text-right">{localLogoPadX}px</span>
              </label>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-3">Padding Y
                <input type="range" min={0} max={100} value={localLogoPadY} onChange={e=>setLocalLogoPadY(Number(e.target.value))} />
                <span className="opacity-70 ml-2 min-w-[3.5rem] text-right">{localLogoPadY}px</span>
              </label>
            </div>
          </div>
        </div>
        <div className="border border-neutral-300 dark:border-neutral-700 rounded p-3">
          <div className="font-semibold mb-1">Background</div>
          <div className="mb-2">
            <label className="block text-sm mb-1">Background Preset</label>
            <select value={bgPresetSel} onChange={e=>setBgPresetSel(e.target.value)} className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
              <option value="custom">Custom</option>
              {bgPresets.map(p => {
                const label = p.name
                  .replace(/\.[^.]+$/, '')
                  .replace(/[-_]+/g, ' ')
                  .replace(/^./, (c) => c.toUpperCase());
                return <option key={p.path} value={p.path}>{label}</option>
              })}
            </select>
          </div>
          {bgPresetSel !== "custom" ? (
            <div className="mb-2"><img src={bgPresetSel} alt="background" className="h-24 object-cover w-full" /></div>
          ) : (bgPreview ? (
            <div className="mb-2"><img src={bgPreview} alt="background" className="h-24 object-cover w-full" /></div>
          ) : <div className="mb-2 text-xs opacity-60">No background set</div>)}
          {bgPresetSel==='custom' && (
          <input type="file" accept="image/*" onChange={e=>{ const f=e.target.files?.[0]; if(f) uploadAndSet('background', f).finally(()=>{ (e.target as HTMLInputElement).value='' }) }} className="block w-full text-sm text-neutral-900 dark:text-neutral-100 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 dark:file:bg-neutral-700 dark:hover:file:bg-neutral-600" />
          )}
          {settings?.backgroundAssetId && <button onClick={()=>clearImage('background')} className="ml-2 text-sm px-2 py-1 rounded bg-neutral-700 text-white border border-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">Clear</button>}
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm">
            <label className="flex items-center gap-2">Position
              <select value={localBgPosition} onChange={e=>setLocalBgPosition(e.target.value as any)} className="px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
                <option value="center">Center</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label className="flex items-center gap-2">Size
              <input type="range" min={50} max={300} value={localBgScale} onChange={e=>setLocalBgScale(Number(e.target.value))} />
              <span className="opacity-70">{localBgScale}%</span>
            </label>
            <label className="flex items-center gap-2">Opacity
              <input type="range" min={0} max={100} value={localBgOpacity} onChange={e=>setLocalBgOpacity(Number(e.target.value))} />
              <span className="opacity-70">{localBgOpacity}%</span>
            </label>
            <label className="flex items-center gap-2">Page Background Color
              <input type="color" value={localPageBgColor} onChange={e=>setLocalPageBgColor(e.target.value)} className="h-7 w-10 p-0 bg-transparent border-2 border-black dark:border-white rounded" />
            </label>
          </div>
        </div>
      </div>

      {/* Other controls */}
      <div className="border border-neutral-300 dark:border-neutral-700 rounded p-3 mt-4">
        <div className="font-semibold mb-2">Other controls</div>
        <div className="space-y-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={showFooter} onChange={e=>setShowFooter(e.target.checked)} /> Show bottom page counter</label>
          <div>
            <label className="block text-sm mb-1">Column Gap</label>
            <input type="range" min={0} max={80} value={localColumnGap} onChange={e=>setLocalColumnGap(Number(e.target.value))} className="w-60" />
            <div className="text-xs opacity-70 mt-1">{localColumnGap}px — horizontal spacing between columns.</div>
          </div>
        </div>
      </div>

      
      {/* Auto-save active; manual Save not required */}
    </div>
  )
}
