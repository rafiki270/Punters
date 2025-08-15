import { useEffect, useMemo, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

type Settings = { themeMode: 'light'|'dark'; rotationSec: number; currency: string; defaultSizeId?: number|null; locale?: string; defaultDisplayMode?: 'all'|'beer'|'ads'; logoAssetId?: number|null; backgroundAssetId?: number|null; backgroundPreset?: string|null; cellScale?: number; columnGap?: number; logoPosition?: 'top-left'|'top-center'|'top-right'|'bottom-left'|'bottom-right'; logoScale?: number; bgPosition?: 'center'|'top'|'bottom'|'left'|'right'; bgScale?: number; beerColumns?: number; itemsPerPage?: number; logoBgEnabled?: boolean; logoBgColor?: string; logoBgRounded?: boolean; logoBgRadius?: number; bgOpacity?: number; logoPadX?: number; logoPadY?: number; pageBgColor?: string; showFooter?: boolean }
type Price = { serveSizeId: number; amountMinor: number; currency: string; size?: { id: number; name: string; displayOrder: number; volumeMl?: number } }
type Beer = { id: number; name: string; brewery: string; style: string; abv?: number; isGuest: boolean; badgeAssetId?: number|null; prices: Price[]; colorHex?: string|null }
type TapBeer = { tapNumber: number; status: string; beer: Beer|null }
type Ad = { id: number; filename: string; mimeType: string; width?: number|null; height?: number|null; allowPair?: boolean; fullscreen?: boolean; requireLogo?: boolean; displayOrder?: number }
type Size = { id: number; name: string; volumeMl: number; displayOrder: number }
type Discovered = { name: string; host: string; port: number; addresses: string[] }
type Device = { id:number; name:string; displayMode:'inherit'|'all'|'beer'|'ads'; beerColumns:number; itemsPerColumn:number; cellScale?:number|null; columnGap?:number|null; logoPosition?: 'top-left'|'top-center'|'top-right'|'bottom-left'|'bottom-right' | null; logoScale?: number|null; bgPosition?: 'center'|'top'|'bottom'|'left'|'right' | null; bgScale?: number|null }

// Simple overlay that auto-hides the controls when idle
function useAutoHide(delayMs: number) {
  const [visible, setVisible] = useState(true)
  const timer = useRef<number | null>(null)
  useEffect(() => {
    const show = () => {
      setVisible(true)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setVisible(false), delayMs)
    }
    show()
    const onMove = () => show()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchstart', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchstart', onMove)
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [delayMs])
  return visible
}

// Reusable button with min 1s disabled + spinner feedback
function LoadingButton({ onClick, children, className }: { onClick: () => Promise<void> | void; children: React.ReactNode; className?: string }) {
  const [loading, setLoading] = useState(false)
  const handle = async () => {
    if (loading) return
    setLoading(true)
    const minDelay = new Promise<void>(res => setTimeout(res, 1000))
    try { await Promise.all([Promise.resolve(onClick()), minDelay]) } finally { setLoading(false) }
  }
  return (
    <button onClick={handle} disabled={loading} className={`${className ?? ''} inline-flex items-center gap-2 ${loading ? 'opacity-80 cursor-not-allowed' : ''}`}>
      {loading && <span className="inline-block h-4 w-4 border-2 border-neutral-300 border-t-transparent rounded-full animate-spin" />}
      <span>{children}</span>
    </button>
  )
}

function Admin() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Admin (stub)</h1>
      <ul className="list-disc ml-5 space-y-1">
        <li>Settings: theme, rotation, default prices, locale</li>
        <li>Beers: CRUD and prices per size</li>
        <li>Taps: assign/clear/kick, search from history</li>
        <li>Media: JPG/PNG upload</li>
      </ul>
    </div>
  )
}

function Display() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [taps, setTaps] = useState<TapBeer[]>([])
  const [ads, setAds] = useState<Ad[]>([])
  const [pageIdx, setPageIdx] = useState(0)
  const [secs, setSecs] = useState(0)
  const [paused, setPaused] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const controlsVisible = useAutoHide(10000)
  const [sizes, setSizes] = useState<Size[]>([])
  const [mode, setMode] = useState<'server'|'client'>('server')
  const [servers, setServers] = useState<Discovered[]>([])
  const [remoteBase, setRemoteBase] = useState<string | null>(null)
  const [device, setDevice] = useState<Device | null>(null)
  const [localDisplayMode, setLocalDisplayMode] = useState<'all'|'beer'|'ads'>(()=> (localStorage.getItem('localDisplayMode') as any) || 'all')
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Beer columns and items per page are now global defaults (server) with device overrides
  // Style values now inherit from server settings by default; device may override
  // Local client-only fallbacks retained for Items per Page only.

  const deviceId = useMemo(() => {
    const sp = new URLSearchParams(window.location.search)
    const id = sp.get('deviceId')
    return id ? Number(id) : null
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
    }
  }

  async function loadAll() {
    try {
      const m = await fetch('/api/mode').then(r=>r.json()).catch(()=>({mode:'server'}))
      setMode(m.mode === 'client' ? 'client' : 'server')
      // discover servers (client mode only)
      if (m.mode === 'client') {
        const list = await fetch('/api/discovery/servers').then(r=>r.json()).catch(()=>[])
        setServers(list)
        const saved = localStorage.getItem('remoteServer')
        if (saved) setRemoteBase(saved)
      }

      const base = (m.mode === 'client' && (localStorage.getItem('remoteServer'))) ? localStorage.getItem('remoteServer')! : ''
      const [s, sz, bl, aa] = await Promise.all([
        fetch(`${base}/api/settings`).then(r=>r.json()),
        fetch(`${base}/api/sizes`).then(r=>r.json()).catch(()=>[]),
        fetch(`${base}/api/display/beerlist`).then(r=>r.json()),
        fetch(`${base}/api/display/ads`).then(r=>r.json()),
      ])
      setSettings(s)
      setSizes(sz)
      setTaps(bl)
      setAds(aa)
      // Resolve device if specified
      if (deviceId != null) {
        const list: Device[] = await fetch(`${base}/api/devices`).then(r=>r.json()).catch(()=>[])
        const d = list.find(x => x.id === deviceId) || null
        setDevice(d)
      } else {
        setDevice(null)
      }
    } catch {}
  }

  const columns = device?.beerColumns || settings?.beerColumns || 1
  const itemsPerColumn = device?.itemsPerColumn || 10

  useEffect(() => { loadAll() }, [])

  // Live updates: listen for server change events and reload
  useEffect(() => {
    let url: string | undefined = undefined
    if (mode === 'client' && remoteBase) url = remoteBase
    const sock: Socket = io(url, { transports: ['websocket'], reconnection: true })
    const onChanged = () => { loadAll() }
    sock.on('changed', onChanged)
    return () => { try { sock.off('changed', onChanged); sock.close() } catch {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, remoteBase])

  useEffect(() => {
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
  }, [settings?.rotationSec, paused])

  // Keep tap context so duplicates of the same beer on different taps are supported
  const tapBeers = useMemo(() => taps.filter(t => t.beer != null).map(t => ({ tapNumber: t.tapNumber, beer: t.beer as Beer })), [taps])

  function formatMoney(amountMinor: number, currency?: string): string {
    const cur = currency || settings?.currency || 'GBP'
    const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: cur })
    return formatter.format((amountMinor || 0) / 100)
  }

  // Build slides: beer pages then each ad image
  const beerPages: Array<Array<{ tapNumber: number; beer: Beer }>> = useMemo(() => {
    const perPage = device?.itemsPerColumn ? (columns * itemsPerColumn) : (settings?.itemsPerPage || 10)
    const pages: Array<Array<{ tapNumber: number; beer: Beer }>> = []
    for (let i = 0; i < tapBeers.length; i += perPage) pages.push(tapBeers.slice(i, i + perPage))
    return pages.length ? pages : [[]]
  }, [tapBeers, columns, itemsPerColumn, device?.itemsPerColumn, settings?.itemsPerPage])

  const slides = useMemo(() => {
    type Slide = { type: 'beer'|'ad'|'adpair'; data: any }
    const s: Slide[] = []
    beerPages.forEach(pg => s.push({ type: 'beer', data: pg }))
    // Sort ads by displayOrder then created order
    const adsSorted = ads.slice().sort((a,b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    for (let i = 0; i < adsSorted.length; i++) {
      const a = adsSorted[i]
      if (a.fullscreen) { s.push({ type: 'ad', data: a }); continue }
      const next = adsSorted[i+1]
      const canPair = (x: Ad) => (x.allowPair !== false) && !x.fullscreen
      const isPortrait = (x: Ad) => Number(x.height||0) > Number(x.width||0)
      if (next && canPair(a) && canPair(next) && (isPortrait(a) && isPortrait(next))) {
        s.push({ type: 'adpair', data: [a, next] })
        i++
        continue
      }
      s.push({ type: 'ad', data: a })
    }
    // Determine effective mode
    let modeEff: 'all'|'beer'|'ads' = 'all'
    if (device && device.displayMode !== 'inherit') modeEff = device.displayMode
    else modeEff = localDisplayMode
    const filtered = s.filter(sl => modeEff === 'all' ? true : (modeEff === 'beer' ? sl.type==='beer' : (sl.type==='ad' || sl.type==='adpair')))
    return filtered.length ? filtered : [{ type: 'beer', data: [] }]
  }, [beerPages, ads])

  const cur = slides[pageIdx % slides.length]
  const curIsAd = cur.type === 'ad' || cur.type === 'adpair'
  const curIsFullscreen = cur.type === 'ad' && (cur.data as Ad)?.fullscreen
  const footPadPx = ((settings?.showFooter !== false) && !curIsFullscreen) ? 96 : 24

  const contentBase = (mode==='client' && remoteBase) ? remoteBase : ''
  const bgUrl = settings?.backgroundPreset ? settings.backgroundPreset : (settings?.backgroundAssetId ? `${contentBase}/api/assets/${settings.backgroundAssetId}/content` : null)
  const logoUrl = settings?.logoAssetId ? `${contentBase}/api/assets/${settings.logoAssetId}/content` : null
  const effCellScale = (device?.cellScale ?? settings?.cellScale ?? 50)
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

  // Measure logo to add top padding when logo is at top
  const logoRef = useRef<HTMLDivElement | null>(null)
  const [logoBoxH, setLogoBoxH] = useState<number>(0)
  useEffect(() => {
    const measure = () => {
      if (logoRef.current) setLogoBoxH(Math.round(logoRef.current.getBoundingClientRect().height + 12))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [logoUrl, effLogoScale, effLogoPosition, effLogoPadX, effLogoPadY, settings?.logoBgEnabled, settings?.logoBgRounded, settings?.logoBgRadius])

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
      {/* Floating controls (auto-hide) */}
      <div className={`fixed top-3 right-3 z-50 transition-opacity ${controlsVisible ? 'opacity-100' : 'opacity-0'} pointer-events-auto flex items-center gap-2`}>
        <button onClick={()=>setPaused(p=>!p)} className="px-3 py-1.5 rounded bg-blue-600 text-white border border-blue-700 shadow dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
          {paused ? (
            // Play icon
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M8 5v14l11-7z"/></svg>
          ) : (
            // Pause icon
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
          )}
        </button>
        <button onClick={()=>{ setPageIdx(p=>p+1); setSecs(settings?.rotationSec ?? 90) }} className="px-3 py-1.5 rounded bg-blue-600 text-white border border-blue-700 shadow dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" aria-label="Next Page">
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
        <button onClick={() => setAdminOpen((v) => !v)} className="px-3 py-1.5 rounded bg-blue-600 text-white border border-blue-700 shadow dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
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
  {(() => {
        const adObj: Ad | null = cur.type === 'ad' ? (cur.data as Ad) : null
        const showLogo = !!logoUrl && (
          !curIsAd ? true : (
            curIsFullscreen ? (adObj?.requireLogo === true) : true
          )
        )
        return showLogo
      })() && (
        <div ref={logoRef} className={`fixed pointer-events-none ${logoPosClass}`}>
          <div style={logoContainerStyle} className="inline-block">
            <img src={logoUrl} alt="logo" style={{ width: Math.round(96 * (effLogoScale/100)) }} className="object-contain max-h-[20vh]" />
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
          onSelectServer={(url)=>{ localStorage.setItem('remoteServer', url); setRemoteBase(url); loadAll() }}
          localDisplayMode={localDisplayMode}
          setLocalDisplayMode={(v)=>{ setLocalDisplayMode(v); localStorage.setItem('localDisplayMode', v) }}
        
        />
      )}
      {mode==='client' && !remoteBase && (
        <div className="mb-4 p-3 rounded border border-yellow-700 bg-yellow-900/30 text-yellow-200 text-sm">
          No server selected. Open Admin → Server tab to choose or enter the main server URL.
        </div>
      )}
      {cur.type === 'beer' ? (
        <div style={{ paddingTop: effLogoPosition.startsWith('top') ? logoBoxH : 0 }}>
          {tapBeers.length === 0 ? (
            <div className="h-[80vh] flex items-center justify-center text-center">
              <div className="text-3xl font-semibold opacity-70">No beers are set yet</div>
            </div>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`, columnGap: `${effColumnGap}px` }}>
              {cur.data.map((row: { tapNumber: number; beer: Beer }, idx: number) => {
                // Slider-driven sizing: compute scale factor in [0.7 .. 2.2]
                const factor = 0.7 + (effCellScale/100) * 1.5
                const imgPx = Math.round(64 * factor)
                const titlePx = Math.round(20 * factor)
                const subPx = Math.round(14 * factor)
                const padY = Math.round(12 * factor)
                return (
                <div key={row.tapNumber} className={`flex items-center gap-4 border-b border-neutral-200/40`} style={{ paddingTop: padY, paddingBottom: padY }}>
                  <div className={`rounded-full bg-neutral-200 overflow-hidden flex items-center justify-center`} style={{ width: imgPx, height: imgPx }}>
                    {row.beer.badgeAssetId ? (
                      <img src={`${contentBase}/api/assets/${row.beer.badgeAssetId}/content`} alt="badge" className="object-contain w-full h-full" />
                    ) : (
                      <span className="text-sm opacity-60">No image</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-bold truncate flex items-center gap-2`} style={{ fontSize: titlePx }}>
                      <span className="opacity-70">{row.tapNumber} -</span>
                      <span className="truncate">{row.beer.name}</span>
                      {row.beer.colorHex && row.beer.colorHex !== '#00000000' && (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 512 512">
                          <title>Simple Pint Glass Icon</title>
                          {/* Glass outline */}
                          <path d="M128 64 h256 l-32 384 H160 L128 64 z"
                                fill="none" stroke="#000" strokeWidth={16} strokeLinejoin="round"/>

                          {/* Beer fill (change this colour programmatically) */}
                          <path id="beer-fill" d="M144 80 h224 l-28 352 H172 L144 80 z"
                                fill={row.beer.colorHex} stroke="none"/>

                          {/* Highlight strip */}
                          <path d="M320 80 h32 l-28 352 h-32 l28-352 z"
                                fill="#E6B800" stroke="none" opacity="0.5"/>

                          {/* Foam */}
                          <path d="M128 64
                                       c0 -24 24 -40 48 -40
                                       h160
                                       c24 0 48 16 48 40
                                       v16
                                       h-256
                                       v-16 z"
                                fill="#FFFFFF" stroke="#000" strokeWidth={16} strokeLinejoin="round"/>

                          {/* Base */}
                          <rect x="160" y="448" width="192" height="16" fill="#FFFFFF" stroke="#000" strokeWidth={8}/>
                        </svg>
                      )}
                    </div>
                    <div className={`truncate opacity-80`} style={{ fontSize: subPx }}>{row.beer.brewery}</div>
                    <div className={`truncate opacity-80`} style={{ fontSize: subPx }}>
                      <span>{row.beer.style}</span>
                      {row.beer.abv != null && <span className="font-semibold"> • {row.beer.abv.toFixed(1)}% ABV</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    {(() => {
                      const prices = (row.beer.prices || []).slice()
                      const defId = settings?.defaultSizeId ?? null
                      // sort by size volume descending, fallback to displayOrder
                      prices.sort((a,b) => ((b.size?.volumeMl ?? 0) - (a.size?.volumeMl ?? 0)) || ((b.size?.displayOrder ?? 0) - (a.size?.displayOrder ?? 0)))
                      let defIdx = defId ? prices.findIndex(p=>p.serveSizeId===defId) : -1
                      if (defIdx === -1 && prices.length) defIdx = 0
                      const items = prices.map((p, idx) => ({ p, isDefault: idx === defIdx }))
                      // move default to first
                      items.sort((a,b) => (a.isDefault === b.isDefault) ? 0 : (a.isDefault ? -1 : 1))
                      return (
                        <div className="flex flex-col items-end gap-0.5">
                          {items.map(({p,isDefault},i) => (
                            <div key={i} className={`${isDefault? 'font-semibold text-lg' : 'text-sm opacity-90'} whitespace-nowrap`}>
                              {formatMoney(p.amountMinor, p.currency)}{p.size?.name ? ` — ${p.size.name}` : ''}
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      ) : cur.type === 'ad' ? (
        <div className="h-full w-full flex items-center justify-center" style={{ 
          paddingTop: curIsFullscreen ? 0 : (effLogoPosition.startsWith('top') ? logoBoxH : '1.5rem'),
          paddingBottom: curIsFullscreen ? 0 : footPadPx,
          paddingLeft: curIsFullscreen ? 0 : '1.5rem',
          paddingRight: curIsFullscreen ? 0 : '1.5rem',
        }}>
          {(() => {
            const ad = cur.data as Ad
            const isPortrait = Number(ad.height || 0) > Number(ad.width || 0)
            const cls = curIsFullscreen
              ? (isPortrait ? 'h-full w-full object-contain' : 'h-full w-full object-cover')
              : 'max-h-full max-w-full object-contain'
            return <img src={`${contentBase}/api/assets/${ad.id}/content`} alt={ad.filename} className={cls} />
          })()}
        </div>
      ) : (
        <div className="h-full w-full grid grid-cols-2 gap-4 items-center justify-center" style={{ 
          paddingTop: effLogoPosition.startsWith('top') ? logoBoxH : '1.5rem',
          paddingBottom: footPadPx,
          paddingLeft: '1.5rem',
          paddingRight: '1.5rem',
        }}>
          {(cur.data as Ad[]).map((a, i) => (
            <div key={i} className="flex items-center justify-center">
              <img src={`${contentBase}/api/assets/${a.id}/content`} alt={a.filename} className="max-h-full max-w-full object-contain" />
            </div>
          ))}
        </div>
      )}
      {slides.length > 1 && (settings?.showFooter !== false) && !curIsFullscreen && (
        <div className="fixed inset-x-0 bottom-3 flex justify-center">
          <div className="px-7 py-2 rounded-full text-sm shadow bg-black/40 text-white dark:bg-neutral-800/80 dark:text-neutral-100 text-center flex flex-col items-center gap-1">
            <div className="flex items-center gap-3">
              <span>Page { (pageIdx % slides.length) + 1 } of { slides.length } • changes in {secs} seconds</span>
            </div>
            <div className="text-[10px] leading-tight opacity-80">© Not That California R&D</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  // Route: standalone admin on /admin
  const path = typeof window !== 'undefined' ? window.location.pathname : '/'
  if (path.startsWith('/admin')) return <AdminPage />
  // Default to display view; admin is an overlay toggle within Display
  return <Display />
}

// ----- Admin Overlay Components -----
function AdminOverlay({ isOpen, sizes, settings, onClose, onRefresh, mode, servers, remoteBase, onSelectServer, localDisplayMode, setLocalDisplayMode, localBeerColumns, setLocalBeerColumns, localItemsPerPage, setLocalItemsPerPage }: { isOpen: boolean; sizes: Size[]; settings: Settings|null; onClose: () => void; onRefresh: () => void; mode: 'server'|'client'; servers: Discovered[]; remoteBase: string|null; onSelectServer: (url:string)=>void; localDisplayMode: 'all'|'beer'|'ads'; setLocalDisplayMode: (v:'all'|'beer'|'ads')=>void; localBeerColumns: number; setLocalBeerColumns: (n:number)=>void; localItemsPerPage: number; setLocalItemsPerPage: (n:number)=>void }) {
  const [uiMode, setUiMode] = useState<'server'|'client'>(mode)
  const tabs: Array<{key: string; label: string}> = [
    { key: 'settings', label: 'Settings' },
    ...(uiMode==='server' ? [
      { key: 'style', label: 'Style' },
      { key: 'sizes', label: 'Sizes' },
      { key: 'beers', label: 'Beers' },
      { key: 'taps', label: 'Taps' },
      { key: 'media', label: 'Media' },
    ] as any : [])
  ]
  // Persist last-opened tab per session
  const [tab, setTab] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('adminLastTab') : null
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
        {tab === 'settings' && <SettingsPanel sizes={sizes} settings={settings} onRefresh={async()=>{ await onRefresh(); setUiMode((await fetch('/api/mode').then(r=>r.json()).catch(()=>({mode}))).mode) }} localDisplayMode={localDisplayMode} setLocalDisplayMode={setLocalDisplayMode} servers={servers} remoteBase={remoteBase} onSelectServer={onSelectServer} onLocalModeChange={(m)=>{ setUiMode(m); }} />}
        {uiMode==='server' && tab === 'style' && <StylePanel settings={settings} onRefresh={onRefresh} />}
        {uiMode==='server' && tab === 'sizes' && <SizesPanel onRefresh={onRefresh} />}
        {uiMode==='server' && tab === 'beers' && <BeersPanel sizes={sizes} onRefresh={onRefresh} />}
        {uiMode==='server' && tab === 'taps' && <TapsPanel onRefresh={onRefresh} />}
        {uiMode==='server' && tab === 'media' && <MediaPanel onRefresh={onRefresh} />}
        {/* Devices tab removed */}
      </div>
    </div>
  )
}

// Standalone full-page Admin view (for /admin)
function AdminPage() {
  const [uiMode, setUiMode] = useState<'server'|'client'>('server')
  const [sizes, setSizes] = useState<Size[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [servers, setServers] = useState<Discovered[]>([])
  const [remoteBase, setRemoteBase] = useState<string | null>(null)
  const [localDisplayMode, setLocalDisplayMode] = useState<'all'|'beer'|'ads'>(()=> (localStorage.getItem('localDisplayMode') as any) || 'all')

  const [tab, setTab] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('adminLastTab') : null
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
      { key: 'media', label: 'Media' },
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
      {tab === 'settings' && <SettingsPanel sizes={sizes} settings={settings} onRefresh={loadAll} localDisplayMode={localDisplayMode} setLocalDisplayMode={(v)=>{ setLocalDisplayMode(v); localStorage.setItem('localDisplayMode', v) }} servers={servers} remoteBase={remoteBase} onSelectServer={(url)=>{ localStorage.setItem('remoteServer', url); setRemoteBase(url); loadAll() }} onLocalModeChange={(m)=>{ setUiMode(m) }} />}
      {uiMode==='server' && tab === 'style' && <StylePanel settings={settings} onRefresh={loadAll} />}
      {uiMode==='server' && tab === 'sizes' && <SizesPanel onRefresh={loadAll} />}
      {uiMode==='server' && tab === 'beers' && <BeersPanel sizes={sizes} onRefresh={loadAll} />}
      {uiMode==='server' && tab === 'taps' && <TapsPanel onRefresh={loadAll} />}
      {uiMode==='server' && tab === 'media' && <MediaPanel onRefresh={loadAll} />}
    </div>
  )
}

function ServerPanel({ servers, remoteBase, onSelectServer }: { servers: Discovered[]; remoteBase: string|null; onSelectServer: (url:string)=>void }) {
  const [sel, setSel] = useState<string>(remoteBase || '')
  const [manual, setManual] = useState<string>(remoteBase || '')
  const options = servers.map(s => ({ url: `http://${s.host}:${s.port}`, label: `${s.name} (${s.host}:${s.port})` }))
  return (
      <div className="space-y-6">
      <div>
        <label className="block text-sm mb-1">Select Main Server</label>
        <select value={sel} onChange={(e)=>setSel(e.target.value)} className="w-full md:w-2/3 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
          <option value="">(none)</option>
          {options.map(o => <option key={o.url} value={o.url}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm mb-1">Or enter server URL (http://host:port)</label>
        <input placeholder="http://192.168.1.10:3000" value={manual} onChange={(e)=>setManual(e.target.value)} className="w-full md:w-2/3 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
      </div>
      <LoadingButton onClick={async()=>{ const url = sel || manual; if (url) onSelectServer(url) }} className="px-3 py-1.5 rounded bg-green-700 text-white">Save</LoadingButton>
      <div className="text-xs opacity-70">This client will fetch data from the selected main server.</div>
    </div>
  )
}

function StylePanel({ settings, onRefresh }: { settings: Settings|null; onRefresh: () => void }) {
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
  useEffect(()=>{ if (settings) { setTheme(settings.themeMode); setLogoPreview(settings.logoAssetId?`/api/assets/${settings.logoAssetId}/content`:null); setBgPreview(settings.backgroundAssetId?`/api/assets/${settings.backgroundAssetId}/content`:null); setLocalCellScale((settings as any).cellScale ?? 50); setLocalColumnGap((settings as any).columnGap ?? 40); setLocalBeerColumns((settings as any).beerColumns ?? 1); setLocalItemsPerPage((settings as any).itemsPerPage ?? 10); setLocalLogoPosition(((settings as any).logoPosition as any) ?? 'top-center'); setLocalLogoScale((settings as any).logoScale ?? 100); setLocalBgPosition(((settings as any).bgPosition as any) ?? 'center'); setLocalBgScale((settings as any).bgScale ?? 100); setBgPresetSel(((settings as any)?.backgroundPreset as string) ?? 'custom') } },[settings])
  useEffect(()=>{ if (settings) { setLogoBgEnabled((settings as any).logoBgEnabled ?? false); setLogoBgColor((settings as any).logoBgColor ?? '#000000'); setLogoBgRounded((settings as any).logoBgRounded ?? false); setLogoBgRadius((settings as any).logoBgRadius ?? 15); setLocalBgOpacity((settings as any).bgOpacity ?? 100); setLocalPageBgColor((settings as any).pageBgColor ?? '#000000'); setShowFooter((settings as any).showFooter ?? true) } }, [settings])
  useEffect(()=>{ fetch('/api/backgrounds').then(r=>r.json()).then(setBgPresets).catch(()=>setBgPresets([])) }, [])
  useEffect(()=>{ if (settings) { setLocalLogoPadX((settings as any).logoPadX ?? 8); setLocalLogoPadY((settings as any).logoPadY ?? 8) } }, [settings])

  const saveTheme = async () => {
    await fetch('/api/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
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
      cellScale: localCellScale,
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
      beerColumns: localBeerColumns,
      itemsPerPage: localItemsPerPage,
    }) })
    await onRefresh()
  }

  // Auto-save on change (debounced)
  const saveTimer = useRef<any>(null)
  useEffect(() => {
    if (!settings) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { saveTheme() }, 600)
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }
  }, [theme, localCellScale, localColumnGap, localLogoPosition, localLogoScale, localBgPosition, localBgScale, logoBgEnabled, logoBgColor, logoBgRounded, logoBgRadius, localBgOpacity, localBeerColumns, localItemsPerPage, localLogoPadX, localLogoPadY, localPageBgColor, bgPresetSel, showFooter])

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <label className="flex items-center gap-2"><input type="checkbox" checked={showFooter} onChange={e=>setShowFooter(e.target.checked)} /> Show bottom page counter</label>
        
      </div>

      <div>
        <label className="block text-sm mb-1">Beer Cell Scale (default)</label>
        <input type="range" min={0} max={100} value={localCellScale} onChange={e=>setLocalCellScale(Number(e.target.value))} className="w-60" />
        <div className="text-xs opacity-70 mt-1">{localCellScale}% — controls image and typography scale.</div>
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

      <div>
        <label className="block text-sm mb-1">Column Gap</label>
        <input type="range" min={0} max={80} value={localColumnGap} onChange={e=>setLocalColumnGap(Number(e.target.value))} className="w-60" />
        <div className="text-xs opacity-70 mt-1">{localColumnGap}px — horizontal spacing between columns.</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm mb-1">Beer Columns (default)</label>
          <input type="number" min={1} max={6} value={localBeerColumns} onChange={e=>setLocalBeerColumns(Math.max(1, Math.min(6, Number(e.target.value)||1)))} className="w-40 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
        </div>
        <div>
          <label className="block text-sm mb-1">Items per Page (default)</label>
          <input type="number" min={1} max={500} value={localItemsPerPage} onChange={e=>setLocalItemsPerPage(Math.max(1, Math.min(500, Number(e.target.value)||1)))} className="w-40 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
        </div>
      </div>
      {/* Auto-save active; manual Save not required */}
    </div>
  )
}

function SettingsPanel({ sizes, settings, onRefresh, localDisplayMode, setLocalDisplayMode, localBeerColumns, setLocalBeerColumns, localItemsPerPage, setLocalItemsPerPage, servers, remoteBase, onSelectServer, onLocalModeChange }: { sizes: Size[]; settings: Settings|null; onRefresh: () => void; localDisplayMode: 'all'|'beer'|'ads'; setLocalDisplayMode: (v:'all'|'beer'|'ads')=>void; localBeerColumns: number; setLocalBeerColumns: (n:number)=>void; localItemsPerPage: number; setLocalItemsPerPage: (n:number)=>void; servers: Discovered[]; remoteBase: string|null; onSelectServer: (url:string)=>void; onLocalModeChange: (m:'server'|'client')=>void }) {
  const [rotation, setRotation] = useState<number>(settings?.rotationSec ?? 90)
  const [defaultSizeId, setDefaultSizeId] = useState<number | ''>(settings?.defaultSizeId ?? '')
  const [modeSel, setModeSel] = useState<'server'|'client'>(settings?.mode as any || 'server')
  const [selServer, setSelServer] = useState<string>(remoteBase || '')
  const [manualServer, setManualServer] = useState<string>(remoteBase || '')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (settings) { setRotation(settings.rotationSec); setDefaultSizeId(settings.defaultSizeId ?? ''); setModeSel((settings as any).mode || 'server') } }, [settings])
  const save = async () => {
    if (saving) return
    setSaving(true)
    const minDelay = new Promise<void>(res=>setTimeout(res,1000))
    await Promise.all([
      fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ rotationSec: Number(rotation), defaultSizeId: defaultSizeId || null, themeMode: 'dark', defaultDisplayMode: 'all', currency: settings?.currency || 'GBP', locale: settings?.locale || 'en-GB', mode: modeSel }) }),
      minDelay
    ])
    if (modeSel==='client') {
      const url = selServer || manualServer
      if (url) onSelectServer(url)
    }
    onLocalModeChange(modeSel)
    await onRefresh()
    setSaving(false)
  }
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm mb-1">Rotation (seconds)</label>
        <input type="number" min={5} max={3600} value={rotation} onChange={e=>setRotation(Number(e.target.value))} className="w-40 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
      </div>
      <div>
        <label className="block text-sm mb-1">Default Display Size</label>
        <select value={defaultSizeId} onChange={e=>setDefaultSizeId(e.target.value?Number(e.target.value):'')} className="w-60 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
          <option value="">(none)</option>
          {sizes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      
      <div>
        <label className="block text-sm mb-1">Mode</label>
        <select value={modeSel} onChange={e=>{ const v = e.target.value as 'server'|'client'; setModeSel(v); onLocalModeChange(v) }} className="w-60 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
          <option value="server">Server (Main)</option>
          <option value="client">Client</option>
        </select>
      </div>
      {modeSel==='client' && (
        <div className="space-y-2">
          <div>
            <label className="block text-sm mb-1">Select Main Server (discovered)</label>
            <select value={selServer} onChange={e=>setSelServer(e.target.value)} className="w-full md:w-2/3 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
              <option value="">(none)</option>
              {servers.map(s => {
                const url = `http://${s.host}:${s.port}`
                return <option key={url} value={url}>{s.name} ({s.host}:{s.port})</option>
              })}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Or enter server URL (http://host:port)</label>
            <input placeholder="http://192.168.1.10:3000" value={manualServer} onChange={(e)=>setManualServer(e.target.value)} className="w-full md:w-2/3 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
          </div>
        </div>
      )}
      <div>
        <label className="block text-sm mb-1">Local Display Content (fallback)</label>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" checked={localDisplayMode !== 'ads'} onChange={(e)=> setLocalDisplayMode(e.target.checked ? (localDisplayMode==='ads'?'all':'beer') : 'ads')} /> Beers</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={localDisplayMode !== 'beer'} onChange={(e)=> setLocalDisplayMode(e.target.checked ? (localDisplayMode==='beer'?'all':'ads') : 'beer')} /> Media</label>
          <span className="opacity-70">(When a device's mode is Inherit)</span>
        </div>
      </div>
      <button onClick={save} disabled={saving} className={`px-3 py-1.5 rounded bg-green-700 inline-flex items-center gap-2 ${saving?'opacity-80 cursor-not-allowed':''}`}>
        {saving && <span className="inline-block h-4 w-4 border-2 border-neutral-300 border-t-transparent rounded-full animate-spin" />}
        <span>Save</span>
      </button>
    </div>
  )
}

function SizesPanel({ onRefresh }: { onRefresh: () => void }) {
  const [list, setList] = useState<Size[]>([])
  const [name, setName] = useState('')
  const [ml, setMl] = useState<number>(568)
  useEffect(()=>{ fetch('/api/sizes').then(r=>r.json()).then(setList)},[])
  const create = async () => {
    await fetch('/api/sizes', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, volumeMl: Number(ml) }) })
    setName(''); setMl(568); const fresh = await fetch('/api/sizes').then(r=>r.json()); setList(fresh); await onRefresh()
  }
  const del = async (id:number) => { await fetch(`/api/sizes/${id}`, { method:'DELETE' }); const fresh = await fetch('/api/sizes').then(r=>r.json()); setList(fresh); await onRefresh() }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <h3 className="font-semibold mb-2">Existing Sizes</h3>
        <ul className="space-y-1 text-sm">
          {list.map(s => (
            <li key={s.id} className="flex items-center justify-between border border-neutral-800 rounded px-2 py-1">
              <span>{s.name} — {s.volumeMl}ml</span>
              <LoadingButton onClick={()=>del(s.id)} className="text-red-400 hover:text-red-300">Delete</LoadingButton>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-semibold mb-2">Add Size</h3>
        <div className="space-y-2 text-sm">
          <input placeholder="Name (e.g., Pint)" value={name} onChange={e=>setName(e.target.value)} className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
          <input type="number" placeholder="Volume ml" value={ml} onChange={e=>setMl(Number(e.target.value))} className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
          <LoadingButton onClick={create} className="px-3 py-1.5 rounded bg-green-700">Create</LoadingButton>
        </div>
      </div>
    </div>
  )
}

function BeersPanel({ sizes, onRefresh }: { sizes: Size[]; onRefresh: () => void }) {
  const [beers, setBeers] = useState<Beer[]>([])
  const [brewery, setBrewery] = useState<string>('')
  const [form, setForm] = useState<{ name:string; brewery:string; style:string; abv?:number; isGuest:boolean; prices: Record<number, number>; colorHex?: string|null }>({ name:'', brewery:'', style:'', abv: undefined, isGuest:false, prices:{}, colorHex: null })
  const [file, setFile] = useState<File|null>(null)
  const [breweryOpen, setBreweryOpen] = useState(false)
  const breweryList = useMemo(() => Array.from(new Set(beers.map(b=>b.brewery).filter(Boolean))).sort((a,b)=>a.localeCompare(b)), [beers])
  const [editingId, setEditingId] = useState<number|null>(null)
  useEffect(()=>{ fetch('/api/beers').then(r=>r.json()).then(setBeers)},[])
  const submit = async () => {
    let badgeAssetId: number | undefined
    if (file) { const fd=new FormData(); fd.append('file', file); const up=await fetch('/api/upload',{method:'POST',body:fd}); if(up.ok){ const a=await up.json(); badgeAssetId=a.id } }
    if (editingId==null) {
      const res = await fetch('/api/beers', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name:form.name, brewery:form.brewery, style:form.style, abv:form.abv, isGuest:form.isGuest, colorHex: form.colorHex || undefined, prefillPrices:false, badgeAssetId }) })
      if (!res.ok) { alert('Failed to create beer'); return }
      const b = await res.json(); if (!b?.id) return
      const prices = Object.entries(form.prices).map(([sid, amt]) => ({ serveSizeId:Number(sid), amountMinor: Math.round(Number(amt)*100), currency:'GBP' }))
      if (prices.length) await fetch(`/api/beers/${b.id}/prices`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prices }) })
    } else {
      await fetch(`/api/beers/${editingId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name:form.name, brewery:form.brewery, style:form.style, abv:form.abv, isGuest:form.isGuest, colorHex: form.colorHex || undefined, ...(badgeAssetId?{badgeAssetId}:{}) }) })
      const prices = Object.entries(form.prices).map(([sid, amt]) => ({ serveSizeId:Number(sid), amountMinor: Math.round(Number(amt)*100), currency:'GBP' }))
      if (prices.length) await fetch(`/api/beers/${editingId}/prices`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prices }) })
    }
    setEditingId(null); setForm({ name:'', brewery:'', style:'', abv: undefined, isGuest:false, prices:{}, colorHex: null }); setFile(null)
    const fresh = await fetch('/api/beers').then(r=>r.json()); setBeers(fresh); await onRefresh()
  }
  const archive = async (id:number) => { await fetch(`/api/beers/${id}`, { method:'DELETE' }); const fresh = await fetch('/api/beers').then(r=>r.json()); setBeers(fresh); await onRefresh() }
  const openEdit = async (id:number) => { const b=await fetch(`/api/beers/${id}`).then(r=>r.json()); setEditingId(id); setForm({ name:b.name, brewery:b.brewery, style:b.style, abv:b.abv, isGuest:b.isGuest, prices:Object.fromEntries((b.prices||[]).map((p:any)=>[p.serveSizeId,(p.amountMinor||0)/100])), colorHex: b.colorHex || null }); setFile(null) }
  const cancel = () => { setEditingId(null); setForm({ name:'', brewery:'', style:'', abv: undefined, isGuest:false, prices:{}, colorHex: null }); setFile(null) }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h3 className="font-semibold mb-2">Beers</h3>
        <div className="mb-2 flex items-center gap-2 text-sm">
          <label className="opacity-80">Brewery:</label>
          <select value={brewery} onChange={e=>setBrewery(e.target.value)} className="px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
            <option value="">All breweries</option>
            {Array.from(new Set(beers.map(b=>b.brewery).filter(Boolean))).sort((a,b)=>a.localeCompare(b)).map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <ul className="space-y-1 text-sm">
          {beers
            .filter(b => !brewery || b.brewery === brewery)
            .slice()
            .sort((a,b)=>a.name.localeCompare(b.name))
            .map(b => (
            <li key={b.id} className="flex items-center justify-between border rounded px-2 py-1 gap-2 border-neutral-300 dark:border-neutral-800">
              <span className="truncate">{b.name} — {b.brewery} • {b.style}{b.abv?` • ${b.abv}%`:''}</span>
              <div className="flex gap-2">
                <LoadingButton onClick={()=>openEdit(b.id)} className="px-2 py-0.5 rounded bg-blue-600 text-white border border-blue-700 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">Edit</LoadingButton>
                <LoadingButton onClick={()=>archive(b.id)} className="px-2 py-0.5 rounded bg-amber-600 text-white border border-amber-700 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">Archive</LoadingButton>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-semibold mb-2">{editingId==null?'Add Beer':'Edit Beer'}</h3>
        <div className="space-y-4 text-sm">
          <input placeholder="Name" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
          <div className="relative">
            <input
              placeholder="Brewery"
              value={form.brewery}
              onChange={e=>{ setForm({...form, brewery:e.target.value}); setBreweryOpen(true) }}
              onFocus={()=>setBreweryOpen(true)}
              onBlur={()=>setTimeout(()=>setBreweryOpen(false), 150)}
              className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700"
            />
            {breweryOpen && (form.brewery||'').length > 0 && (
              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow">
                {breweryList.filter(n => n.toLowerCase().includes((form.brewery||'').toLowerCase())).slice(0,10).map(name => (
                  <div key={name}
                       onMouseDown={(e)=>{ e.preventDefault(); setForm({...form, brewery: name}); setBreweryOpen(false) }}
                       className="px-2 py-1 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    {name}
                  </div>
                ))}
                {breweryList.filter(n => n.toLowerCase().includes((form.brewery||'').toLowerCase())).length===0 && (
                  <div className="px-2 py-1 opacity-60 text-sm">No matches</div>
                )}
              </div>
            )}
          </div>
          <input placeholder="Style" value={form.style} onChange={e=>setForm({...form, style:e.target.value})} className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
          <input type="number" step="0.1" placeholder="ABV" value={form.abv ?? ''} onChange={e=>setForm({...form, abv: e.target.value?Number(e.target.value):undefined})} className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isGuest} onChange={e=>setForm({...form, isGuest:e.target.checked})} /> Guest Beer</label>
          <div className="border rounded p-2 border-neutral-300 dark:border-neutral-800">
            <div className="font-semibold mb-1">Prices</div>
            {sizes.map(s => (
              <div key={s.id} className="flex items-center gap-2 mb-1">
                <label className="w-32 text-sm">{s.name}</label>
                <input type="number" step="0.01" placeholder="£" value={form.prices[s.id] ? String(form.prices[s.id]) : ''} onChange={e => setForm({...form, prices: { ...form.prices, [s.id]: Number(e.target.value || 0) }})} className="w-40 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
              </div>
            ))}
          </div>
          <div className="border rounded p-2 border-neutral-300 dark:border-neutral-800">
            <div className="font-semibold mb-1">Beer Colour (for icon)</div>
            <div className="flex items-center gap-3">
              <input type="color" value={form.colorHex || '#000000'} onChange={e=>setForm({...form, colorHex: e.target.value})} className="h-7 w-10 p-0 bg-transparent border-2 border-black dark:border-white rounded" />
              <button onClick={()=>setForm({...form, colorHex: null})} className="px-2 py-1 rounded bg-neutral-700 text-white">Clear (transparent)</button>
            </div>
            <div className="text-xs opacity-70 mt-1">If transparent, the beer icon is hidden.</div>
          </div>
          <div className="border rounded p-2 border-neutral-300 dark:border-neutral-800">
            <div className="font-semibold mb-1">Badge Image {editingId==null?'(optional)':'(replace optional)'}</div>
            <input type="file" accept="image/jpeg,image/png" onChange={e=>{ setFile(e.target.files?.[0] ?? null); (e.target as HTMLInputElement).value='' }} className="block w-full text-sm text-neutral-900 dark:text-neutral-100 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 dark:file:bg-neutral-700 dark:hover:file:bg-neutral-600" />
          </div>
          <div className="flex gap-2">
            <LoadingButton onClick={submit} className="px-3 py-1.5 rounded bg-green-700 text-white">{editingId==null?'Create':'Save'}</LoadingButton>
            {editingId!=null && <button onClick={cancel} className="px-3 py-1.5 rounded bg-neutral-700 text-white">Cancel</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

function TapsPanel({ onRefresh }: { onRefresh: () => void }) {
  const [taps, setTaps] = useState<TapBeer[]>([])
  const [tapCount, setTapCount] = useState<number>(0)
  const [allBeers, setAllBeers] = useState<Beer[]>([])
  const [queries, setQueries] = useState<Record<number, string>>({})
  const [focusTap, setFocusTap] = useState<number | null>(null)

  const refreshTaps = async () => { const t = await fetch('/api/taps').then(r=>r.json()); setTaps(t); setTapCount(t.length); await onRefresh() }
  useEffect(()=>{ refreshTaps(); fetch('/api/beers').then(r=>r.json()).then(setAllBeers) },[])

  const assign = async (number:number, beerId:number) => { await fetch(`/api/taps/${number}/assign`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ beerId }) }); setQueries(q=>({ ...q, [number]: '' })); await refreshTaps() }
  const clearTap = async (number:number) => { await fetch(`/api/taps/${number}/assign`, { method:'DELETE' }); setQueries(q=>({ ...q, [number]: '' })); await refreshTaps() }
  const setStatus = async (number:number, status:string) => { await fetch(`/api/taps/${number}/status`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status }) }); await refreshTaps() }
  const saveTapCount = async () => { await fetch('/api/taps/config', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ count: tapCount }) }); await refreshTaps() }

  const getSuggestions = (tapNumber:number) => {
    const q = (queries[tapNumber] || '').toLowerCase()
    let list = allBeers.filter(b=>b && b.id)
    if (q) list = list.filter(b => (b.name||'').toLowerCase().includes(q) || (b.brewery||'').toLowerCase().includes(q) || (b.style||'').toLowerCase().includes(q))
    return list.slice(0, 10)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <label className="text-sm">Number of taps</label>
        <input type="number" min={0} value={tapCount} onChange={(e)=>setTapCount(Number(e.target.value))} className="w-24 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
        <LoadingButton onClick={saveTapCount} className="px-3 py-1.5 rounded bg-green-700">Save</LoadingButton>
      </div>
      <div className="space-y-2">
        {taps.map(t => (
          <div key={t.tapNumber} className="border rounded p-2 text-sm border-neutral-300 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Tap {t.tapNumber}</div>
              <div className="flex gap-2">
                <LoadingButton onClick={()=>setStatus(t.tapNumber,'kicked')} className="px-2 py-0.5 rounded bg-neutral-200 text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">Kicked</LoadingButton>
                <LoadingButton onClick={()=>clearTap(t.tapNumber)} className="px-2 py-0.5 rounded bg-neutral-200 text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">Clear</LoadingButton>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1">
                <input
                  placeholder={t.beer ? `${t.beer.name} — ${t.beer.brewery}` : 'Assign beer...'}
                  value={queries[t.tapNumber] || ''}
                  onChange={(e)=>setQueries(q=>({ ...q, [t.tapNumber]: e.target.value }))}
                  onFocus={()=>setFocusTap(t.tapNumber)}
                  onBlur={()=>setTimeout(()=>setFocusTap(s=> (s===t.tapNumber ? null : s)), 150)}
                  className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700"
                />
                {(focusTap===t.tapNumber) && (
                  <div className="mt-1 max-h-48 overflow-auto rounded border border-neutral-300 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                    {getSuggestions(t.tapNumber).map(b => (
                      <button key={`${t.tapNumber}-${b.id}`} onMouseDown={(e)=>e.preventDefault()} onClick={()=>assign(t.tapNumber, b.id)} className="block w-full text-left px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                        {b.name} — {b.brewery}
                      </button>
                    ))}
                    {getSuggestions(t.tapNumber).length === 0 && (
                      <div className="px-2 py-1 opacity-60">No matches</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MediaPanel({ onRefresh }: { onRefresh: () => void }) {
  const [assets, setAssets] = useState<Ad[]>([])
  useEffect(()=>{ fetch('/api/assets').then(r=>r.json()).then(setAssets) },[])
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if(!file) return
    const fd = new FormData(); fd.append('file', file)
    await fetch('/api/upload', { method:'POST', body: fd })
    ;(e.target as HTMLInputElement).value = ''
    const list = await fetch('/api/assets').then(r=>r.json()); setAssets(list); await onRefresh()
  }
  const remove = async (id:number) => { await fetch(`/api/assets/${id}`, { method:'DELETE' }); const list = await fetch('/api/assets').then(r=>r.json()); setAssets(list); await onRefresh() }
  const update = async (a: Ad, patch: Partial<Ad>) => {
    const res = await fetch(`/api/assets/${a.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ allowPair: patch.allowPair, fullscreen: patch.fullscreen }) })
    if (res.ok) {
      const list = await fetch('/api/assets').then(r=>r.json()); setAssets(list); await onRefresh()
    }
  }
  const onDragStart = (e: React.DragEvent<HTMLDivElement>, id:number) => { e.dataTransfer.setData('text/plain', String(id)) }
  const onDragOver = (e: React.DragEvent) => { e.preventDefault() }
  const onDrop = async (e: React.DragEvent<HTMLDivElement>, targetId:number) => {
    e.preventDefault()
    const srcId = Number(e.dataTransfer.getData('text/plain'))
    if (!srcId || srcId === targetId) return
    const order = assets.map(a=>a.id)
    const from = order.indexOf(srcId)
    const to = order.indexOf(targetId)
    if (from<0 || to<0) return
    order.splice(to, 0, order.splice(from,1)[0])
    const reordered = order.map(id => assets.find(a=>a.id===id)!).filter(Boolean) as Ad[]
    setAssets(reordered)
    await fetch('/api/assets/order', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids: order }) })
    await onRefresh()
  }
  return (
    <div className="space-y-6">
      <div className="border border-neutral-300 dark:border-neutral-800 rounded p-3">
        <div className="font-semibold mb-1">Upload Media</div>
        <div className="text-xs opacity-80 mb-2">Use for adverts, posters, offers, and other promotional images. JPG/PNG up to 50MB.</div>
        <input type="file" accept="image/jpeg,image/png" onChange={upload} className="block w-full text-sm text-neutral-900 dark:text-neutral-100 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 dark:file:bg-neutral-700 dark:hover:file:bg-neutral-600" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {assets.map(a => (
          <div key={a.id} className="border rounded p-2 border-neutral-300 dark:border-neutral-800" draggable onDragStart={(e)=>onDragStart(e,a.id)} onDragOver={onDragOver} onDrop={(e)=>onDrop(e,a.id)}>
            <img src={`/api/assets/${a.id}/content`} alt={a.filename} className="w-full h-32 object-contain bg-neutral-100 dark:bg-neutral-800" />
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="truncate" title={a.filename}>{a.filename}</span>
              <LoadingButton onClick={()=>remove(a.id)} className="px-2 py-0.5 rounded bg-red-600 text-white">Delete</LoadingButton>
            </div>
            <div className="mt-2 text-xs space-y-1">
              <label className="flex items-center gap-2"><input type="checkbox" checked={a.allowPair !== false} onChange={e=>update(a, { allowPair: e.target.checked })} /> Allow pairing</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!a.fullscreen} onChange={e=>update(a, { fullscreen: e.target.checked })} /> Fullscreen (hide logo/footer)</label>
                          </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DevicesPanel({ onRefresh }: { onRefresh: () => void }) {
  const [devices, setDevices] = useState<Device[]>([])
  useEffect(()=>{ fetch('/api/devices').then(r=>r.json()).then(setDevices) },[])
  const update = (id:number, patch: Partial<Device>) => {
    setDevices(prev => prev.map(d => d.id===id ? { ...d, ...patch } : d))
  }
  const save = async (d: Device) => {
    await fetch(`/api/devices/${d.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
      displayMode: d.displayMode,
      beerColumns: d.beerColumns,
      itemsPerColumn: d.itemsPerColumn,
      // style overrides
      cellScale: (d as any).cellScale ?? null,
      columnGap: (d as any).columnGap ?? null,
      logoPosition: (d as any).logoPosition ?? null,
      logoScale: (d as any).logoScale ?? null,
      bgPosition: (d as any).bgPosition ?? null,
      bgScale: (d as any).bgScale ?? null,
    }) })
    await onRefresh()
  }
  return (
    <div className="space-y-3">
      {devices.map(d => (
        <div key={d.id} className="border rounded p-3 text-sm flex flex-col gap-3 border-neutral-300 dark:border-neutral-800">
          <div className="font-semibold">{d.name} (#{d.id})</div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1 text-xs">
              Mode:
              <select value={d.displayMode} onChange={e=>update(d.id, { displayMode: e.target.value as any })} className="px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
                <option value="inherit">Inherit</option>
                <option value="all">All</option>
                <option value="beer">Beers only</option>
                <option value="ads">Media only</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-xs">Columns
              <input type="number" min={1} max={4} value={d.beerColumns} onChange={e=>update(d.id,{ beerColumns: Number(e.target.value) })} className="w-16 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
            </label>
            <label className="flex items-center gap-1 text-xs">Items/Col
              <input type="number" min={1} max={30} value={d.itemsPerColumn} onChange={e=>update(d.id,{ itemsPerColumn: Number(e.target.value) })} className="w-20 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1 text-xs">Cell scale
                <input type="range" min={0} max={100} value={(d as any).cellScale ?? ''} onChange={e=>update(d.id, { cellScale: Number(e.target.value) as any })} />
                <button onClick={()=>update(d.id,{ cellScale: null as any })} className="px-2 py-0.5 rounded bg-neutral-200 text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">Inherit</button>
              </label>
              <label className="flex items-center gap-1 text-xs">Column gap
                <input type="number" min={0} max={200} value={(d as any).columnGap ?? ''} onChange={e=>update(d.id, { columnGap: Number(e.target.value) as any })} className="w-20 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
                <button onClick={()=>update(d.id,{ columnGap: null as any })} className="px-2 py-0.5 rounded bg-neutral-200 text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">Inherit</button>
              </label>
              <label className="flex items-center gap-1 text-xs">Logo pos
                <select value={(d as any).logoPosition ?? ''} onChange={e=>update(d.id,{ logoPosition: (e.target.value||null) as any })} className="px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
                  <option value="">(inherit)</option>
                  <option value="top-left">Top Left</option>
                  <option value="top-right">Top Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="bottom-right">Bottom Right</option>
                </select>
              </label>
              <label className="flex items-center gap-1 text-xs">Logo size
                <input type="number" min={10} max={300} value={(d as any).logoScale ?? ''} onChange={e=>update(d.id,{ logoScale: Number(e.target.value) as any })} className="w-20 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
                <button onClick={()=>update(d.id,{ logoScale: null as any })} className="px-2 py-0.5 rounded bg-neutral-200 text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">Inherit</button>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1 text-xs">BG pos
                <select value={(d as any).bgPosition ?? ''} onChange={e=>update(d.id,{ bgPosition: (e.target.value||null) as any })} className="px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
                  <option value="">(inherit)</option>
                  <option value="center">Center</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label className="flex items-center gap-1 text-xs">BG size
                <input type="number" min={50} max={300} value={(d as any).bgScale ?? ''} onChange={e=>update(d.id,{ bgScale: Number(e.target.value) as any })} className="w-20 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
                <button onClick={()=>update(d.id,{ bgScale: null as any })} className="px-2 py-0.5 rounded bg-neutral-200 text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">Inherit</button>
              </label>
            </div>
          </div>
          <div>
            <LoadingButton onClick={()=>save(d)} className="px-3 py-1.5 rounded bg-green-700">Save</LoadingButton>
          </div>
        </div>
      ))}
    </div>
  )
}

  // Fetch background presets (StylePanel scope)
  // Note: runs once when StylePanel mounts
