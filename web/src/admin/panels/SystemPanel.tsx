import React, { useState } from 'react'

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

type UpdateResult = { status: string; message: string }

export default function SystemPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null)

  async function runUpdate() {
    if (updateBusy) return
    setUpdateBusy(true)
    try {
      let payload: any = null
      const res = await fetch('/api/admin/system/update', { method: 'POST', credentials: 'include' })
      try { payload = await res.json() } catch {}
      if (!res.ok) {
        const msg = payload?.error || payload?.detail || 'Update failed'
        throw new Error(msg)
      }
      const status = payload?.status || 'unknown'
      const head = typeof payload?.head === 'string' ? payload.head.slice(0, 7) : null
      const message = payload?.message
        || (status === 'already-up-to-date'
          ? 'Already up to date.'
          : status === 'updated'
            ? `Updated to ${head || 'latest commit'}.`
            : 'Update completed.')
      setUpdateResult({ status, message })
    } catch (e) {
      const msg = (e instanceof Error) ? e.message : String(e)
      setUpdateResult({ status: 'error', message: msg })
    } finally {
      setUpdateBusy(false)
    }
  }

  async function downloadDb() {
    try {
      const res = await fetch('/api/admin/backup/zip', { credentials: 'include' })
      if (!res.ok) {
        const ct = res.headers.get('content-type') || ''
        let detail = ''
        try {
          if (ct.includes('application/json')) {
            const j = await res.json()
            detail = (j && (j.error || j.message)) ? (j.error || j.message) : JSON.stringify(j)
          } else {
            detail = await res.text()
          }
        } catch {}
        const msg = `HTTP ${res.status} ${res.statusText}` + (detail ? ` - ${detail}` : '')
        throw new Error(msg)
      }
      const blob = await res.blob()
      const disp = res.headers.get('Content-Disposition') || ''
      const match = /filename=\"?([^\";]+)\"?/i.exec(disp)
      const filename = match?.[1] || 'punters-backup.zip'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      const msg = (e instanceof Error) ? e.message : String(e)
      alert(`Failed to download backup: ${msg}`)
    }
  }

  async function restoreDb() {
    if (!file) { alert('Choose a .db file first'); return }
    if (!confirm('Restore database from selected file? This will overwrite current data.')) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/restore/db', { method: 'POST', body: fd, credentials: 'include' })
      if (!res.ok) {
        const msg = await res.text().catch(()=> '')
        throw new Error(msg || 'Restore failed')
      }
      alert('Restore completed. The app will reload to apply changes.')
      window.location.reload()
    } catch (e) {
      alert('Failed to restore backup')
    } finally {
      setBusy(false)
    }
  }

  const updateColor = updateResult?.status === 'error'
    ? 'text-red-600'
    : updateResult?.status === 'updated'
      ? 'text-green-600'
      : updateResult?.status === 'already-up-to-date'
        ? 'text-green-500'
        : 'text-neutral-500'

  return (
    <div className="space-y-4 text-sm">
      <div className="p-3 rounded border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/40">
        <div className="font-semibold mb-2">System Update</div>
        <div className="opacity-80 mb-2">Pull the latest code from GitHub without leaving the display.</div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            onClick={runUpdate}
            disabled={updateBusy}
            className={`px-3 py-1.5 rounded bg-blue-600 text-white border border-blue-700 shadow ${updateBusy ? 'opacity-80 cursor-not-allowed' : ''}`}
          >
            {updateBusy ? 'Updating…' : 'Check & Update'}
          </button>
          <span className={`text-sm ${updateColor}`}>
            {updateResult?.message || 'Idle — click update to check for changes.'}
          </span>
        </div>
      </div>
      <div className="p-3 rounded border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/40">
        <div className="font-semibold mb-2">Download Backup</div>
        <div className="opacity-80 mb-2">Export the entire database (SQLite) as a .db file.</div>
        <LoadingButton onClick={downloadDb} className="px-3 py-1.5 rounded bg-blue-600 text-white">Download Database</LoadingButton>
      </div>
      <div className="p-3 rounded border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/40">
        <div className="font-semibold mb-2">Restore Backup</div>
        <div className="opacity-80 mb-2">Upload a previously downloaded .db file to restore. This will overwrite current data.</div>
        <input type="file" accept=".db,application/octet-stream" onChange={e=>setFile(e.target.files?.[0] || null)} className="mb-2" />
        <LoadingButton onClick={restoreDb} className={`px-3 py-1.5 rounded bg-red-700 text-white ${busy?'opacity-80 cursor-not-allowed':''}`}>Restore Database</LoadingButton>
      </div>
    </div>
  )
}
