import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  getTemplate,
  KINDS,
  type SlotConfig,
  type TemplateSpec,
  type TemplateSlot,
  type ItemKind,
} from '@punters/shared'
import { api } from '../../api'
import type { AdminItem, AdminPage, AdminZone } from '../../types'
import { Field, Modal, NumberBox, Slider, Typeahead, useToast } from '../../ui/components'
import { AssetPicker } from '../AssetPicker'

/** Playlist per zone: pick templates from the gallery, tune each slot, reorder. */
export function PagesPanel() {
  const [zones, setZones] = useState<AdminZone[]>([])
  const [zoneId, setZoneId] = useState<number | null>(null)
  const [gallery, setGallery] = useState(false)
  const [editing, setEditing] = useState<AdminPage | null>(null)
  const [toast, show] = useToast()

  const load = useCallback(async () => {
    const res = await api.get<{ zones: AdminZone[] }>('/api/zones')
    setZones(res.zones)
    setZoneId((cur) => cur ?? res.zones[0]?.id ?? null)
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

  const zone = zones.find((z) => z.id === zoneId) ?? null
  const pages = zone?.pages ?? []

  function move(page: AdminPage, dir: -1 | 1) {
    const ids = pages.map((p) => p.id)
    const i = ids.indexOf(page.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    run(() => api.post(`/api/zones/${zone!.id}/pages/reorder`, { ids }))
  }

  return (
    <div className="admin-page">
      <div className="admin-page-title">
        Pages
        <select className="select" style={{ width: 200 }} value={zoneId ?? ''} onChange={(e) => setZoneId(Number(e.target.value))}>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
        <span className="spacer" />
        <button className="btn primary" disabled={!zone} onClick={() => setGallery(true)}>+ Add page</button>
      </div>

      {!zone && <div className="panel"><div className="panel-body faint">Create a zone under Screens first.</div></div>}

      {zone && (
        <div className="panel">
          {pages.map((page) => {
            const template = getTemplate(page.templateId)
            return (
              <div className="page-row" key={page.id}>
                <div className="order-btns">
                  <button onClick={() => move(page, -1)}>▲</button>
                  <button onClick={() => move(page, 1)}>▼</button>
                </div>
                <div className="mini-preview">{template && <TemplatePreview template={template} />}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{page.name}</strong>
                  <div className="faint">{template?.name ?? page.templateId}</div>
                </div>
                <span className="faint">shows for</span>
                <NumberBox value={page.durationSec} min={3} max={3600} onCommit={(v) => run(() => api.put(`/api/pages/${page.id}`, { durationSec: v }))} />
                <span className="faint">s</span>
                <label className="check">
                  <input type="checkbox" checked={page.active} onChange={(e) => run(() => api.put(`/api/pages/${page.id}`, { active: e.target.checked }))} />
                  live
                </label>
                <button className="btn sm" onClick={() => setEditing(page)}>Configure</button>
                <button
                  className="btn ghost sm"
                  onClick={() => confirm(`Remove page “${page.name}”?`) && run(() => api.del(`/api/pages/${page.id}`))}
                >
                  ✕
                </button>
              </div>
            )
          })}
          {pages.length === 0 && <div className="panel-body faint">No pages yet — add one from the template gallery.</div>}
        </div>
      )}

      {gallery && zone && (
        <TemplateGallery
          onPick={(tpl) => {
            setGallery(false)
            run(() => api.post(`/api/zones/${zone.id}/pages`, { templateId: tpl.id }))
          }}
          onClose={() => setGallery(false)}
        />
      )}

      {editing && (
        <PageConfigEditor
          page={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
            show('Page saved')
          }}
          onError={(m) => show(m, true)}
        />
      )}
      {toast}
    </div>
  )
}

/** Mini wireframe rendered straight from the grid spec — the gallery needs no images. */
export function TemplatePreview({ template }: { template: TemplateSpec }) {
  const slotByArea = new Map(template.slots.map((s) => [s.area, s.kind]))
  const areas = template.grid.areas.map((r) => `"${r}"`).join(' ')
  return (
    <div
      className="tpl-preview"
      style={{
        // Fixed px tracks are meaningless at thumbnail scale; show them as fractions.
        gridTemplateColumns: template.grid.columns.replace(/\d+px/g, '1fr'),
        gridTemplateRows: template.grid.rows.replace(/\d+px/g, '1fr'),
        gridTemplateAreas: areas,
      }}
    >
      {template.slots.map((s) => (
        <div key={s.id} className={`cell ${slotByArea.get(s.area) ?? ''}`} style={{ gridArea: s.area }} />
      ))}
    </div>
  )
}

function TemplateGallery({ onPick, onClose }: { onPick: (tpl: TemplateSpec) => void; onClose: () => void }) {
  const [category, setCategory] = useState<string>('all')
  const visible = TEMPLATES.filter((t) => category === 'all' || t.category === category)
  return (
    <Modal title="Choose a page template" onClose={onClose} size="lg">
      <div className="tabs" style={{ marginBottom: 10 }}>
        <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>All {TEMPLATES.length}</button>
        {TEMPLATE_CATEGORIES.map((c) => (
          <button key={c.id} className={category === c.id ? 'active' : ''} onClick={() => setCategory(c.id)}>{c.label}</button>
        ))}
      </div>
      <div className="tpl-gallery">
        {visible.map((tpl) => (
          <button key={tpl.id} className="tpl-card" onClick={() => onPick(tpl)}>
            <TemplatePreview template={tpl} />
            <div className="tpl-name">{tpl.name}</div>
            <div className="tpl-desc">{tpl.description}</div>
          </button>
        ))}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- config editor

function PageConfigEditor({
  page,
  onClose,
  onSaved,
  onError,
}: {
  page: AdminPage
  onClose: () => void
  onSaved: () => void
  onError: (message: string) => void
}) {
  const template = getTemplate(page.templateId)
  const [name, setName] = useState(page.name)
  const [config, setConfig] = useState<Record<string, SlotConfig>>(() => {
    try {
      return JSON.parse(page.config)
    } catch {
      return {}
    }
  })

  if (!template) return null

  function patchSlot(slotId: string, patch: SlotConfig) {
    setConfig((c) => ({ ...c, [slotId]: { ...c[slotId], ...patch } }))
  }

  async function save() {
    try {
      await api.put(`/api/pages/${page.id}`, { name: name.trim() || template!.name, config })
      onSaved()
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <Modal
      title={`Configure — ${template.name}`}
      onClose={onClose}
      size="lg"
      actions={<button className="btn primary sm" onClick={save}>Save page</button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="form-row">
          <Field label="Page name" grow><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        </div>
        {template.slots.map((slot) => (
          <SlotEditor
            key={slot.id}
            slot={slot}
            config={{ ...slot.defaults, ...config[slot.id] }}
            onPatch={(patch) => patchSlot(slot.id, patch)}
          />
        ))}
      </div>
    </Modal>
  )
}

/** Shared by the image and ads slot editors: a toggle, and a radius slider that only
 * appears once rounding is on. */
function RoundedCornersField({ config, onPatch }: { config: SlotConfig; onPatch: (p: SlotConfig) => void }) {
  const rounded = config.roundedCorners ?? true
  return (
    <div className="form-row">
      <label className="check">
        <input type="checkbox" checked={rounded} onChange={(e) => onPatch({ roundedCorners: e.target.checked })} />
        Rounded corners
      </label>
      {rounded && (
        <Field label="Corner radius" grow>
          <Slider value={config.cornerRadius ?? 12} min={0} max={80} unit="px" onChange={(v) => onPatch({ cornerRadius: v })} />
        </Field>
      )}
    </div>
  )
}

function SlotEditor({ slot, config, onPatch }: { slot: TemplateSlot; config: SlotConfig; onPatch: (p: SlotConfig) => void }) {
  const [picking, setPicking] = useState(false)

  const searchItems = useMemo(
    () => async (q: string) => {
      const res = await api.get<{ items: AdminItem[] }>(`/api/items?q=${encodeURIComponent(q)}`)
      return res.items.map((i) => ({ id: i.id, label: i.name, sub: i.kind }))
    },
    [],
  )

  const body = (() => {
    switch (slot.kind) {
      case 'menu': {
        const source = config.source ?? {}
        const kinds = new Set<ItemKind>(source.kinds ?? [])
        return (
          <>
            <div className="form-row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!source.tapsOnly}
                  onChange={(e) => onPatch({ source: { ...source, tapsOnly: e.target.checked } })}
                />
                On-tap only
              </label>
              {!source.tapsOnly &&
                KINDS.map((k) => (
                  <label className="check" key={k.kind}>
                    <input
                      type="checkbox"
                      checked={kinds.has(k.kind)}
                      onChange={(e) => {
                        const next = new Set(kinds)
                        if (e.target.checked) next.add(k.kind)
                        else next.delete(k.kind)
                        onPatch({ source: { ...source, kinds: [...next] } })
                      }}
                    />
                    {k.plural}
                  </label>
                ))}
            </div>
            <div className="form-row">
              <Field label="Title"><input className="input" style={{ width: 160 }} value={config.title ?? ''} onChange={(e) => onPatch({ title: e.target.value || undefined })} /></Field>
              <Field label="Columns"><NumberBox value={config.columns ?? 1} min={1} max={6} onCommit={(v) => onPatch({ columns: v })} /></Field>
              <Field label="Min row px"><NumberBox value={config.minRow ?? 40} min={16} max={400} onCommit={(v) => onPatch({ minRow: v })} /></Field>
              <Field label="Max row px"><NumberBox value={config.maxRow ?? 96} min={16} max={600} onCommit={(v) => onPatch({ maxRow: v })} /></Field>
              <Field label="Style">
                <select className="select" style={{ width: 90 }} value={config.style ?? 'row'} onChange={(e) => onPatch({ style: e.target.value as 'row' | 'card' })}>
                  <option value="row">Rows</option>
                  <option value="card">Cards</option>
                </select>
              </Field>
            </div>
            <div className="form-row">
              {(
                [
                  ['showPrices', 'Prices'],
                  ['showTapNumbers', 'Tap numbers'],
                  ['showBadges', 'Badges & dietary'],
                  ['groupByCategory', 'Group by category'],
                ] as const
              ).map(([key, label]) => (
                <label className="check" key={key}>
                  <input type="checkbox" checked={!!config[key]} onChange={(e) => onPatch({ [key]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
          </>
        )
      }
      case 'image':
        return (
          <>
            <div className="form-row">
              <button className="btn sm" onClick={() => setPicking(true)}>{config.assetId ? `Image #${config.assetId} · change` : 'Choose image…'}</button>
              <Field label="Fit">
                <select className="select" style={{ width: 100 }} value={config.fit ?? 'cover'} onChange={(e) => onPatch({ fit: e.target.value as 'cover' | 'contain' })}>
                  <option value="cover">Fill</option>
                  <option value="contain">Fit</option>
                </select>
              </Field>
            </div>
            <RoundedCornersField config={config} onPatch={onPatch} />
            {picking && <AssetPicker purpose="media" onPick={(id) => { onPatch({ assetId: id }); setPicking(false) }} onClose={() => setPicking(false)} />}
          </>
        )
      case 'ads':
        return (
          <>
            <div className="form-row">
              <Field label="Only media tagged"><input className="input" style={{ width: 140 }} placeholder="(all media)" value={config.tag ?? ''} onChange={(e) => onPatch({ tag: e.target.value || undefined })} /></Field>
              <Field label="Seconds per image"><NumberBox value={config.intervalSec ?? 8} min={3} max={120} onCommit={(v) => onPatch({ intervalSec: v })} /></Field>
              <Field label="Fit">
                <select className="select" style={{ width: 100 }} value={config.fit ?? 'cover'} onChange={(e) => onPatch({ fit: e.target.value as 'cover' | 'contain' })}>
                  <option value="cover">Fill</option>
                  <option value="contain">Fit</option>
                </select>
              </Field>
            </div>
            <RoundedCornersField config={config} onPatch={onPatch} />
          </>
        )
      case 'text':
        return (
          <>
            <div className="form-row">
              <Field label="Title" grow><input className="input" value={config.title ?? ''} onChange={(e) => onPatch({ title: e.target.value || undefined })} /></Field>
              <Field label="Size">
                <select className="select" style={{ width: 90 }} value={config.size ?? 'lg'} onChange={(e) => onPatch({ size: e.target.value as 'md' | 'lg' | 'xl' })}>
                  <option value="md">Medium</option>
                  <option value="lg">Large</option>
                  <option value="xl">Huge</option>
                </select>
              </Field>
              <Field label="Align">
                <select className="select" style={{ width: 90 }} value={config.align ?? 'center'} onChange={(e) => onPatch({ align: e.target.value as 'left' | 'center' })}>
                  <option value="center">Center</option>
                  <option value="left">Left</option>
                </select>
              </Field>
            </div>
            <Field label="Body"><textarea className="input" rows={2} value={config.body ?? ''} onChange={(e) => onPatch({ body: e.target.value || undefined })} /></Field>
          </>
        )
      case 'featured':
        return (
          <div className="form-row">
            <Field label="Item" grow>
              <Typeahead placeholder={config.itemId ? `Item #${config.itemId} — search to change` : 'Search the menu…'} search={searchItems} onPick={(opt) => onPatch({ itemId: Number(opt.id) })} />
            </Field>
            <Field label="Tagline"><input className="input" style={{ width: 180 }} placeholder="Chef's special" value={config.tagline ?? ''} onChange={(e) => onPatch({ tagline: e.target.value || undefined })} /></Field>
          </div>
        )
      case 'ticker':
        return <Field label="Ticker text"><input className="input" value={config.text ?? ''} onChange={(e) => onPatch({ text: e.target.value || undefined })} /></Field>
      default:
        return <div className="faint">Uses venue branding from Settings — nothing to configure.</div>
    }
  })()

  return (
    <div className="slot-editor">
      <div className="slot-editor-head">{slot.label}</div>
      {body}
    </div>
  )
}
