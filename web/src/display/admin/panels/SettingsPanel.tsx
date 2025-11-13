import { useEffect, useState } from 'react'
import type { Settings, Size } from '../../types'

type SettingsPanelProps = {
  sizes: Size[]
  settings: Settings | null
  onRefresh: () => void
}

export default function SettingsPanel({ sizes, settings, onRefresh }: SettingsPanelProps) {
  const [rotation, setRotation] = useState<number>(settings?.rotationSec ?? 90)
  const [defaultSizeId, setDefaultSizeId] = useState<number | ''>(settings?.defaultSizeId ?? '')
  const [saving, setSaving] = useState(false)
  const [ipInfo, setIpInfo] = useState<{ clientIp: string; serverIps: Array<{ interface: string; address: string; family: string }>; port?: number; hostname?: string; mdnsHost?: string } | null>(null)
  useEffect(() => { if (settings) { setRotation(settings.rotationSec); setDefaultSizeId(settings.defaultSizeId ?? '') } }, [settings])
  useEffect(() => { fetch('/api/ip').then(r=>r.json()).then(setIpInfo).catch(()=>setIpInfo(null)) }, [])
  const originProto = (typeof window !== 'undefined' ? window.location.protocol : 'http:')
  const originPortRaw = (typeof window !== 'undefined' ? window.location.port : '')
  const originIsHttps = originProto === 'https:'
  const originPortNum = originPortRaw ? Number(originPortRaw) : (originIsHttps ? 443 : 80)
  const originPortLabel = (originPortNum && originPortNum !== 80 && originPortNum !== 443) ? `:${originPortNum}` : ''
  const save = async () => {
    if (saving) return
    setSaving(true)
    const minDelay = new Promise<void>(res=>setTimeout(res,1000))
    await Promise.all([
      fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ rotationSec: Number(rotation), defaultSizeId: defaultSizeId || null, themeMode: 'dark', defaultDisplayMode: 'all', currency: settings?.currency || 'GBP', locale: settings?.locale || 'en-GB' }) }),
      minDelay
    ])
    await onRefresh()
    setSaving(false)
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-start-2">
          <label className="block text-sm mb-1">Current IP Address</label>
          <div className="text-sm">
            {ipInfo?.hostname ? (
              <div className="opacity-80">Server hostname: <span className="font-mono">{ipInfo.hostname}</span></div>
            ) : null}
            {ipInfo?.mdnsHost ? (
              <div className="opacity-80">Reachable (mDNS): <span className="font-mono">{ipInfo.mdnsHost}{originPortLabel}</span></div>
            ) : null}
            <div className="opacity-80">Your browser appears as: <span className="font-mono">{ipInfo?.clientIp || '...'}</span></div>
            {ipInfo?.serverIps?.length ? (
              <div className="mt-1 text-xs opacity-80">
                <div className="mb-1">Server interfaces:</div>
                <ul className="space-y-0.5">
                  {ipInfo.serverIps.filter(i=>i.family==='IPv4').map((i, idx) => (
                    <li key={`${i.interface}-${i.address}-${idx}`} className="font-mono">{i.interface}: {i.address}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {(originPortNum !== 80 && originPortNum !== 443) ? (
              <div className="mt-1 text-xs opacity-80">Port: <span className="font-mono">{originPortNum}</span></div>
            ) : null}
          </div>
        </div>
      </div>
      <div>
        <label className="block text-sm mb-1">Rotation (seconds)</label>
        <input type="number" min={5} max={3600} value={rotation} onChange={e=>setRotation(Number(e.target.value))} className="w-40 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
      </div>
      <div>
        <label className="block text-sm mb-1">Default Display Size</label>
        <select value={defaultSizeId} onChange={e=>setDefaultSizeId(e.target.value?Number(e.target.value):'')} className="w-60 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
          <option value="">(none)</option>
          {sizes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Removed legacy Server/Client mode and remote server selection */}
      {/* Display content toggles removed from global Settings; moved to per-screen controls in Arrangements */}
      <button onClick={save} disabled={saving} className={`px-3 py-1.5 rounded bg-green-700 inline-flex items-center gap-2 ${saving?'opacity-80 cursor-not-allowed':''}`}>
        {saving && <span className="inline-block h-4 w-4 border-2 border-neutral-300 border-t-transparent rounded-full animate-spin" />}
        <span>Save</span>
      </button>
    </div>
  )
}
