import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import type { AdminItem, AdminTap } from '../../types'
import { NumberBox, Typeahead, useToast } from '../../ui/components'

/** The v1 taps workflow: count, typeahead assign (or inline create), clear/kick/toggle. */
export function TapsPanel() {
  const [taps, setTaps] = useState<AdminTap[]>([])
  const [assigning, setAssigning] = useState<number | null>(null)
  const [toast, show] = useToast()

  const load = useCallback(async () => {
    const res = await api.get<{ taps: AdminTap[] }>('/api/taps')
    setTaps(res.taps)
  }, [])

  useEffect(() => {
    load().catch((e) => show(e.message, true))
  }, [load, show])

  async function run(action: () => Promise<unknown>) {
    try {
      await action()
      await load()
    } catch (e) {
      show((e as Error).message, true)
    }
  }

  const searchTappable = useCallback(async (q: string) => {
    const res = await api.get<{ items: AdminItem[] }>(`/api/items?tappable=true&q=${encodeURIComponent(q)}`)
    return res.items.map((i) => ({
      id: i.id,
      label: i.name,
      sub: [i.producer, i.style, i.abv != null ? `${i.abv}%` : null].filter(Boolean).join(' · '),
    }))
  }, [])

  return (
    <div className="admin-page">
      <div className="admin-page-title">
        Taps
        <span className="spacer" />
        <span className="faint">Number of taps</span>
        <NumberBox
          value={taps.length}
          min={0}
          max={200}
          onCommit={(count) => run(() => api.post('/api/taps/count', { count }))}
        />
      </div>

      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Pouring</th>
              <th style={{ width: 80 }}>Status</th>
              <th style={{ width: 330 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {taps.map((tap) => (
              <tr key={tap.number}>
                <td><strong>{tap.number}</strong></td>
                <td>
                  {assigning === tap.number ? (
                    <Typeahead
                      autoFocus
                      placeholder="Search beers & ciders…"
                      search={searchTappable}
                      onPick={(opt) => {
                        setAssigning(null)
                        run(() => api.post(`/api/taps/${tap.number}/assign`, { itemId: Number(opt.id) }))
                      }}
                      onCreate={(name) => {
                        setAssigning(null)
                        run(() => api.post(`/api/taps/${tap.number}/assign`, { item: { kind: 'beer', name } }))
                      }}
                    />
                  ) : tap.item ? (
                    <>
                      <strong>{tap.item.name}</strong>
                      <span className="muted">
                        {' '}
                        {[tap.item.producer, tap.item.style, tap.item.abv != null ? `${tap.item.abv}%` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </>
                  ) : (
                    <span className="faint">empty</span>
                  )}
                </td>
                <td>
                  <span className={`chip ${tap.status === 'on' ? 'on' : tap.status === 'kicked' ? 'warn' : 'off'}`}>
                    {tap.status}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn sm" onClick={() => setAssigning(assigning === tap.number ? null : tap.number)}>
                      {tap.item ? 'Swap' : 'Assign'}
                    </button>
                    <button className="btn sm" disabled={!tap.item} onClick={() => run(() => api.post(`/api/taps/${tap.number}/clear`))}>
                      Clear
                    </button>
                    <button className="btn sm" disabled={!tap.item} onClick={() => run(() => api.post(`/api/taps/${tap.number}/kick`))}>
                      Kicked
                    </button>
                    <button
                      className="btn sm"
                      onClick={() => run(() => api.post(`/api/taps/${tap.number}/status`, { status: tap.status === 'off' ? 'on' : 'off' }))}
                    >
                      {tap.status === 'off' ? 'Turn on' : 'Turn off'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {taps.length === 0 && (
              <tr>
                <td colSpan={4} className="faint">Set the number of taps above to get started.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {toast}
    </div>
  )
}
