import { useEffect, useMemo, useState } from 'react'
import type { Beer, Price, Size } from '../../types'
import LoadingButton from '../components/LoadingButton'

type BeersPanelProps = {
  sizes: Size[]
  onRefresh: () => void
}

export default function BeersPanel({ sizes, onRefresh }: BeersPanelProps) {
  const [beers, setBeers] = useState<Beer[]>([])
  const [brewery, setBrewery] = useState<string>('')
  const [form, setForm] = useState<{ name:string; brewery:string; style:string; abv?:number; isGuest:boolean; glutenFree?:boolean; vegan?:boolean; alcoholFree?:boolean; prices: Record<number, number>; colorHex?: string|null }>({ name:'', brewery:'', style:'', abv: undefined, isGuest:false, glutenFree:false, vegan:false, alcoholFree:false, prices:{}, colorHex: null })
  const [file, setFile] = useState<File|null>(null)
  const [badgePreviewId, setBadgePreviewId] = useState<number|null>(null)
  const [removeBadge, setRemoveBadge] = useState<boolean>(false)
  const [breweryOpen, setBreweryOpen] = useState(false)
  const [breweryHighlight, setBreweryHighlight] = useState<number>(-1)
  const breweryList = useMemo(() => Array.from(new Set(beers.map(b=>b.brewery).filter(Boolean))).sort((a,b)=>a.localeCompare(b)), [beers])
  const [editingId, setEditingId] = useState<number|null>(null)
  useEffect(()=>{ fetch('/api/beers').then(r=>r.json()).then(setBeers)},[])
  const submit = async () => {
    let badgeAssetId: number | undefined
    if (file) { const fd=new FormData(); fd.append('file', file); const up=await fetch('/api/upload',{method:'POST',body:fd}); if(up.ok){ const a=await up.json(); badgeAssetId=a.id } }
    if (editingId==null) {
      const res = await fetch('/api/beers', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name:form.name, brewery:form.brewery, style:form.style, abv:form.abv, isGuest:form.isGuest, glutenFree: !!form.glutenFree, vegan: !!form.vegan, alcoholFree: !!form.alcoholFree, colorHex: form.colorHex || undefined, prefillPrices:false, badgeAssetId }) })
      if (!res.ok) { alert('Failed to create beer'); return }
      const b = await res.json(); if (!b?.id) return
      const prices = Object.entries(form.prices).map(([sid, amt]) => ({ serveSizeId:Number(sid), amountMinor: Math.round(Number(amt)*100), currency:'GBP' }))
      if (prices.length) await fetch(`/api/beers/${b.id}/prices`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prices }) })
    } else {
      const body: any = { name:form.name, brewery:form.brewery, style:form.style, abv:form.abv, isGuest:form.isGuest, glutenFree: !!form.glutenFree, vegan: !!form.vegan, alcoholFree: !!form.alcoholFree, colorHex: form.colorHex || undefined }
      if (typeof badgeAssetId === 'number') body.badgeAssetId = badgeAssetId
      else if (removeBadge) body.badgeAssetId = null
      await fetch(`/api/beers/${editingId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      const prices = Object.entries(form.prices).map(([sid, amt]) => ({ serveSizeId:Number(sid), amountMinor: Math.round(Number(amt)*100), currency:'GBP' }))
      if (prices.length) await fetch(`/api/beers/${editingId}/prices`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prices }) })
    }
    setEditingId(null); setForm({ name:'', brewery:'', style:'', abv: undefined, isGuest:false, glutenFree:false, vegan:false, alcoholFree:false, prices:{}, colorHex: null }); setFile(null); setBadgePreviewId(null); setRemoveBadge(false)
    const fresh = await fetch('/api/beers').then(r=>r.json()); setBeers(fresh); await onRefresh()
  }
  const archive = async (id:number) => { await fetch(`/api/beers/${id}`, { method:'DELETE' }); const fresh = await fetch('/api/beers').then(r=>r.json()); setBeers(fresh); await onRefresh() }
  const openEdit = async (id:number) => { const b=await fetch(`/api/beers/${id}`).then(r=>r.json()); setEditingId(id); setForm({ name:b.name, brewery:b.brewery, style:b.style, abv:b.abv, isGuest:b.isGuest, glutenFree: !!(b as any).glutenFree, vegan: !!(b as any).vegan, alcoholFree: !!(b as any).alcoholFree, prices:Object.fromEntries((b.prices||[]).map((p:any)=>[p.serveSizeId,(p.amountMinor||0)/100])), colorHex: b.colorHex || null }); setFile(null); setBadgePreviewId((b as any).badgeAssetId ?? null); setRemoveBadge(false) }
  const cancel = () => { setEditingId(null); setForm({ name:'', brewery:'', style:'', abv: undefined, isGuest:false, glutenFree:false, vegan:false, alcoholFree:false, prices:{}, colorHex: null }); setFile(null); setBadgePreviewId(null); setRemoveBadge(false) }
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
              <div className="flex items-center gap-2">
                <LoadingButton
                  onClick={()=>openEdit(b.id)}
                  className="p-1 text-lg text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white transition-colors"
                  title="Edit beer"
                >
                  ✏️
                </LoadingButton>
                <LoadingButton
                  onClick={()=>archive(b.id)}
                  className="p-1 text-lg text-red-600 hover:text-red-800 dark:text-red-300 dark:hover:text-red-100 transition-colors"
                  title="Delete beer"
                >
                  🗑️
                </LoadingButton>
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
              onChange={e=>{ setForm({...form, brewery:e.target.value}); setBreweryOpen(true); setBreweryHighlight(-1) }}
              onFocus={()=>{ setBreweryOpen(true); setBreweryHighlight(-1) }}
              onBlur={()=>setTimeout(()=>setBreweryOpen(false), 150)}
              onKeyDown={(e)=>{
                const q = (form.brewery||'').toLowerCase()
                const list = (q ? breweryList.filter(n => n.toLowerCase().includes(q)) : breweryList).slice(0,10)
                if (e.key === 'ArrowDown') { e.preventDefault(); setBreweryOpen(true); setBreweryHighlight(h => Math.min(list.length-1, h+1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setBreweryOpen(true); setBreweryHighlight(h => Math.max(-1, h-1)) }
                else if (e.key === 'Enter') {
                  if (breweryOpen && breweryHighlight >= 0 && breweryHighlight < list.length) {
                    e.preventDefault();
                    setForm({...form, brewery: list[breweryHighlight]});
                    setBreweryOpen(false);
                    setBreweryHighlight(-1);
                  }
                } else if (e.key === 'Escape') { setBreweryOpen(false); setBreweryHighlight(-1) }
              }}
              className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700"
            />
            {breweryOpen && (
              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow">
                {((form.brewery||'').trim() ? breweryList.filter(n => n.toLowerCase().includes((form.brewery||'').toLowerCase())) : breweryList).slice(0,10).map((name, idx, arr) => (
                  <div key={name}
                       onMouseDown={(e)=>{ e.preventDefault(); setForm({...form, brewery: name}); setBreweryOpen(false); setBreweryHighlight(-1) }}
                       className={`px-2 py-1 cursor-pointer ${breweryHighlight===idx ? 'bg-neutral-100 dark:bg-neutral-800' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                       onMouseEnter={()=>setBreweryHighlight(idx)}>
                    {name}
                  </div>
                ))}
                {((form.brewery||'').trim() ? breweryList.filter(n => n.toLowerCase().includes((form.brewery||'').toLowerCase())) : breweryList).length===0 && (
                  <div className="px-2 py-1 opacity-60 text-sm">No matches</div>
                )}
              </div>
            )}
          </div>
          <input placeholder="Style" value={form.style} onChange={e=>setForm({...form, style:e.target.value})} className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
          <input type="number" step="0.1" placeholder="ABV" value={form.abv ?? ''} onChange={e=>setForm({...form, abv: e.target.value?Number(e.target.value):undefined})} className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 whitespace-nowrap"><input type="checkbox" checked={form.isGuest} onChange={e=>setForm({...form, isGuest:e.target.checked})} /> Guest Beer</label>
            <label className="flex items-center gap-2 whitespace-nowrap"><input type="checkbox" checked={!!form.glutenFree} onChange={e=>setForm({...form, glutenFree:e.target.checked})} /> Gluten Free</label>
            <label className="flex items-center gap-2 whitespace-nowrap"><input type="checkbox" checked={!!form.vegan} onChange={e=>setForm({...form, vegan:e.target.checked})} /> Vegan</label>
            <label className="flex items-center gap-2 whitespace-nowrap"><input type="checkbox" checked={!!form.alcoholFree} onChange={e=>setForm({...form, alcoholFree:e.target.checked})} /> Alcohol Free</label>
          </div>
          <div className="border rounded p-2 border-neutral-300 dark:border-neutral-800">
            <div className="font-semibold mb-1">Prices</div>
            {sizes.filter(s=> s.forBeers !== false).map(s => (
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
            <div className="flex items-center justify-between mb-1">
              <div className="font-semibold">Badge Image {editingId==null?'(optional)':'(replace optional)'}</div>
              {editingId!=null && badgePreviewId!=null && !removeBadge && (
                <div className="flex items-center gap-2">
                  <img src={`/api/assets/${badgePreviewId}/content`} alt="badge" className="h-8 w-8 rounded-full object-cover border border-neutral-300 dark:border-neutral-700" />
                  <button type="button" onClick={()=>{ setRemoveBadge(true); setBadgePreviewId(null); setFile(null) }} className="text-xs px-2 py-0.5 rounded bg-neutral-200 text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">Remove</button>
                </div>
              )}
            </div>
            <input type="file" accept="image/jpeg,image/png" onChange={e=>{ setFile(e.target.files?.[0] ?? null); setRemoveBadge(false); (e.target as HTMLInputElement).value='' }} className="block w-full text-sm text-neutral-900 dark:text-neutral-100 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 dark:file:bg-neutral-700 dark:hover:file:bg-neutral-600" />
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
