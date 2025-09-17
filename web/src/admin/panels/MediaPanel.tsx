import React, { useEffect, useState } from 'react'

type Ad = { id: number; filename: string; mimeType: string; width?: number|null; height?: number|null; allowPair?: boolean; fullscreen?: boolean; requireLogo?: boolean; hideLogo?: boolean; displayOrder?: number }

function LoadingButton({ onClick, children, className }: { onClick: () => Promise<void> | void; children: React.ReactNode; className?: string }) {
  const [loading, setLoading] = useState(false)
  const handle = async () => {
    if (loading) return
    setLoading(true)
    const minDelay = new Promise<void>(res => setTimeout(res, 600))
    try { await Promise.all([Promise.resolve(onClick()), minDelay]) } finally { setLoading(false) }
  }
  return (
    <button onClick={handle} disabled={loading} className={`${className ?? ''} inline-flex items-center gap-2 ${loading ? 'opacity-80 cursor-not-allowed' : ''}`}>
      {loading && <span className="inline-block h-4 w-4 border-2 border-neutral-300 border-t-transparent rounded-full animate-spin" />}
      <span>{children}</span>
    </button>
  )
}

export default function MediaPanel({ onRefresh }: { onRefresh: () => void }) {
  const [assets, setAssets] = useState<Ad[]>([])
  useEffect(()=>{ fetch('/api/assets').then(r=>r.json()).then(setAssets).catch(()=>setAssets([])) },[])

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if(!file) return
    const fd = new FormData(); fd.append('file', file)
    await fetch('/api/upload', { method:'POST', body: fd })
    ;(e.target as HTMLInputElement).value = ''
    const list = await fetch('/api/assets').then(r=>r.json()).catch(()=>[]); setAssets(list); await onRefresh()
  }

  const remove = async (id:number) => {
    await fetch(`/api/assets/${id}`, { method:'DELETE' })
    const list = await fetch('/api/assets').then(r=>r.json()).catch(()=>[])
    setAssets(list)
    await onRefresh()
  }

  const update = async (a: Ad, patch: Partial<Ad>) => {
    const res = await fetch(`/api/assets/${a.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ allowPair: patch.allowPair, fullscreen: patch.fullscreen, hideLogo: patch.hideLogo }) })
    if (res.ok) {
      const list = await fetch('/api/assets').then(r=>r.json()).catch(()=>[])
      setAssets(list)
      await onRefresh()
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
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!a.fullscreen} onChange={e=>update(a, { fullscreen: e.target.checked })} /> Fullscreen</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!a.hideLogo} onChange={e=>update(a, { hideLogo: e.target.checked })} /> Hide logo only</label>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
