import { useEffect, useMemo, useState } from 'react'
import type { Drink, Price, Size } from '../../types'
import LoadingButton from '../components/LoadingButton'

type DrinkCategory = { id: number; name: string; displayOrder: number; active: boolean }

type DrinksPanelProps = {
  sizes: Size[]
  onRefresh: () => void
}

export default function DrinksPanel({ sizes, onRefresh }: DrinksPanelProps) {
  const [categories, setCategories] = useState<DrinkCategory[]>([])
  const [drinks, setDrinks] = useState<Drink[]>([])
  const [catFilter, setCatFilter] = useState<number|''>('')
  const [form, setForm] = useState<{ id?: number|null; name: string; categoryName: string; producer?: string; style?: string; abv?: number; origin?: string; description?: string; active?: boolean; prices: Record<number, number>; logoAssetId?: number|null }>({ name:'', categoryName:'', producer:'', style:'', abv: undefined, origin:'', description:'', active:true, prices:{}, logoAssetId: null })
  const [editingId, setEditingId] = useState<number|null>(null)
  const [newCat, setNewCat] = useState('')
  const [editCatId, setEditCatId] = useState<number|null>(null)
  const [editCatName, setEditCatName] = useState<string>('')
  const [logoFile, setLogoFile] = useState<File|null>(null)
  const [logoPreviewId, setLogoPreviewId] = useState<number|null>(null)
  const [removeLogo, setRemoveLogo] = useState<boolean>(false)

  const load = async () => {
    const [cats, list] = await Promise.all([
      fetch('/api/drink-categories').then(r=>r.json()).catch(()=>[]),
      fetch('/api/drinks').then(r=>r.json()).catch(()=>[])
    ])
    setCategories(cats || [])
    setDrinks(list || [])
  }
  useEffect(()=>{ load() }, [])
  const categoryNames = useMemo(()=> categories.map(c=>c.name).sort((a,b)=>a.localeCompare(b)), [categories])

  const submit = async () => {
    if (!form.name.trim() || !form.categoryName.trim()) { alert('Enter name and category'); return }
    let uploadedLogoId: number | undefined
    if (logoFile) {
      const fd = new FormData(); fd.append('file', logoFile); fd.append('tag','drink:logo')
      const up = await fetch('/api/upload', { method:'POST', body: fd })
      if (up.ok) { const a = await up.json(); uploadedLogoId = a.id }
    }
    if (editingId==null) {
      const body: any = { name: form.name, categoryName: form.categoryName, producer: form.producer || undefined, style: form.style || undefined, abv: form.abv, origin: form.origin || undefined, description: form.description || undefined, active: form.active !== false }
      if (typeof uploadedLogoId === 'number') body.logoAssetId = uploadedLogoId
      const res = await fetch('/api/drinks', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      if (!res.ok) { alert('Failed to create drink'); return }
      const d = await res.json(); if (!d?.id) return
      const prices = Object.entries(form.prices).map(([sid, amt]) => ({ serveSizeId:Number(sid), amountMinor: Math.round(Number(amt)*100), currency:'GBP' }))
      if (prices.length) await fetch(`/api/drinks/${d.id}/prices`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prices }) })
    } else {
      const body: any = { name: form.name, categoryName: form.categoryName, producer: form.producer || undefined, style: form.style || undefined, abv: form.abv, origin: form.origin || undefined, description: form.description || undefined, active: form.active !== false }
      if (typeof uploadedLogoId === 'number') body.logoAssetId = uploadedLogoId
      else if (removeLogo) body.logoAssetId = null
      await fetch(`/api/drinks/${editingId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      const prices = Object.entries(form.prices).map(([sid, amt]) => ({ serveSizeId:Number(sid), amountMinor: Math.round(Number(amt)*100), currency:'GBP' }))
      if (prices.length) await fetch(`/api/drinks/${editingId}/prices`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prices }) })
    }
    setEditingId(null)
    setForm({ name:'', categoryName:'', producer:'', style:'', abv: undefined, origin:'', description:'', active:true, prices:{}, logoAssetId: null })
    setLogoFile(null); setLogoPreviewId(null); setRemoveLogo(false)
    await load(); await onRefresh()
  }
  const archive = async (id:number) => { await fetch(`/api/drinks/${id}`, { method:'DELETE' }); await load(); await onRefresh() }
  const openEdit = async (id:number) => { const d=await fetch(`/api/drinks/${id}`).then(r=>r.json()); setEditingId(id); setForm({ name:d.name, categoryName: (categories.find(c=>c.id===d.categoryId)?.name || ''), producer:d.producer||'', style:d.style||'', abv:d.abv||undefined, origin:d.origin||'', description:d.description||'', active:d.active!==false, prices:Object.fromEntries((d.prices||[]).map((p:any)=>[p.serveSizeId,(p.amountMinor||0)/100])), logoAssetId: d.logoAssetId ?? null }); setLogoPreviewId(d.logoAssetId ?? null); setLogoFile(null); setRemoveLogo(false) }
  const cancel = () => { setEditingId(null); setForm({ name:'', categoryName:'', producer:'', style:'', abv: undefined, origin:'', description:'', active:true, prices:{}, logoAssetId: null }); setLogoFile(null); setLogoPreviewId(null); setRemoveLogo(false) }

  const filtered = drinks.filter(d => !catFilter || d.categoryId === catFilter)
  const selectedCat = useMemo(() => (typeof catFilter === 'number' ? categories.find(c=>c.id===catFilter) || null : null), [categories, catFilter])

  // Category helpers
  const catSorted = categories.slice().sort((a,b)=> (a.displayOrder-b.displayOrder) || a.name.localeCompare(b.name))
  const catHasDrinks = (id:number) => drinks.some(d=>d.categoryId===id)
  const addCategory = async () => {
    const name = newCat.trim(); if (!name) return
    const res = await fetch('/api/drink-categories', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) })
    if (!res.ok) { alert('Failed to add category'); return }
    setNewCat(''); await load(); await onRefresh()
  }
  const deleteCategory = async (id:number) => {
    if (!confirm('Delete this category? Only allowed if empty.')) return
    const res = await fetch(`/api/drink-categories/${id}`, { method:'DELETE' })
    if (!res.ok) { const msg = await res.text().catch(()=> ''); alert(msg || 'Cannot delete category (may not be empty)'); return }
    if (catFilter===id) setCatFilter('')
    await load(); await onRefresh()
  }
  const startEditCategory = (c: DrinkCategory) => { setEditCatId(c.id); setEditCatName(c.name) }
  const saveEditCategory = async (id:number) => {
    const name = editCatName.trim(); if (!name) { alert('Name cannot be empty'); return }
    const res = await fetch(`/api/drink-categories/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) })
    if (!res.ok) { const msg = await res.text().catch(()=> ''); alert(msg || 'Failed to rename'); return }
    setEditCatId(null); setEditCatName(''); await load(); await onRefresh()
  }
  const cancelEditCategory = () => { setEditCatId(null); setEditCatName('') }
  const [dragCatId, setDragCatId] = useState<number|null>(null)
  const [dragOverCat, setDragOverCat] = useState<{ id:number; pos:'before'|'after' }|null>(null)
  const onDragStart = (e: React.DragEvent, id:number) => {
    e.stopPropagation()
    setDragCatId(id)
    e.dataTransfer.setData('text/x-drink-category-id', String(id))
    e.dataTransfer.effectAllowed = 'move'
  }
  const onCatDragOver = (e: React.DragEvent<HTMLLIElement>, targetId:number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLLIElement).getBoundingClientRect()
    const pos: 'before'|'after' = (e.clientY - rect.top) < (rect.height / 2) ? 'before' : 'after'
    setDragOverCat({ id: targetId, pos })
  }
  const clearDrag = () => { setDragCatId(null); setDragOverCat(null) }
  const onDrop = async (e: React.DragEvent<HTMLLIElement>, targetId:number) => {
    e.preventDefault()
    const data = e.dataTransfer.getData('text/x-drink-category-id')
    const srcId = Number(data)
    if (!srcId || srcId === targetId) { clearDrag(); return }
    const order = catSorted.map(c=>c.id)
    const from = order.indexOf(srcId)
    const targetIndex = order.indexOf(targetId)
    if (from<0 || targetIndex<0) { clearDrag(); return }
    let insertIndex = targetIndex + (dragOverCat?.id===targetId && dragOverCat?.pos==='after' ? 1 : 0)
    order.splice(from,1)
    if (from < insertIndex) insertIndex--
    order.splice(insertIndex, 0, srcId)
    await fetch('/api/drink-categories/order', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids: order }) })
    clearDrag()
    await load(); await onRefresh()
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left column: Categories + Drinks */}
      <div className="lg:col-span-1 space-y-6">
        <div>
        <h3 className="font-semibold mb-2">Categories</h3>
        <div className="mb-2 flex gap-2">
          <input value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="Add category" className="flex-1 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
          <LoadingButton onClick={addCategory} className="px-2 py-1 rounded bg-blue-600 text-white">Add</LoadingButton>
        </div>
        <div className="text-xs opacity-70 mb-2">Drag to reorder. Delete only when empty.</div>
        <ul className="space-y-1 text-sm">
          {catSorted.map(c => (
            <li key={c.id}
                className={`flex items-center justify-between border rounded px-2 py-1 gap-2 border-neutral-300 dark:border-neutral-800 ${catFilter===c.id ? 'bg-neutral-100 dark:bg-neutral-800' : ''} ${dragOverCat?.id===c.id && dragOverCat.pos==='before' ? 'border-t-2 border-blue-500' : ''} ${dragOverCat?.id===c.id && dragOverCat.pos==='after' ? 'border-b-2 border-blue-500' : ''}`}
                onDragOver={(e)=>onCatDragOver(e,c.id)}
                onDrop={(e)=>onDrop(e,c.id)}
                onDragEnd={clearDrag}
                onClick={()=> setCatFilter(prev => prev===c.id ? '' : c.id)}
            >
              <button title="Drag to reorder" className="cursor-grab" onMouseDown={(e)=>e.preventDefault()} draggable onDragStart={(e)=>onDragStart(e,c.id)}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                  <path fill="currentColor" d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z"/>
                </svg>
              </button>
              <span className="flex-1 truncate" onClick={(e)=>{ e.stopPropagation(); setCatFilter(prev => prev===c.id ? '' : c.id) }}>
                {editCatId===c.id ? (
                  <input
                    value={editCatName}
                    onClick={(e)=>e.stopPropagation()}
                    onChange={(e)=>setEditCatName(e.target.value)}
                    onKeyDown={(e)=>{ if (e.key==='Enter') { e.preventDefault(); saveEditCategory(c.id) } else if (e.key==='Escape') { e.preventDefault(); cancelEditCategory() } }}
                    className="w-full px-2 py-0.5 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700"
                  />
                ) : (
                  c.name
                )}
              </span>
              {editCatId===c.id ? (
                <div className="flex gap-2" onClick={(e)=>e.stopPropagation()}>
                  <LoadingButton onClick={()=>saveEditCategory(c.id)} className="px-2 py-0.5 rounded bg-green-600 text-white border border-green-700 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">Save</LoadingButton>
                  <LoadingButton onClick={cancelEditCategory} className="px-2 py-0.5 rounded bg-neutral-600 text-white border border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">Cancel</LoadingButton>
                </div>
              ) : (
                <div className="flex items-center gap-2" onClick={(e)=>e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={()=>startEditCategory(c)}
                    className="p-1 text-lg text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white transition-colors"
                    title="Edit category"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={()=>!catHasDrinks(c.id) && deleteCategory(c.id)}
                    className={`p-1 text-lg transition-colors ${catHasDrinks(c.id) ? 'text-neutral-400 cursor-not-allowed line-through opacity-60' : 'text-red-600 hover:text-red-800 dark:text-red-300 dark:hover:text-red-100'}`}
                    title={catHasDrinks(c.id) ? 'Cannot delete non-empty category' : 'Delete category'}
                    disabled={catHasDrinks(c.id)}
                  >
                    🗑️
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
        <div>
          <h3 className="font-semibold mb-2">Drinks {selectedCat ? (
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-neutral-200 text-neutral-800 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
              {selectedCat.name}
              <button
                type="button"
                onClick={(e)=>{ e.stopPropagation(); setCatFilter('') }}
                aria-label="Clear category filter"
                className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-neutral-300 dark:hover:bg-neutral-700"
                title="Clear filter"
              >
                ×
              </button>
            </span>
          ) : null}</h3>
        
        <ul className="space-y-1 text-sm">
          {filtered
            .slice()
            .sort((a,b)=>{
              const ac = categories.find(c=>c.id===a.categoryId)?.name || ''
              const bc = categories.find(c=>c.id===b.categoryId)?.name || ''
              return ac===bc ? a.name.localeCompare(b.name) : ac.localeCompare(bc)
            })
            .map(d => (
            <li key={d.id} className="flex items-center justify-between border rounded px-2 py-1 gap-2 border-neutral-300 dark:border-neutral-800">
              <span className="truncate">{d.name} — {(categories.find(c=>c.id===d.categoryId)?.name) || 'Uncategorized'}</span>
              <div className="flex items-center gap-2">
                <LoadingButton
                  onClick={()=>openEdit(d.id)}
                  className="p-1 text-lg text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white transition-colors"
                  title="Edit drink"
                >
                  ✏️
                </LoadingButton>
                <LoadingButton
                  onClick={()=>archive(d.id)}
                  className="p-1 text-lg text-red-600 hover:text-red-800 dark:text-red-300 dark:hover:text-red-100 transition-colors"
                  title="Delete drink"
                >
                  🗑️
                </LoadingButton>
              </div>
            </li>
          ))}
        </ul>
      </div>
      </div>
      <div>
        <h3 className="font-semibold mb-2">{editingId==null?'Add Drink':'Edit Drink'}</h3>
        <div className="space-y-4 text-sm">
          <input placeholder="Name" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
          <div>
            <input list="drink-category-list" placeholder="Category" value={form.categoryName} onChange={e=>setForm({...form, categoryName: e.target.value})} className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
            <datalist id="drink-category-list">
              {categoryNames.map(n => <option key={n} value={n} />)}
            </datalist>
            <div className="text-xs opacity-70 mt-1">Type a new name to create a category.</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Producer (optional)" value={form.producer||''} onChange={e=>setForm({...form, producer:e.target.value})} className="px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
            <input placeholder="Style (optional)" value={form.style||''} onChange={e=>setForm({...form, style:e.target.value})} className="px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
            <input type="number" step="0.1" placeholder="ABV % (optional)" value={form.abv as any || ''} onChange={e=>setForm({...form, abv: e.target.value?Number(e.target.value):undefined})} className="px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
            <input placeholder="Origin (optional)" value={form.origin||''} onChange={e=>setForm({...form, origin:e.target.value})} className="px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
          </div>
          <textarea placeholder="Description (optional)" value={form.description||''} onChange={e=>setForm({...form, description:e.target.value})} className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
          <div className="border rounded p-2 border-neutral-300 dark:border-neutral-800">
            <div className="flex items-center justify-between mb-1">
              <div className="font-semibold">Logo Image {editingId==null?'(optional)':'(replace optional)'}</div>
              {editingId!=null && logoPreviewId!=null && !removeLogo && (
                <div className="flex items-center gap-2">
                  <img src={`/api/assets/${logoPreviewId}/content`} alt="logo" className="h-8 w-8 object-contain border border-neutral-300 dark:border-neutral-700" />
                  <button type="button" onClick={()=>{ setRemoveLogo(true); setLogoPreviewId(null); setLogoFile(null) }} className="text-xs px-2 py-0.5 rounded bg-neutral-200 text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">Remove</button>
                </div>
              )}
            </div>
            <input type="file" accept="image/jpeg,image/png" onChange={e=>{ setLogoFile(e.target.files?.[0] ?? null); setRemoveLogo(false); (e.target as HTMLInputElement).value='' }} className="block w-full text-sm text-neutral-900 dark:text-neutral-100 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 dark:file:bg-neutral-700 dark:hover:file:bg-neutral-600" />
          </div>
          <div className="font-semibold mb-1">Prices</div>
          <div className="grid grid-cols-2 gap-2">
            {sizes
              .filter(s => s.forDrinks !== false)
              .sort((a,b)=> (a.displayOrder-b.displayOrder) || a.name.localeCompare(b.name))
              .map(s => (
              <label key={s.id} className="flex items-center justify-between gap-2">
                <span className="text-xs">{s.name}</span>
                <input type="number" min={0} step="0.01" value={form.prices[s.id] ?? ''} onChange={e=>setForm({...form, prices: { ...form.prices, [s.id]: e.target.value ? Number(e.target.value) : undefined as any } })} placeholder="0.00" className="w-24 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <LoadingButton onClick={submit} className="px-3 py-1.5 rounded bg-blue-600 text-white">{editingId==null?'Add':'Save'}</LoadingButton>
            {editingId!=null && <LoadingButton onClick={cancel} className="px-3 py-1.5 rounded bg-neutral-600 text-white">Cancel</LoadingButton>}
          </div>
        </div>
      </div>
    </div>
  )
}
