import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import type { AdminSettings, AdminSize } from '../../types'
import { Field, NumberBox, useToast } from '../../ui/components'
import { AssetPicker } from '../AssetPicker'
import { KINDS } from '@punters/shared'

export function SettingsPanel() {
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [sizes, setSizes] = useState<AdminSize[]>([])
  const [picking, setPicking] = useState<'logo' | 'background' | null>(null)
  const [toast, show] = useToast()

  const load = useCallback(async () => {
    const [s, z] = await Promise.all([
      api.get<{ settings: AdminSettings }>('/api/settings'),
      api.get<{ sizes: AdminSize[] }>('/api/sizes'),
    ])
    setSettings(s.settings)
    setSizes(z.sizes)
  }, [])

  useEffect(() => {
    load().catch((e) => show(e.message, true))
  }, [load, show])

  async function patch(body: Partial<AdminSettings>) {
    try {
      const res = await api.put<{ settings: AdminSettings }>('/api/settings', body)
      setSettings(res.settings)
      show('Saved')
    } catch (e) {
      show((e as Error).message, true)
    }
  }

  async function run(action: () => Promise<unknown>) {
    try {
      await action()
      await load()
    } catch (e) {
      show((e as Error).message, true)
    }
  }

  if (!settings) return <div className="admin-page faint">Loading…</div>

  return (
    <div className="admin-page">
      <div className="admin-page-title">Settings</div>

      <div className="panel">
        <div className="panel-head">Venue</div>
        <div className="panel-body form-grid">
          <Field label="Venue name">
            <input className="input" defaultValue={settings.venueName} onBlur={(e) => e.target.value.trim() && e.target.value !== settings.venueName && patch({ venueName: e.target.value.trim() })} />
          </Field>
          <Field label="Currency">
            <select className="select" value={settings.currency} onChange={(e) => patch({ currency: e.target.value })}>
              {['GBP', 'EUR', 'USD', 'AUD', 'CAD', 'NZD', 'CZK', 'PLN', 'SEK', 'NOK', 'DKK', 'CHF'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Locale">
            <input className="input" defaultValue={settings.locale} onBlur={(e) => e.target.value.trim() && patch({ locale: e.target.value.trim() })} />
          </Field>
          <Field label="Display theme">
            <select className="select" value={settings.theme} onChange={(e) => patch({ theme: e.target.value as 'dark' | 'light' })}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">Branding</div>
        <div className="panel-body form-row">
          <Field label="Logo">
            <button className="btn sm" onClick={() => setPicking('logo')}>{settings.logoAssetId ? `#${settings.logoAssetId} · change` : 'Choose…'}</button>
          </Field>
          {settings.logoAssetId && <button className="btn ghost sm" onClick={() => patch({ logoAssetId: null })}>Remove logo</button>}
          <Field label="Background">
            <button className="btn sm" onClick={() => setPicking('background')}>{settings.backgroundAssetId ? `#${settings.backgroundAssetId} · change` : 'Choose…'}</button>
          </Field>
          {settings.backgroundAssetId && <button className="btn ghost sm" onClick={() => patch({ backgroundAssetId: null })}>Remove background</button>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          Serve sizes
          <span className="spacer" />
          <button
            className="btn primary sm"
            onClick={() => {
              const name = prompt('Size name (e.g. Pint, 175ml)')?.trim()
              if (name) run(() => api.post('/api/sizes', { name, displayOrder: sizes.length + 1 }))
            }}
          >
            + Add size
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ width: 90 }}>Order</th>
              <th>Applies to</th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {sizes.map((s) => {
              const applied = new Set(s.kinds.split(',').filter(Boolean))
              return (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong>{s.volumeMl && <span className="faint"> · {s.volumeMl}ml</span>}</td>
                  <td><NumberBox value={s.displayOrder} min={0} max={99} onCommit={(v) => run(() => api.put(`/api/sizes/${s.id}`, { displayOrder: v }))} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {KINDS.filter((k) => k.defaultPricing === 'sizes').map((k) => (
                        <label className="check" key={k.kind}>
                          <input
                            type="checkbox"
                            checked={applied.has(k.kind)}
                            onChange={(e) => {
                              const next = new Set(applied)
                              if (e.target.checked) next.add(k.kind)
                              else next.delete(k.kind)
                              run(() => api.put(`/api/sizes/${s.id}`, { kinds: [...next].join(',') }))
                            }}
                          />
                          {k.plural}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button className="btn ghost sm" onClick={() => confirm(`Delete size “${s.name}” and its prices?`) && run(() => api.del(`/api/sizes/${s.id}`))}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {picking && (
        <AssetPicker
          purpose={picking}
          onPick={(id) => {
            patch(picking === 'logo' ? { logoAssetId: id } : { backgroundAssetId: id })
            setPicking(null)
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {toast}
    </div>
  )
}
