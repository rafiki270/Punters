import { useCallback, useEffect, useRef, useState } from 'react'
import { api, uploadMedia } from '../api'
import type { AdminAsset } from '../types'
import { Modal } from '../ui/components'

/** Pick an existing optimized asset or upload a new one in place. */
export function AssetPicker({
  purpose,
  onPick,
  onClose,
}: {
  purpose: string
  onPick: (assetId: number) => void
  onClose: () => void
}) {
  const [assets, setAssets] = useState<AdminAsset[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    // Show same-purpose assets first but keep everything reachable.
    const res = await api.get<{ assets: AdminAsset[] }>('/api/media')
    res.assets.sort((a, b) => Number(b.purpose === purpose) - Number(a.purpose === purpose))
    setAssets(res.assets)
  }, [purpose])

  useEffect(() => {
    load().catch((e) => setError(e.message))
  }, [load])

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    try {
      const res = await uploadMedia(files[0], purpose)
      onPick(res.asset.id)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Choose image"
      onClose={onClose}
      size="lg"
      actions={
        <>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onFiles(e.target.files)} />
          <button className="btn primary sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Optimizing…' : 'Upload new'}
          </button>
        </>
      }
    >
      {error && <div className="error-text" style={{ marginBottom: 8 }}>{error}</div>}
      <div className="media-grid">
        {assets.map((a) => (
          <div key={a.id} className="media-card selectable" onClick={() => onPick(a.id)}>
            <img src={a.urls.thumb} alt={a.originalName} loading="lazy" />
            <div className="media-meta">
              <span className="media-name">{a.originalName}</span>
              <span className="faint">{a.width}×{a.height}</span>
            </div>
          </div>
        ))}
        {assets.length === 0 && <div className="faint">No images yet — upload one.</div>}
      </div>
    </Modal>
  )
}
