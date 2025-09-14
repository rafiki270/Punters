import React, { useEffect, useState } from 'react'

type DisplayClient = { id: string; n: number }

export default function ArrangementsPanel() {
  const [clients, setClients] = useState<DisplayClient[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/clients/displays')
        const data = await res.json()
        if (!cancelled) setClients(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) setClients([])
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const ping = async (id: string, n: number) => {
    if (busyId) return
    setBusyId(id)
    try {
      await fetch(`/api/clients/displays/${encodeURIComponent(id)}/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n, secs: 5 }),
      })
    } finally {
      setTimeout(() => setBusyId(null), 600)
    }
  }

  return (
    <div className="p-2">
      <div className="mb-3 text-sm opacity-80">Connected screens (read-only)</div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {clients.map((c) => (
          <button key={c.id} onClick={()=>ping(c.id, c.n)} className={`relative aspect-video border rounded-md flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 ${busyId===c.id?'opacity-80':''}`}>
            <div className="text-2xl font-bold">{c.n}</div>
          </button>
        ))}
        {!clients.length && (
          <div className="col-span-full text-sm opacity-70">No screens connected.</div>
        )}
      </div>
    </div>
  )
}
