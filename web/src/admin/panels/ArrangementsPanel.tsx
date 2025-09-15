import React from 'react'
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
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
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { snapCenterToCursor, restrictToWindowEdges } from '@dnd-kit/modifiers'

type DisplayClient = { id: string; n: number }

export default function ArrangementsPanel() {
  const [clients, setClients] = React.useState<DisplayClient[]>([])
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [contentById, setContentById] = React.useState<Record<string, { showBeer: boolean; showDrinks: boolean; showMedia: boolean }>>({})
  const [syncing, setSyncing] = React.useState(false)
  const END_ZONE_ID = '__end_zone__'

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      try { const r = await fetch('/api/clients/displays'); const d = await r.json(); if (!cancelled) setClients(Array.isArray(d)?d:[]) } catch { if (!cancelled) setClients([]) }
    }
    load(); return () => { cancelled = true }
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const ping = async (id: string, n: number) => {
    if (busyId) return
    setBusyId(id)
    try {
      await fetch(`/api/clients/displays/${encodeURIComponent(id)}/identify`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ n, secs: 5 }) })
    } finally { setTimeout(()=>setBusyId(null), 600) }
  }

  const refresh = async () => {
    try { const r = await fetch('/api/clients/displays'); const d = await r.json(); setClients(Array.isArray(d)?d:[]) } catch {}
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

  return (
    <div className="p-2">
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
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {clients.map(c => (
              <ScreenTile key={c.id} id={c.id} label={c.n} busy={busyId===c.id} onPing={()=>ping(c.id, c.n)} open={openId===c.id} onToggle={()=>togglePopup(c.id)} content={contentById[c.id] || { showBeer:true, showDrinks:true, showMedia:true }} onUpdate={(patch)=>updateContent(c.id, patch)} />
            ))}
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

function ScreenTile({ id, label, busy, onPing, open, onToggle, content, onUpdate }: { id: string; label: number; busy: boolean; onPing: ()=>void; open: boolean; onToggle: ()=>void; content: { showBeer:boolean; showDrinks:boolean; showMedia:boolean }; onUpdate: (p: Partial<{showBeer:boolean; showDrinks:boolean; showMedia:boolean}>)=>void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="w-full">
      <button onClick={onPing} className={`w-full relative aspect-video border rounded-md flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 ${busy?'opacity-80':''}`}>
        <div className="text-2xl font-bold">{label}</div>
        <div className="absolute bottom-1 right-1">
          <div role="button" aria-label="Options" onClick={(e)=>{ e.stopPropagation(); onToggle() }} className="px-2 py-0.5 rounded bg-neutral-900/60 text-white text-[10px] cursor-pointer select-none">Options</div>
        </div>
        {open && (
          <div className="absolute z-20 left-1/2 -translate-x-1/2 bottom-9 w-40 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow p-2 text-[12px]" onClick={(e)=>e.stopPropagation()}>
            <div className="font-semibold mb-1 text-xs">Display content</div>
            <div className="space-y-1">
              <label className="flex items-center gap-2"><input type="checkbox" checked={content.showBeer} onChange={(e)=>onUpdate({ showBeer: e.target.checked })} /> Beers</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={content.showDrinks} onChange={(e)=>onUpdate({ showDrinks: e.target.checked })} /> Drinks</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={content.showMedia} onChange={(e)=>onUpdate({ showMedia: e.target.checked })} /> Media</label>
            </div>
          </div>
        )}
      </button>
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
