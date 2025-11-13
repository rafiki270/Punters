import { useEffect, useState } from 'react'
import type { Size } from '../../types'
import LoadingButton from '../components/LoadingButton'

type SizesPanelProps = {
  onRefresh: () => void
}

export default function SizesPanel({ onRefresh }: SizesPanelProps) {
  const [list, setList] = useState<Size[]>([])
  const [name, setName] = useState('')
  const [ml, setMl] = useState<number>(568)
  const [newForBeers, setNewForBeers] = useState<boolean>(true)
  const [newForDrinks, setNewForDrinks] = useState<boolean>(true)
  useEffect(()=>{ fetch('/api/sizes').then(r=>r.json()).then(setList)},[])
  const create = async () => {
    await fetch('/api/sizes', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, volumeMl: Number(ml), forBeers: !!newForBeers, forDrinks: !!newForDrinks }) })
    setName(''); setMl(568); setNewForBeers(true); setNewForDrinks(true)
    const fresh = await fetch('/api/sizes').then(r=>r.json()); setList(fresh); await onRefresh()
  }
  const del = async (id:number) => { await fetch(`/api/sizes/${id}`, { method:'DELETE' }); const fresh = await fetch('/api/sizes').then(r=>r.json()); setList(fresh); await onRefresh() }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <h3 className="font-semibold mb-2">Existing Sizes</h3>
        <ul className="space-y-1 text-sm">
          {list.map(s => (
            <li key={s.id} className="flex items-center justify-between border border-neutral-800 rounded px-2 py-1">
              <div className="flex-1 flex items-center gap-3">
                <span className="min-w-40">{s.name} — {s.volumeMl}ml</span>
                <label className="flex items-center gap-1"><input type="checkbox" checked={s.forBeers !== false} onChange={async (e)=>{ await fetch(`/api/sizes/${s.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ forBeers: e.target.checked }) }); const fresh = await fetch('/api/sizes').then(r=>r.json()); setList(fresh); await onRefresh() }} /> Beers</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={s.forDrinks !== false} onChange={async (e)=>{ await fetch(`/api/sizes/${s.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ forDrinks: e.target.checked }) }); const fresh = await fetch('/api/sizes').then(r=>r.json()); setList(fresh); await onRefresh() }} /> Drinks</label>
              </div>
              <LoadingButton
                onClick={()=>del(s.id)}
                className="p-1 text-lg text-red-600 hover:text-red-800 dark:text-red-300 dark:hover:text-red-100 transition-colors"
                aria-label="Delete size"
              >
                🗑️
              </LoadingButton>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-semibold mb-2">Add Size</h3>
        <div className="space-y-2 text-sm">
          <input placeholder="Name (e.g., Pint)" value={name} onChange={e=>setName(e.target.value)} className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
          <input type="number" placeholder="Volume ml" value={ml} onChange={e=>setMl(Number(e.target.value))} className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1"><input type="checkbox" checked={newForBeers} onChange={(e)=>setNewForBeers(e.target.checked)} /> Beers</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={newForDrinks} onChange={(e)=>setNewForDrinks(e.target.checked)} /> Drinks</label>
          </div>
          <LoadingButton onClick={create} className="px-3 py-1.5 rounded bg-green-700">Create</LoadingButton>
        </div>
      </div>
    </div>
  )
}

// SystemPanel moved to web/src/admin/panels/SystemPanel.tsx
