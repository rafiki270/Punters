import { useCallback, useEffect, useRef, useState } from 'react'
import { api, uploadMedia } from '../../api'
import type { AdminAsset } from '../../types'
import { useToast } from '../../ui/components'

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

export function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Media library: every upload is optimized to WebP renditions on the server. */
export function MediaPanel() {
  const [assets, setAssets] = useState<AdminAsset[]>([])
  const [busy, setBusy] = useState(false)
  const [toast, show] = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await api.get<{ assets: AdminAsset[] }>('/api/media')
    setAssets(res.assets)
  }, [])

  useEffect(() => {
    load().catch((e) => show(e.message, true))
  }, [load, show])

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        await uploadMedia(file, 'media')
      }
      await load()
      show(`Uploaded ${files.length} file${files.length > 1 ? 's' : ''}`)
    } catch (e) {
      show((e as Error).message, true)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div
      className="admin-page"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onFiles(e.dataTransfer.files)
      }}
    >
      <div className="admin-page-title">
        Media
        <span className="faint">promos & artwork rotate on displays; item photos live here too</span>
        <span className="spacer" />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
        <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Optimizing…' : 'Upload media'}
        </button>
      </div>

      <div className="media-grid">
        {assets.map((a) => (
          <div key={a.id} className="media-card">
            {a.mediaType === 'video' ? (
              a.urls.thumb ? (
                <img src={a.urls.thumb} alt={a.originalName} loading="lazy" />
              ) : (
                <div className="media-video-placeholder" aria-hidden>▶</div>
              )
            ) : (
              <img src={a.urls.thumb} alt={a.originalName} loading="lazy" />
            )}
            <div className="media-meta">
              <span className="media-name" title={a.originalName}>{a.originalName}</span>
              <span className="faint">
                {a.mediaType === 'video'
                  ? `${kb(a.sizeBytes)}${a.durationSec != null ? ` · ${mmss(a.durationSec)}` : ''}`
                  : `${a.width}×${a.height} · ${kb(a.sizeBytes)} → ${kb(a.optimizedBytes)}`}
              </span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span className="chip">{a.purpose}</span>
                {a.mediaType === 'video' && <span className="chip">video</span>}
                <span className="spacer" />
                <button
                  className="btn ghost sm"
                  onClick={async () => {
                    if (!confirm(`Delete ${a.originalName}?`)) return
                    try {
                      await api.del(`/api/media/${a.id}`)
                      await load()
                    } catch (e) {
                      show((e as Error).message, true)
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {assets.length === 0 && <div className="faint">Drop images or videos anywhere on this page, or use Upload.</div>}
      </div>
      {toast}
    </div>
  )
}
