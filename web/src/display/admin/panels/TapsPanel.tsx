import { useEffect, useState } from 'react'
import type { Beer, TapBeer } from '../../types'
import LoadingButton from '../components/LoadingButton'

type TapsPanelProps = {
  onRefresh: () => void
}

export default function TapsPanel({ onRefresh }: TapsPanelProps) {
  const [taps, setTaps] = useState<TapBeer[]>([])
  const [tapCount, setTapCount] = useState<number>(0)
  const [allBeers, setAllBeers] = useState<Beer[]>([])
  const [queries, setQueries] = useState<Record<number, string>>({})
  const [focusTap, setFocusTap] = useState<number | null>(null)
  const [tapHighlight, setTapHighlight] = useState<Record<number, number>>({})

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
                  <LoadingButton
                    onClick={()=>setStatus(t.tapNumber,'kicked')}
                    className="p-1 text-lg text-red-600 hover:text-red-800 dark:text-red-300 dark:hover:text-red-100 transition-colors"
                    title="Beer gone"
                    aria-label="Beer gone"
                  >
                    🚫
                  </LoadingButton>
                  <LoadingButton
                    onClick={()=>clearTap(t.tapNumber)}
                    className="p-1 text-lg text-neutral-700 hover:text-neutral-900 dark:text-neutral-200 dark:hover:text-white transition-colors"
                    title="Clear tap"
                    aria-label="Clear tap"
                  >
                    🗑️
                  </LoadingButton>
                </div>
              </div>
            <div className="mt-2 flex items-center gap-2">
              {t.status === 'kicked' && (
                <span title="Beer gone" aria-label="Beer gone" className="text-red-600">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4">
                    <circle cx="12" cy="12" r="10" fill="currentColor" />
                    <rect x="7" y="7" width="10" height="10" rx="1" ry="1" fill="#ffffff" />
                  </svg>
                </span>
              )}
              <div className="flex-1">
                <input
                  placeholder={t.beer ? `${t.beer.name} — ${t.beer.brewery}` : 'Assign beer...'}
                  value={queries[t.tapNumber] || ''}
                  onChange={(e)=>{ setQueries(q=>({ ...q, [t.tapNumber]: e.target.value })); setTapHighlight(h=>({ ...h, [t.tapNumber]: -1 })) }}
                  onFocus={()=>{ setFocusTap(t.tapNumber); setTapHighlight(h=>({ ...h, [t.tapNumber]: -1 })) }}
                  onBlur={()=>setTimeout(()=>setFocusTap(s=> (s===t.tapNumber ? null : s)), 150)}
                  onKeyDown={(e)=>{
                    const list = getSuggestions(t.tapNumber)
                    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusTap(t.tapNumber); setTapHighlight(h=>({ ...h, [t.tapNumber]: Math.min((h[t.tapNumber] ?? -1)+1, list.length-1) })) }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusTap(t.tapNumber); setTapHighlight(h=>({ ...h, [t.tapNumber]: Math.max((h[t.tapNumber] ?? -1)-1, -1) })) }
                    else if (e.key === 'Enter') {
                      const idx = tapHighlight[t.tapNumber] ?? -1
                      if (focusTap===t.tapNumber && idx >= 0 && idx < list.length) {
                        e.preventDefault();
                        assign(t.tapNumber, list[idx].id)
                        setFocusTap(null)
                        setTapHighlight(h=>({ ...h, [t.tapNumber]: -1 }))
                      }
                    } else if (e.key === 'Escape') { setFocusTap(null); setTapHighlight(h=>({ ...h, [t.tapNumber]: -1 })) }
                  }}
                  className="w-full px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700"
                />
                {(focusTap===t.tapNumber) && (
                  <div className="mt-1 max-h-48 overflow-auto rounded border border-neutral-300 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                    {getSuggestions(t.tapNumber).map((b, idx) => (
                      <button
                        key={`${t.tapNumber}-${b.id}`}
                        onMouseDown={(e)=>e.preventDefault()}
                        onClick={()=>assign(t.tapNumber, b.id)}
                        onMouseEnter={()=>setTapHighlight(h=>({ ...h, [t.tapNumber]: idx }))}
                        className={`block w-full text-left px-2 py-1 ${ (tapHighlight[t.tapNumber] ?? -1) === idx ? 'bg-neutral-100 dark:bg-neutral-800' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                      >
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

// MediaPanel moved to web/src/admin/panels/MediaPanel.tsx
