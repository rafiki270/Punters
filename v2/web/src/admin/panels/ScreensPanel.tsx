import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import type { AdminScreen, AdminZone } from '../../types'
import { NumberBox, useToast } from '../../ui/components'

/**
 * Zones = synchronized walls of TVs; screens pair themselves and get claimed here.
 * A device with several outputs runs one browser window per output — each output
 * shows its own pair code and becomes its own screen row.
 */
export function ScreensPanel() {
  const [zones, setZones] = useState<AdminZone[]>([])
  const [screens, setScreens] = useState<AdminScreen[]>([])
  const [toast, show] = useToast()

  const load = useCallback(async () => {
    const [z, s] = await Promise.all([
      api.get<{ zones: AdminZone[] }>('/api/zones'),
      api.get<{ screens: AdminScreen[] }>('/api/screens'),
    ])
    setZones(z.zones)
    setScreens(s.screens)
  }, [])

  useEffect(() => {
    load().catch((e) => show(e.message, true))
    const t = setInterval(load, 15_000) // pick up newly-booted TVs
    return () => clearInterval(t)
  }, [load, show])

  async function run(action: () => Promise<unknown>) {
    try {
      await action()
      await load()
    } catch (e) {
      show((e as Error).message, true)
    }
  }

  const unclaimed = screens.filter((s) => !s.zoneId)
  const claimed = screens.filter((s) => s.zoneId)

  return (
    <div className="admin-page">
      <div className="admin-page-title">
        Screens & zones
        <span className="spacer" />
        <button
          className="btn primary"
          onClick={() => {
            const name = prompt('Zone name (e.g. “Left wall”, “Kitchen”)')?.trim()
            if (name) run(() => api.post('/api/zones', { name }))
          }}
        >
          + New zone
        </button>
      </div>

      {unclaimed.length > 0 && (
        <div className="panel" style={{ borderColor: 'var(--accent)' }}>
          <div className="panel-head">New screens waiting to be claimed</div>
          <table className="table">
            <tbody>
              {unclaimed.map((s) => (
                <tr key={s.id}>
                  <td><span className="chip code">{s.pairCode}</span></td>
                  <td className="muted">{s.width && s.height ? `${s.width}×${s.height}` : 'resolution unknown'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <select
                        className="select"
                        style={{ width: 180 }}
                        defaultValue=""
                        onChange={(e) => {
                          const zoneId = Number(e.target.value)
                          if (!zoneId) return
                          const name = prompt('Screen name', 'New screen')?.trim() || 'Screen'
                          run(() => api.put(`/api/screens/${s.id}`, { zoneId, name }))
                        }}
                      >
                        <option value="">Claim into zone…</option>
                        {zones.map((z) => (
                          <option key={z.id} value={z.id}>{z.name}</option>
                        ))}
                      </select>
                      <button className="btn ghost sm" onClick={() => run(() => api.del(`/api/screens/${s.id}`))}>Dismiss</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {zones.map((zone) => (
        <div className="panel" key={zone.id}>
          <div className="panel-head">
            <input
              className="input"
              style={{ width: 220, fontWeight: 600 }}
              defaultValue={zone.name}
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (name && name !== zone.name) run(() => api.put(`/api/zones/${zone.id}`, { name }))
              }}
            />
            <select
              className="select"
              style={{ width: 210 }}
              value={zone.rotationMode}
              onChange={(e) => run(() => api.put(`/api/zones/${zone.id}`, { rotationMode: e.target.value }))}
            >
              <option value="zone">Rotate in sync (whole zone)</option>
              <option value="screen">Rotate independently</option>
            </select>
            <span className="faint">{zone.pages?.length ?? 0} pages · {claimed.filter((s) => s.zoneId === zone.id).length} screens</span>
            <span className="spacer" />
            <button
              className="btn danger sm"
              onClick={() => {
                if (confirm(`Delete zone “${zone.name}”? Its screens become unassigned.`)) run(() => api.del(`/api/zones/${zone.id}`))
              }}
            >
              Delete zone
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Screen</th>
                <th style={{ width: 110 }}>Output #</th>
                <th style={{ width: 140 }}>Resolution</th>
                <th style={{ width: 140 }}>Last seen</th>
                <th style={{ width: 160 }}>Move to</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {claimed.filter((s) => s.zoneId === zone.id).map((s) => (
                <tr key={s.id}>
                  <td>
                    <input
                      className="input"
                      style={{ width: 180 }}
                      defaultValue={s.name}
                      onBlur={(e) => {
                        const name = e.target.value.trim()
                        if (name && name !== s.name) run(() => api.put(`/api/screens/${s.id}`, { name }))
                      }}
                    />
                  </td>
                  <td><NumberBox value={s.outputIndex} min={1} max={16} onCommit={(v) => run(() => api.put(`/api/screens/${s.id}`, { outputIndex: v }))} /></td>
                  <td className="muted">{s.width && s.height ? `${s.width}×${s.height}` : '—'}</td>
                  <td className="muted">{s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleTimeString() : 'never'}</td>
                  <td>
                    <select
                      className="select"
                      value={zone.id}
                      onChange={(e) => run(() => api.put(`/api/screens/${s.id}`, { zoneId: Number(e.target.value) }))}
                    >
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>{z.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button className="btn ghost sm" onClick={() => run(() => api.del(`/api/screens/${s.id}`))}>✕</button>
                  </td>
                </tr>
              ))}
              {claimed.filter((s) => s.zoneId === zone.id).length === 0 && (
                <tr><td colSpan={6} className="faint">No screens yet — open the display URL on a TV and claim its code above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      {zones.length === 0 && (
        <div className="panel"><div className="panel-body faint">
          Create a zone (a group of TVs that rotate together), then open <code>http://&lt;this-server&gt;:4000/</code> on each TV and claim the code it shows.
        </div></div>
      )}
      {toast}
    </div>
  )
}
