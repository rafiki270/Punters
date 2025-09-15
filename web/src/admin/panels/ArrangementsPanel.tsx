import React from 'react'
import { io, Socket } from 'socket.io-client'
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { snapCenterToCursor, restrictToWindowEdges } from '@dnd-kit/modifiers'

type DisplayClient = { id: string; n: number; label?: string; ua?: string }

export default function ArrangementsPanel() {
  const [clients, setClients] = React.useState<DisplayClient[]>([])
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [contentById, setContentById] = React.useState<Record<string, { showBeer: boolean; showDrinks: boolean; showMedia: boolean }>>({})
  const [syncing, setSyncing] = React.useState(false)
  const [adminUrl, setAdminUrl] = React.useState<string>('')
  const END_ZONE_ID = '__end_zone__'

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const r = await fetch('/api/clients/displays'); const d = await r.json();
        if (!cancelled) {
          setClients(Array.isArray(d)?d:[])
          // derive content map
          const map: any = {}
          ;(Array.isArray(d)?d:[]).forEach((c:any)=>{ map[c.id] = { showBeer: !!c.showBeer, showDrinks: !!c.showDrinks, showMedia: !!c.showMedia } })
          setContentById(map)
        }
      } catch { if (!cancelled) setClients([]) }
    }
    load();
    // socket to receive admin updates
    let sock: Socket | null = null
    try { sock = io('', { path:'/socket.io' }); sock.on('admin_changed', ()=>{ load() }) } catch {}
    return () => { cancelled = true; try { sock?.off('admin_changed'); sock?.disconnect() } catch {} }
  }, [])

  // Compute a reachable Admin URL using server-reported mDNS/hostname
  React.useEffect(() => {
    const setup = async () => {
      try {
        const info = await fetch('/api/ip').then(r=>r.json()).catch(()=>null as any)
        const proto = (typeof window !== 'undefined' ? window.location.protocol : 'http:')
        const isHttps = proto === 'https:'
        const portRaw = (typeof window !== 'undefined' ? window.location.port : '')
        const portNum = portRaw ? Number(portRaw) : (isHttps ? 443 : 80)
        const portLabel = (portNum && portNum !== 80 && portNum !== 443) ? `:${portNum}` : ''
        const host = (info?.mdnsHost || info?.hostname || (typeof window !== 'undefined' ? window.location.hostname : 'localhost'))
        setAdminUrl(`${isHttps?'https':'http'}://${host}${portLabel}/admin`)
      } catch {}
    }
    setup()
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const ping = async (id: string, n: number) => {
    if (busyId) return
    setBusyId(id)
    try {
      await fetch(`/api/clients/displays/${encodeURIComponent(id)}/identify`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ n, secs: 5 }) })
    } finally { setTimeout(()=>setBusyId(null), 600) }
  }

  const refresh = async () => {
    try {
      const r = await fetch('/api/clients/displays'); const d = await r.json();
      setClients(Array.isArray(d)?d:[])
      const map: any = {}
      ;(Array.isArray(d)?d:[]).forEach((c:any)=>{ map[c.id] = { showBeer: !!c.showBeer, showDrinks: !!c.showDrinks, showMedia: !!c.showMedia } })
      setContentById(map)
    } catch {}
  }
  const syncNow = async () => { if (syncing) return; setSyncing(true); try { await fetch('/api/clients/sync-now', { method:'POST' }) } finally { setTimeout(()=>setSyncing(false), 500) } }

  const togglePopup = (id: string) => { setOpenId(p=>p===id?null:id); if (!contentById[id]) setContentById(prev=>({ ...prev, [id]: { showBeer:true, showDrinks:true, showMedia:true } })) }
  const updateContent = async (id: string, patch: Partial<{ showBeer: boolean; showDrinks: boolean; showMedia: boolean }>) => {
    const cur = contentById[id] || { showBeer:true, showDrinks:true, showMedia:true }
    const next = { ...cur, ...patch }
    setContentById(prev => ({ ...prev, [id]: next }))
    try { await fetch(`/api/clients/displays/${encodeURIComponent(id)}/content`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(next) }) } catch {}
  }

  const onDragStart = (e: DragStartEvent) => { setActiveId(String(e.active.id)) }
  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    setActiveId(null)
    if (!over) return
    const ids = clients.map(c=>c.id)
    const from = ids.indexOf(String(active.id))
    let to = ids.indexOf(String(over.id))
    if (String(over.id) === END_ZONE_ID) to = ids.length - 1
    if (from < 0 || to < 0 || from === to) return
    const newOrder = arrayMove(clients, from, to)
    setClients(newOrder)
    try { await fetch('/api/clients/displays/layout', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids: newOrder.map(c=>c.id) }) }) } catch {}
  }

  const shortBrowser = (ua?: string) => {
    const s = ua || ''
    if (/Edg\//i.test(s)) return 'Edge'
    if (/OPR\//i.test(s) || /Opera/i.test(s)) return 'Opera'
    if (/Firefox\//i.test(s)) return 'Firefox'
    if (/Chrome\//i.test(s)) return 'Chrome'
    if (/Safari\//i.test(s)) return 'Safari'
    return s ? 'Browser' : ''
  }

  const closePopup = () => setOpenId(null)

  return (
    <div className="p-2" onClick={closePopup}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm opacity-80">Connected screens</div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="px-3 py-1 rounded border border-neutral-300 dark:border-neutral-700 text-sm">Refresh</button>
          <button onClick={syncNow} disabled={syncing} className={`px-3 py-1 rounded bg-green-600 text-white text-sm ${syncing?'opacity-80 cursor-not-allowed':''}`}>{syncing ? 'Syncing…' : 'Sync Now'}</button>
        </div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[snapCenterToCursor, restrictToWindowEdges]}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={clients.map(c=>c.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {clients.map(c => {
              const label = (c.label || '').trim()
              return (
                <ScreenTile
                  key={c.id}
                  id={c.id}
                  label={c.n}
                  name={label}
                  browser={shortBrowser(c.ua)}
                  disabled={openId !== null}
                  busy={busyId===c.id}
                  onPing={()=>ping(c.id, c.n)}
                  open={openId===c.id}
                  onToggle={(e?: any)=>{ e?.stopPropagation?.(); togglePopup(c.id) }}
                  content={contentById[c.id] || { showBeer:true, showDrinks:true, showMedia:true }}
                  onUpdate={(patch)=>updateContent(c.id, patch)}
                  adminUrl={adminUrl}
                />
              )
            })}
          <EndDropZone id={END_ZONE_ID} />
          </div>
        </SortableContext>
        <DragOverlay>
          {activeId ? (
            <div className="aspect-video w-[160px] md:w-[200px] rounded-md border-2 border-dashed border-blue-500 bg-blue-500/10 flex items-center justify-center">
              <div className="text-2xl font-bold">{clients.find(c=>c.id===activeId)?.n ?? ''}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function ScreenTile({ id, label, name, browser, disabled, busy, onPing, open, onToggle, content, onUpdate, adminUrl }: { id: string; label: number; name?: string; browser?: string; disabled?: boolean; busy: boolean; onPing: ()=>void; open: boolean; onToggle: (e?:any)=>void; content: { showBeer:boolean; showDrinks:boolean; showMedia:boolean }; onUpdate: (p: Partial<{showBeer:boolean; showDrinks:boolean; showMedia:boolean}>)=>void; adminUrl?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !!disabled })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="w-full">
      <button onClick={onPing} className={`w-full relative aspect-video border rounded-md flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 ${busy?'opacity-80':''}`}>
        {/* Browser + optional name */}
        <div className="absolute top-1 left-1 right-1 flex flex-col items-start px-1">
          {browser ? (
            <div className="text-[10px] bg-black/40 text-white rounded px-1 py-0.5 mt-0.5 max-w-full truncate" title={browser}>{browser}</div>
          ) : null}
          {name ? (
            <div className="text-[11px] font-medium bg-black/50 text-white rounded px-1 py-0.5 max-w-full truncate mt-0.5" title={name}>{name}</div>
          ) : null}
        </div>
        <div className="text-2xl font-bold">{label}</div>
        <div className="absolute bottom-1 right-1">
          <div role="button" aria-label="Options" onClick={(e)=>{ e.stopPropagation(); onToggle() }} className="px-2 py-0.5 rounded bg-neutral-900/60 text-white text-[10px] cursor-pointer select-none">Options</div>
        </div>
        {adminUrl ? (
          <div className="absolute bottom-1 left-1">
            <a href={adminUrl} target="_blank" rel="noopener noreferrer" onClick={(e)=>e.stopPropagation()} className="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] cursor-pointer select-none">Open Admin</a>
          </div>
        ) : null}
        {open && (
          <OptionsPopup id={id} initialName={name || ''} content={content} onUpdate={onUpdate} />
        )}
      </button>
    </div>
  )
}

function OptionsPopup({ id, initialName, content, onUpdate }: { id: string; initialName: string; content: { showBeer:boolean; showDrinks:boolean; showMedia:boolean }; onUpdate: (p: Partial<{showBeer:boolean; showDrinks:boolean; showMedia:boolean}>)=>void }) {
  const [name, setName] = React.useState(initialName)
  const initialMode = (() => {
    const { showBeer, showDrinks, showMedia } = content
    if (showMedia && !showBeer && !showDrinks) return 'media'
    if (showBeer && showDrinks) return 'both'
    if (showBeer) return 'beer'
    if (showDrinks) return 'drinks'
    return 'media'
  })()
  const [mode, setMode] = React.useState<string>(initialMode)
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  const saveAll = async () => {
    if (busy) return
    setBusy(true)
    setSaved(false)
    // Build content patch from selected mode
    const patch: Partial<{showBeer:boolean; showDrinks:boolean; showMedia:boolean}> = {}
    if (mode==='media') { patch.showBeer=false; patch.showDrinks=false; patch.showMedia=true }
    else if (mode==='beer') { patch.showBeer=true; patch.showDrinks=false; patch.showMedia=false }
    else if (mode==='drinks') { patch.showBeer=false; patch.showDrinks=true; patch.showMedia=false }
    else { patch.showBeer=true; patch.showDrinks=true; patch.showMedia=false }
    try {
      // Save label and content in parallel
      await Promise.all([
        fetch(`/api/clients/displays/${encodeURIComponent(id)}/label`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ label: name }) }).catch(()=>{}),
        (async()=>{ try { await onUpdate(patch) } catch {} })(),
      ])
      setSaved(true)
      setTimeout(()=>setSaved(false), 1200)
    } finally {
      setTimeout(()=>setBusy(false), 200)
    }
  }
  return (
    <div className="absolute z-20 left-1/2 -translate-x-1/2 bottom-9 w-64 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow p-3 text-[12px]" onClick={(e)=>{ e.stopPropagation() }}>
      <div className="font-semibold mb-1 text-xs">Display name</div>
      <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g., tv1" className="w-full px-3 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
      <div className="font-semibold mt-3 mb-1 text-xs">Display content</div>
      <select value={mode} onChange={(e)=>{ setMode(e.target.value); /* apply immediately */
        const v = e.target.value
        if (v==='media') onUpdate({ showBeer:false, showDrinks:false, showMedia:true })
        else if (v==='beer') onUpdate({ showBeer:true, showDrinks:false, showMedia:false })
        else if (v==='drinks') onUpdate({ showBeer:false, showDrinks:true, showMedia:false })
        else onUpdate({ showBeer:true, showDrinks:true, showMedia:false })
      }} className="w-full mb-3 px-3 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
        <option value="beer">Beers only</option>
        <option value="drinks">Drinks only</option>
        <option value="both">Beers + Drinks</option>
        <option value="media">Media only</option>
      </select>
      <div className="flex items-center justify-between">
        <div className={`text-[10px] ${saved ? 'opacity-80' : 'opacity-0'} transition-opacity duration-200`}>Saved ✓</div>
        <button onClick={saveAll} disabled={busy} className={`px-3 py-1.5 rounded bg-green-600 text-white text-xs ${busy?'opacity-80 cursor-not-allowed':''}`}>Save</button>
      </div>
    </div>
  )
}

function EndDropZone({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className="flex items-center justify-center">
      <div className={`aspect-video w-full rounded-md ${isOver ? 'border-2 border-dashed border-blue-500 bg-blue-500/5' : 'border border-transparent'}`} />
    </div>
  )
}
