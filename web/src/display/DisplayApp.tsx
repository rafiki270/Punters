import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import AdminOverlay from './admin/AdminOverlay'
import renderSlide from './renderSlide'
import useAutoHide from './hooks/useAutoHide'
import useDisplayPreferences from './hooks/useDisplayPreferences'
import useScreenParams from './hooks/useScreenParams'
import useDisplaySocket from './hooks/useDisplaySocket'
import useDisplayData from './hooks/useDisplayData'
import useSlides from './hooks/useSlides'
import useSlideTiming from './hooks/useSlideTiming'
import useFullscreen from './hooks/useFullscreen'
import type { Ad, Device, Discovered, Settings, Size } from './types'
import { resolvePauseToggle, computePausedNextSnapshot } from './lib/slidePicker'
import type { DisplayMode } from './lib/displayMode'

function DisplayApp() {
  const { deviceId, screenIndex: screenIndexParam, setScreenIndex: setScreenIndexParam, screenCount: screenCountParam, setScreenCount: setScreenCountParam } = useScreenParams()
  const {
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
  } = useDisplayData(deviceId)
  const [pageIdx, setPageIdx] = useState(0)
  const [secs, setSecs] = useState(0)
  const [paused, setPaused] = useState(false)
  const [pauseSnapshot, setPauseSnapshot] = useState<{ idx: number|null; secsLeft: number } | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const controlsVisible = useAutoHide(10000)
  const {
    localDisplayMode,
    setLocalDisplayMode,
    localShowDrinks,
    setLocalShowDrinks,
    localShowCocktails,
    setLocalShowCocktails,
    localBeerItemsPerCol,
    setLocalBeerItemsPerCol,
    localDrinksCellScale,
    setLocalDrinksCellScale,
    localDrinksItemsPerCol,
    setLocalDrinksItemsPerCol,
    localDrinksIndentPct,
    setLocalDrinksIndentPct,
    beerOverrideFlag,
    setBeerOverrideFlag,
    drinksOverrideFlag,
    setDrinksOverrideFlag,
    beerLocalCellScale,
    setBeerLocalCellScale,
    beerLocalColumns,
    setBeerLocalColumns,
  } = useDisplayPreferences()
  const beerLocalOverride = beerOverrideFlag
  const drinksLocalOverride = drinksOverrideFlag
  const { isFullscreen, toggleFullscreen } = useFullscreen()
  // state for screen sync panel
  const [showSync, setShowSync] = useState(false)
  useEffect(() => { if (adminOpen) setShowSync(false) }, [adminOpen])
  // Temporary identify overlay
  const [identify, setIdentify] = useState<{ n: number; until: number } | null>(null)
  // Beer columns and items per page are now global defaults (server) with device overrides
  // Style values now inherit from server settings by default; device may override
  // Local client-only fallbacks retained for Items per Page only.


  // Effective beer style values
  const effBeerCellScale = useMemo(() => {
    if (beerLocalOverride) return beerLocalCellScale
    return (device?.cellScale ?? settings?.cellScale ?? 50)
  }, [beerLocalOverride, beerLocalCellScale, device?.cellScale, settings?.cellScale])
  const effBeerColumns = useMemo(() => {
    if (beerLocalOverride) return beerLocalColumns
    return (device?.beerColumns || settings?.beerColumns || 1)
  }, [beerLocalOverride, beerLocalColumns, device?.beerColumns, settings?.beerColumns])
  const effBeerItemsPerCol = useMemo(() => {
    if (beerLocalOverride) return localBeerItemsPerCol
    // Prefer device override if present
    if (typeof device?.itemsPerColumn === 'number' && device.itemsPerColumn > 0) return device.itemsPerColumn
    // Fall back to global itemsPerPage split across columns
    const ipp = settings?.itemsPerPage
    const cols = (device?.beerColumns || settings?.beerColumns || 1)
    if (typeof ipp === 'number' && ipp > 0 && cols > 0) {
      return Math.max(1, Math.round(ipp / cols))
    }
    // Last resort: local preference
    return localBeerItemsPerCol
  }, [beerLocalOverride, device?.itemsPerColumn, settings?.itemsPerPage, device?.beerColumns, settings?.beerColumns, localBeerItemsPerCol])

  const columns = effBeerColumns
  const itemsPerColumn = effBeerItemsPerCol

  useEffect(() => { loadAll() }, [loadAll])

  // Shared epoch from server tick for sync
  const [epoch, setEpoch] = useState<number>(Date.now())
  const [cycleOffset, setCycleOffset] = useState<number>(0)
  const [anchorMs, setAnchorMs] = useState<number|null>(null)
  const socketRef = useDisplaySocket({
    mode,
    remoteBase,
    screenIndex: screenIndexParam,
    screenCount: screenCountParam,
    deviceId,
    loadAll,
    setEpoch,
    setCycleOffset,
    setAnchorMs,
    setIdentify,
    setScreenIndex: setScreenIndexParam,
    setScreenCount: setScreenCountParam,
    setLocalDisplayMode,
    setLocalShowDrinks,
    setLocalShowCocktails,
  })
  // Always enable server-time-based sync so all displays switch together
  const syncEnabled = true

  // Local fallback timer (disabled when sync is enabled)
  useEffect(() => {
    if (syncEnabled) return
    const dur = settings?.rotationSec ?? 90
    setSecs(dur)
    const id = setInterval(() => setSecs((s) => {
      if (paused) return s
      if (s <= 1) {
        setPageIdx((p) => p + 1)
        return dur
      }
      return s - 1
    }), 1000)
    return () => clearInterval(id)
  }, [settings?.rotationSec, paused, syncEnabled])

  function formatMoney(amountMinor: number, currency?: string): string {
    const cur = currency || settings?.currency || 'GBP'
    const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: cur })
    return formatter.format((amountMinor || 0) / 100)
  }
  const effDrinksCellScale = useMemo(() => {
    if (drinksLocalOverride) return localDrinksCellScale
    const s: any = settings || {}
    return (typeof s.drinksCellScale === 'number' ? s.drinksCellScale : (s.cellScale ?? 50))
  }, [drinksLocalOverride, localDrinksCellScale, settings])
  const effDrinksItemsPerCol = useMemo(() => {
    if (drinksLocalOverride) return localDrinksItemsPerCol
    const s: any = settings || {}
    return (typeof s.drinksItemsPerCol === 'number' && s.drinksItemsPerCol > 0) ? s.drinksItemsPerCol : (device?.itemsPerColumn || 10)
  }, [drinksLocalOverride, localDrinksItemsPerCol, settings, device?.itemsPerColumn])
  const effDrinksIndentPct = useMemo(() => {
    if (drinksLocalOverride) return localDrinksIndentPct
    const s: any = settings || {}
    const v = s.drinksIndentPct
    return (typeof v === 'number') ? Math.max(0, Math.min(30, v)) : 10
  }, [drinksLocalOverride, localDrinksIndentPct, settings])

  const { tapBeers, slides } = useSlides({
    taps,
    columns,
    effBeerItemsPerCol,
    ads,
    drinks,
    cocktails,
    drinkCategories,
    device,
    localDisplayMode,
    localShowDrinks,
    localShowCocktails,
    effDrinksItemsPerCol,
  })

  const rotation = settings?.rotationSec ?? 90
  const { cur, curIdx, curIsAd, curIsFullscreen, curHidesFooter, footPadPx, remainingSecs } = useSlideTiming({
    slides,
    settings,
    device,
    localDisplayMode,
    screenCount: screenCountParam,
    screenIndex: screenIndexParam,
    cycleOffset,
    epoch,
    anchorMs,
    rotation,
    paused,
    pauseSnapshot,
    secs,
    syncEnabled,
  })

  const bgUrl = settings?.backgroundPreset ? settings.backgroundPreset : (settings?.backgroundAssetId ? `${contentBase}/api/assets/${settings.backgroundAssetId}/content` : null)
  const logoUrl = settings?.logoAssetId ? `${contentBase}/api/assets/${settings.logoAssetId}/content` : null
  const effCellScale = effBeerCellScale
  const effColumnGap = (device?.columnGap ?? settings?.columnGap ?? 40)
  const effLogoPosition = (device?.logoPosition ?? settings?.logoPosition ?? 'top-center') as 'top-left'|'top-center'|'top-right'|'bottom-left'|'bottom-right'
  const effLogoScale = (device?.logoScale ?? settings?.logoScale ?? 100)
  const effBgPosition = (device?.bgPosition ?? settings?.bgPosition ?? 'center') as 'center'|'top'|'bottom'|'left'|'right'
  const effBgScale = (device?.bgScale ?? settings?.bgScale ?? 100)
  const effBgOpacity = settings?.bgOpacity ?? 100
  const effLogoPadX = settings?.logoPadX ?? 8
  const effLogoPadY = settings?.logoPadY ?? 8
  useEffect(() => {
    const isDark = (settings?.themeMode || 'dark') === 'dark'
    document.documentElement.classList.toggle('dark', isDark)
  }, [settings?.themeMode])
  const logoPosClass = effLogoPosition === 'top-center'
    ? 'top-3 left-1/2 -translate-x-1/2'
    : `${effLogoPosition.includes('top') ? 'top-3' : 'bottom-3'} ${effLogoPosition.includes('left') ? 'left-3' : 'right-3'}`

  // Always apply padding around the logo; background color/rounded only when enabled
  const logoContainerStyle: React.CSSProperties = {
    padding: `${effLogoPadY}px ${effLogoPadX}px`,
    ...(settings?.logoBgEnabled ? {
      backgroundColor: settings.logoBgColor || '#000000',
      borderRadius: (settings.logoBgRounded ? (settings.logoBgRadius ?? 15) : 0),
    } : {}),
  }

  const showLogo = useMemo(() => {
    if (!logoUrl) return false
    if (!cur) return true
    if (cur.type === 'adpair') {
      const pair = cur.data as Ad[]
      return !(Array.isArray(pair) && pair.some(a => a?.hideLogo === true))
    }
    if (cur.type === 'ad') {
      const adObj = cur.data as Ad | undefined
      if (adObj?.hideLogo) return false
      return curIsFullscreen ? adObj?.requireLogo === true : true
    }
    return true
  }, [logoUrl, cur, curIsFullscreen])

  const slidesLen = slides.length

  const handlePauseToggle = useCallback(() => {
    const nextState = resolvePauseToggle(paused, curIdx ?? null, remainingSecs)
    setPaused(nextState.paused)
    setPauseSnapshot(nextState.snapshot)
  }, [paused, curIdx, remainingSecs])

  const handleNextPage = useCallback(() => {
    if (paused) {
      const nextSnapshot = computePausedNextSnapshot(slidesLen, curIdx ?? null, remainingSecs, pauseSnapshot)
      if (nextSnapshot) setPauseSnapshot(nextSnapshot)
      return
    }
    try { socketRef.current?.emit('next_page') } catch {}
  }, [paused, slidesLen, curIdx, remainingSecs, pauseSnapshot])

  // Measure logo to add top padding when logo is at top
  const logoRef = useRef<HTMLDivElement | null>(null)
  const [logoBoxH, setLogoBoxH] = useState<number>(0)
  useEffect(() => {
    if (!showLogo) {
      setLogoBoxH(0)
      return
    }
    const measure = () => {
      if (logoRef.current) setLogoBoxH(Math.round(logoRef.current.getBoundingClientRect().height + 12))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [showLogo, logoUrl, effLogoScale, effLogoPosition, effLogoPadX, effLogoPadY, settings?.logoBgEnabled, settings?.logoBgRounded, settings?.logoBgRadius])

  return (
    <div className={`relative h-screen overflow-hidden text-neutral-900 dark:text-neutral-100 ${curIsAd ? '' : 'p-6'}`}>
      {/* Background color layer */}
      <div
        className="absolute inset-0 -z-20"
        style={{ backgroundColor: settings?.pageBgColor || undefined }}
      />
      {/* Background image layer */}
      {bgUrl && (
        <div
          className="absolute inset-0 -z-10 bg-no-repeat bg-center"
          style={{ backgroundImage: `url(${bgUrl})`, backgroundSize: `${effBgScale}%`, backgroundPosition: effBgPosition, opacity: Math.max(0, Math.min(1, effBgOpacity/100)) }}
        />
      )}
      {/* Identify overlay */}
      {identify && (Date.now() < identify.until) && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="text-red-600 font-extrabold" style={{ fontSize: '22vh', textShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>
            {identify.n || 0}
          </div>
        </div>
      )}
      {/* Floating controls (auto-hide) */}
      <div className={`fixed top-3 right-3 z-50 transition-opacity ${controlsVisible ? 'opacity-100' : 'opacity-0'} pointer-events-auto flex items-center gap-2`}>
        <button onClick={handlePauseToggle} className="px-3 py-1.5 rounded bg-blue-600 text-white border border-blue-700 shadow dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
          {paused ? (
            // Play icon
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M8 5v14l11-7z"/></svg>
          ) : (
            // Pause icon
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
          )}
        </button>
        <button onClick={handleNextPage} className="px-3 py-1.5 rounded bg-blue-600 text-white border border-blue-700 shadow dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" aria-label="Next Page">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M7 6h2v12H7zM11 6l8 6-8 6z"/></svg>
        </button>
        <button onClick={toggleFullscreen} className="px-3 py-1.5 rounded bg-blue-600 text-white border border-blue-700 shadow dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
          {isFullscreen ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 4.5 L4.5 4.5 L4.5 10 M14 4.5 L19.5 4.5 L19.5 10 M10 19.5 L4.5 19.5 L4.5 14 M14 19.5 L19.5 19.5 L19.5 14" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          )}
        </button>
        {/* Screen sync controls removed (moved to Arrangements) */}
        <button onClick={() => setAdminOpen((v) => { const next=!v; if (next) setShowSync(false); return next })} className="px-3 py-1.5 rounded bg-blue-600 text-white border border-blue-700 shadow dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
          {adminOpen ? 'Close Admin' : 'Admin'}
        </button>
      </div>

      

      {/* Info overlay (manual) */}
      {showInfo && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center text-neutral-900 dark:text-neutral-100" onClick={()=>setShowInfo(false)}>
          <div className="relative max-w-3xl mx-4 bg-white/95 dark:bg-neutral-900/95 border border-neutral-300 dark:border-neutral-700 rounded-lg shadow-xl p-6 text-center">
            <div className="flex flex-col items-center">
              <img src={(settings?.themeMode||'dark')==='dark' ? '/logo_white.png' : '/logo_black.png'} alt="logo" className="h-24 w-auto" />
              <div className="space-y-6 mt-6">
                <div className="text-sm opacity-80"><span className="font-bold">Punters</span> is an application brought to you for <span className="font-bold">FREE</span> by</div>
                <div className="text-2xl md:text-4xl font-extrabold">Not That California Brewing Co.</div>
                <div className="text-xs md:text-sm opacity-80">California, Scotland 🏴󠁧󠁢󠁳󠁣󠁴󠁿</div>
                <div className="text-xs md:text-sm break-words">
                  <div>order beers on <a href="https://www.notthatcalifornia.com" target="_blank" rel="noreferrer" className="underline">www.notthatcalifornia.com</a></div>
                  <div>call <a href="tel:07972574949" className="underline">07972574949</a></div>
                  <div>email <a href="mailto:sales@notthatcalifornia.com" className="underline">sales@notthatcalifornia.com</a></div>
                </div>
                <div className="text-[11px] opacity-70">Click anywhere to close</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info button (bottom-right), shown with controls */}
      <div className={`fixed bottom-3 right-3 z-40 transition-opacity ${controlsVisible ? 'opacity-100' : 'opacity-0'} pointer-events-auto`}>
        <button onClick={()=>setShowInfo(true)} className="h-9 w-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/50 dark:bg-neutral-800/80 dark:hover:bg-neutral-800/90">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
        </button>
      </div>

      {/* Optional logo */}
      {showLogo && (
        <div ref={logoRef} className={`fixed pointer-events-none ${logoPosClass}`}>
          <div style={logoContainerStyle} className="inline-block">
            <img src={logoUrl!} alt="logo" style={{ width: Math.round(96 * (effLogoScale/100)) }} className="object-contain max-h-[20vh]" />
          </div>
        </div>
      )}

      {/* Admin overlay */}
      {adminOpen && (
        <AdminOverlay
          isOpen={adminOpen} // New prop
          sizes={sizes}
          settings={settings}
          onClose={() => setAdminOpen(false)}
          onRefresh={loadAll}
          mode={mode}
          servers={servers}
          remoteBase={remoteBase}
          onSelectServer={(url)=>{ setRemoteBase(url || null); loadAll() }}
          localDisplayMode={localDisplayMode}
          setLocalDisplayMode={setLocalDisplayMode}
          localShowDrinks={localShowDrinks}
          setLocalShowDrinks={setLocalShowDrinks}
          localDrinksCellScale={localDrinksCellScale}
          setLocalDrinksCellScale={setLocalDrinksCellScale}
          localDrinksItemsPerCol={localDrinksItemsPerCol}
          setLocalDrinksItemsPerCol={setLocalDrinksItemsPerCol}
          localBeerItemsPerCol={localBeerItemsPerCol}
          setLocalBeerItemsPerCol={setLocalBeerItemsPerCol}
          localDrinksIndentPct={localDrinksIndentPct}
          setLocalDrinksIndentPct={setLocalDrinksIndentPct}
          setBeerLocalCellScale={setBeerLocalCellScale}
          setBeerLocalColumns={setBeerLocalColumns}
          setBeerOverrideFlag={setBeerOverrideFlag}
          setDrinksOverrideFlag={setDrinksOverrideFlag}

        />
      )}
      {mode==='client' && !remoteBase && (
        <div className="mb-4 p-3 rounded border border-yellow-700 bg-yellow-900/30 text-yellow-200 text-sm">
          No server selected. Open Admin → Server tab to choose or enter the main server URL.
        </div>
      )}
      {renderSlide({
        cur,
        tapBeers,
        columns,
        columnGap: effColumnGap,
        cellScale: effCellScale,
        drinksCellScale: effDrinksCellScale,
        drinksIndentPct: effDrinksIndentPct,
        sizes,
        contentBase,
        formatMoney,
        defaultSizeId: settings?.defaultSizeId ?? null,
        curIsFullscreen,
        footPadPx,
        logoBoxH,
        logoOnTop: effLogoPosition.startsWith('top'),
      })}
      {(settings?.showFooter !== false) && !curHidesFooter && (
        <div className="fixed inset-x-0 bottom-3 flex justify-center">
          <div className="px-7 py-2 rounded-full text-sm shadow bg-black/40 text-white dark:bg-neutral-800/80 dark:text-neutral-100 text-center flex flex-col items-center gap-1">
            {slides.length > 1 && (curIdx != null) && (
              <div className="flex items-center gap-3">
                <span>
                  Page { (curIdx + 1) } of { slides.length } • {paused ? 'rotation paused' : `changes in ${remainingSecs} seconds`}
                </span>
              </div>
            )}
            <div className="text-[10px] leading-tight opacity-80">© Not That California R&D</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DisplayEntry() {
  return <DisplayApp />
}

export { default as AdminPage } from './admin/AdminPage'
