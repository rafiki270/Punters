import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import type { AdminSettings, AdminSize, OrgTheme } from '../../types'
import { Field, NumberBox, useToast } from '../../ui/components'
import { AssetPicker } from '../AssetPicker'
import { KINDS, mergeTheme } from '@punters/shared'
import { OrgCatalog } from '../OrgCatalog'

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

  // themeOverrides is a plain object on the wire (the server stringifies it for storage)
  // even though AdminSettings reports it back as the stored JSON string.
  async function patch(body: Partial<Omit<AdminSettings, 'themeOverrides'>> & { themeOverrides?: OrgTheme | null }) {
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

  const orgTheme: OrgTheme = settings.orgTheme ? JSON.parse(settings.orgTheme) : {}
  const overrides: OrgTheme | null = settings.themeOverrides ? JSON.parse(settings.themeOverrides) : null
  const customizing = !!overrides?.colors
  const effective = mergeTheme(orgTheme, overrides)

  function setCustomPrimary(color: string) {
    patch({ themeOverrides: { ...overrides, colors: { ...effective.colors, primary: color } } })
  }
  function toggleCustomize(on: boolean) {
    if (on) patch({ themeOverrides: { ...overrides, colors: { ...effective.colors } } })
    else patch({ themeOverrides: { ...overrides, colors: undefined } })
  }

  return (
    <div className="admin-page">
      <div className="admin-page-title">Settings</div>

      {settings.orgId && (
        <div className="panel">
          <div className="panel-head">Organisation</div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="form-grid">
              <Field label="Organisation"><div className="input" style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', padding: 0 }}>{settings.orgName}</div></Field>
              <Field label="This venue"><div className="input" style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', padding: 0 }}>{settings.teamName}</div></Field>
            </div>
            <div>
              <label className="check">
                <input type="checkbox" checked={customizing} onChange={(e) => toggleCustomize(e.target.checked)} />
                Customize brand colour for this venue
              </label>
              {customizing ? (
                <div className="form-row" style={{ marginTop: 6 }}>
                  <Field label="Primary colour">
                    <input
                      className="input w-sm"
                      type="color"
                      value={effective.colors?.primary ?? '#f5a524'}
                      onChange={(e) => setCustomPrimary(e.target.value)}
                    />
                  </Field>
                </div>
              ) : (
                <div className="faint" style={{ marginTop: 4 }}>
                  Using the organisation's colour ({orgTheme.colors?.primary ?? 'default'}). Menu items shared from the
                  organisation stay in sync automatically — editing one locally unlinks just that item.
                </div>
              )}
            </div>
            <div>
              <div className="field" style={{ marginBottom: 6 }}><label>Shared menu</label></div>
              <OrgCatalog />
            </div>
          </div>
        </div>
      )}

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
