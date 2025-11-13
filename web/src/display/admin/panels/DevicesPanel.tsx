import { useEffect, useState } from 'react'
import type { Device } from '../../types'
import LoadingButton from '../components/LoadingButton'

type DevicesPanelProps = {
  onRefresh: () => void
}

export default function DevicesPanel({ onRefresh }: DevicesPanelProps) {
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
                <option value="drinks">Drinks only</option>
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
