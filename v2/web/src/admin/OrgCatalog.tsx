import { useCallback, useEffect, useState } from 'react'
import { KINDS, formatMoney, parseMoney, type ItemKind } from '@punters/shared'
import { api } from '../api'
import type { OrgSharedItem } from '../types'
import { Field, useToast } from '../ui/components'

/**
 * Compact "push this to every venue" editor for the organisation-wide shared catalog —
 * see AUTH_ARCHITECTURE.md's sharing model. Every venue's sync loop mirrors what's here
 * within ~20s, unless a venue has locally unlinked its copy of a given item.
 */
export function OrgCatalog() {
  const [items, setItems] = useState<OrgSharedItem[]>([])
  const [editing, setEditing] = useState<OrgSharedItem | 'new' | null>(null)
  const [toast, show] = useToast()

  const load = useCallback(async () => {
    const res = await api.get<{ items: OrgSharedItem[] }>('/api/org/items')
    setItems(res.items)
  }, [])

  useEffect(() => {
    load().catch((e) => show(e.message, true))
  }, [load, show])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="faint">Pushed to every venue in the organisation within ~20 seconds, unless a venue unlinked its copy.</span>
        <span className="spacer" />
        <button className="btn primary sm" onClick={() => setEditing('new')}>+ Add shared item</button>
      </div>
      <table className="table">
        <thead>
          <tr><th>Name</th><th>Kind</th><th style={{ textAlign: 'right' }}>Price</th><th style={{ width: 90 }} /></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="clickable" onClick={() => setEditing(item)}>
              <td><strong>{item.name}</strong>{!item.active && <span className="chip off" style={{ marginLeft: 6 }}>hidden</span>}</td>
              <td className="muted">{item.kind}</td>
              <td style={{ textAlign: 'right' }}>{item.prices[0] && formatMoney(item.prices[0].amountMinor, 'GBP')}</td>
              <td>
                <button
                  className="btn ghost sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Remove “${item.name}” from the shared catalog? Venues that already have it keep their own copy.`)) {
                      api.del(`/api/org/items/${item.id}`).then(load).catch((err) => show(err.message, true))
                    }
                  }}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={4} className="faint">No shared items yet.</td></tr>}
        </tbody>
      </table>
      {editing && (
        <SharedItemForm
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await load()
            show('Saved — venues will pick this up shortly')
          }}
          onError={(m) => show(m, true)}
        />
      )}
      {toast}
    </div>
  )
}

function SharedItemForm({
  item,
  onClose,
  onSaved,
  onError,
}: {
  item: OrgSharedItem | null
  onClose: () => void
  onSaved: () => void
  onError: (m: string) => void
}) {
  const [kind, setKind] = useState<ItemKind>((item?.kind as ItemKind) ?? 'beer')
  const [name, setName] = useState(item?.name ?? '')
  const [price, setPrice] = useState(item?.prices[0] ? (item.prices[0].amountMinor / 100).toFixed(2) : '')
  const [active, setActive] = useState(item?.active ?? true)

  async function save() {
    if (!name.trim()) return onError('Name is required')
    const amountMinor = price.trim() ? parseMoney(price) : null
    const body = { kind, name: name.trim(), active, prices: amountMinor != null ? [{ sizeName: null, amountMinor }] : [] }
    try {
      if (item) await api.put(`/api/org/items/${item.id}`, body)
      else await api.post('/api/org/items', body)
      onSaved()
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <div className="slot-editor">
      <div className="form-row">
        <Field label="Kind">
          <select className="select" style={{ width: 130 }} value={kind} onChange={(e) => setKind(e.target.value as ItemKind)}>
            {KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>{k.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Name" grow><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Price"><input className="input w-sm" placeholder="—" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
        </label>
      </div>
      <div className="form-row">
        <button className="btn primary sm" onClick={save}>Save</button>
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
