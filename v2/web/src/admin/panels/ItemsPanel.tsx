import { useCallback, useEffect, useMemo, useState } from 'react'
import { KINDS, KIND_META, formatMoney, parseMoney, type ItemKind } from '@punters/shared'
import { api } from '../../api'
import type { AdminCategory, AdminItem, AdminSize } from '../../types'
import { Field, useToast } from '../../ui/components'
import { AssetPicker } from '../AssetPicker'

/**
 * The unified catalog editor: one panel, kind tabs, list left / editor right.
 * Field set and pricing shape follow KIND_META so every venue type fits.
 */
export function ItemsPanel() {
  const [kind, setKind] = useState<ItemKind>('beer')
  const [items, setItems] = useState<AdminItem[]>([])
  const [sizes, setSizes] = useState<AdminSize[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [toast, show] = useToast()

  const meta = KIND_META[kind]
  const kindSizes = useMemo(() => sizes.filter((s) => s.kinds.split(',').includes(kind)), [sizes, kind])
  const kindCategories = useMemo(() => categories.filter((c) => c.kind === kind), [categories, kind])

  const load = useCallback(async () => {
    const [i, s, c] = await Promise.all([
      api.get<{ items: AdminItem[] }>(`/api/items?kind=${kind}`),
      api.get<{ sizes: AdminSize[] }>('/api/sizes'),
      api.get<{ categories: AdminCategory[] }>('/api/categories'),
    ])
    setItems(i.items)
    setSizes(s.sizes)
    setCategories(c.categories)
  }, [kind])

  useEffect(() => {
    load().catch((e) => show(e.message, true))
  }, [load, show])

  const visible = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
  const selected = items.find((i) => i.id === selectedId) ?? null

  return (
    <div className="admin-page">
      <div className="admin-page-title">Menu</div>
      <div className="tabs">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            className={kind === k.kind ? 'active' : ''}
            onClick={() => {
              setKind(k.kind)
              setSelectedId(null)
            }}
          >
            {k.plural}
          </button>
        ))}
      </div>

      <div className="two-col">
        <div className="panel">
          <div className="panel-head">
            <input className="input" placeholder={`Search ${meta.plural.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn primary sm" onClick={() => setSelectedId(0)}>+ New</button>
          </div>
          <div className="list-scroll">
            <table className="table">
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id} className={`clickable${item.id === selectedId ? ' selected' : ''}`} onClick={() => setSelectedId(item.id)}>
                    <td>
                      <div style={{ opacity: item.active ? 1 : 0.45 }}>
                        <strong>{item.name}</strong>
                        <div className="faint">
                          {[item.producer, item.style, item.category?.name, item.abv != null ? `${item.abv}%` : null].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {item.prices[0] && <span className="muted">{formatMoney(item.prices[0].amountMinor, 'GBP')}</span>}
                      {!item.active && <span className="chip off" style={{ marginLeft: 6 }}>hidden</span>}
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td className="faint">No {meta.plural.toLowerCase()} yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selectedId !== null ? (
          <ItemEditor
            key={`${kind}:${selectedId}`}
            kind={kind}
            item={selected}
            sizes={kindSizes}
            categories={kindCategories}
            onSaved={async (id) => {
              await load()
              setSelectedId(id)
              show('Saved')
            }}
            onDeleted={async () => {
              await load()
              setSelectedId(null)
              show('Deleted')
            }}
            onError={(m) => show(m, true)}
          />
        ) : (
          <div className="panel">
            <div className="panel-body faint">Select an item to edit, or create a new one.</div>
          </div>
        )}
      </div>
      {toast}
    </div>
  )
}

function ItemEditor({
  kind,
  item,
  sizes,
  categories,
  onSaved,
  onDeleted,
  onError,
}: {
  kind: ItemKind
  item: AdminItem | null
  sizes: AdminSize[]
  categories: AdminCategory[]
  onSaved: (id: number) => void
  onDeleted: () => void
  onError: (message: string) => void
}) {
  const meta = KIND_META[kind]
  const [name, setName] = useState(item?.name ?? '')
  const [producer, setProducer] = useState(item?.producer ?? '')
  const [style, setStyle] = useState(item?.style ?? '')
  const [abv, setAbv] = useState(item?.abv != null ? String(item.abv) : '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [categoryId, setCategoryId] = useState<number | ''>(item?.categoryId ?? '')
  const [active, setActive] = useState(item?.active ?? true)
  const [flags, setFlags] = useState({
    vegan: item?.vegan ?? false,
    vegetarian: item?.vegetarian ?? false,
    glutenFree: item?.glutenFree ?? false,
    dairyFree: item?.dairyFree ?? false,
  })
  const [spicyLevel, setSpicyLevel] = useState(item?.spicyLevel ?? 0)
  const [imageAssetId, setImageAssetId] = useState<number | null>(item?.imageAssetId ?? null)
  const [badgeAssetId, setBadgeAssetId] = useState<number | null>(item?.badgeAssetId ?? null)
  const [pickerFor, setPickerFor] = useState<'image' | 'badge' | null>(null)

  const initialPrices: Record<string, string> = {}
  for (const p of item?.prices ?? []) {
    initialPrices[p.sizeId == null ? 'single' : String(p.sizeId)] = (p.amountMinor / 100).toFixed(p.amountMinor % 100 === 0 ? 0 : 2)
  }
  const [prices, setPrices] = useState<Record<string, string>>(initialPrices)

  async function save() {
    if (!name.trim()) return onError('Name is required')
    const priceRows = [
      { sizeId: null as number | null, amountMinor: prices['single'] ? parseMoney(prices['single']) : null },
      ...sizes.map((s) => ({
        sizeId: s.id as number | null,
        amountMinor: prices[String(s.id)] ? parseMoney(prices[String(s.id)]) : null,
      })),
    ]
    const payload = {
      kind,
      name: name.trim(),
      producer: producer.trim() || null,
      style: style.trim() || null,
      abv: abv.trim() ? Number(abv) : null,
      description: description.trim() || null,
      categoryId: categoryId === '' ? null : categoryId,
      active,
      ...flags,
      spicyLevel,
      imageAssetId,
      badgeAssetId,
      prices: priceRows,
    }
    try {
      if (item) {
        await api.put(`/api/items/${item.id}`, payload)
        onSaved(item.id)
      } else {
        const res = await api.post<{ item: AdminItem }>('/api/items', payload)
        onSaved(res.item.id)
      }
    } catch (e) {
      onError((e as Error).message)
    }
  }

  async function addCategory() {
    const catName = prompt('New category name')?.trim()
    if (!catName) return
    try {
      const res = await api.post<{ category: AdminCategory }>('/api/categories', { kind, name: catName })
      setCategoryId(res.category.id)
      categories.push(res.category)
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        {item ? `Edit ${meta.label.toLowerCase()}` : `New ${meta.label.toLowerCase()}`}
        <span className="spacer" />
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Visible on displays
        </label>
        {item && (
          <button
            className="btn danger sm"
            onClick={async () => {
              if (!confirm(`Delete “${item.name}” permanently? Use the visibility toggle to just hide it.`)) return
              try {
                await api.del(`/api/items/${item.id}`)
                onDeleted()
              } catch (e) {
                onError((e as Error).message)
              }
            }}
          >
            Delete
          </button>
        )}
        <button className="btn primary sm" onClick={save}>Save</button>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="form-grid">
          <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!item} /></Field>
          {meta.hasProducer && (
            <Field label={kind === 'beer' || kind === 'cider' ? 'Brewery' : 'Producer'}>
              <input className="input" value={producer} onChange={(e) => setProducer(e.target.value)} />
            </Field>
          )}
          {meta.hasStyle && <Field label="Style"><input className="input" value={style} onChange={(e) => setStyle(e.target.value)} /></Field>}
          {meta.hasAbv && <Field label="ABV %"><input className="input" value={abv} inputMode="decimal" onChange={(e) => setAbv(e.target.value)} /></Field>}
          <Field label="Category">
            <div style={{ display: 'flex', gap: 4 }}>
              <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button className="btn sm" style={{ height: 28 }} onClick={addCategory} title="New category">+</button>
            </div>
          </Field>
        </div>

        <Field label={kind === 'cocktail' ? 'Ingredients' : 'Description'}>
          <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        {meta.hasDietary && (
          <div className="form-row">
            {(
              [
                ['vegan', 'Vegan'],
                ['vegetarian', 'Vegetarian'],
                ['glutenFree', 'Gluten-free'],
                ['dairyFree', 'Dairy-free'],
              ] as const
            ).map(([key, label]) => (
              <label className="check" key={key}>
                <input type="checkbox" checked={flags[key]} onChange={(e) => setFlags({ ...flags, [key]: e.target.checked })} />
                {label}
              </label>
            ))}
            <Field label="Spice">
              <select className="select" style={{ width: 90 }} value={spicyLevel} onChange={(e) => setSpicyLevel(Number(e.target.value))}>
                <option value={0}>None</option>
                <option value={1}>🌶</option>
                <option value={2}>🌶🌶</option>
                <option value={3}>🌶🌶🌶</option>
              </select>
            </Field>
          </div>
        )}

        <div>
          <div className="field"><label>Prices</label></div>
          <div className="form-row">
            <Field label="Single price">
              <input className="input w-sm" placeholder="—" value={prices['single'] ?? ''} onChange={(e) => setPrices({ ...prices, single: e.target.value })} />
            </Field>
            {sizes.map((s) => (
              <Field key={s.id} label={s.name}>
                <input
                  className="input w-sm"
                  placeholder="—"
                  value={prices[String(s.id)] ?? ''}
                  onChange={(e) => setPrices({ ...prices, [String(s.id)]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <div className="faint">Fill only what applies — leave blanks empty. Sizes are managed in Settings.</div>
        </div>

        <div className="form-row">
          <Field label="Photo">
            <button className="btn sm" onClick={() => setPickerFor('image')}>{imageAssetId ? `#${imageAssetId} · change` : 'Choose…'}</button>
          </Field>
          {imageAssetId && <button className="btn ghost sm" onClick={() => setImageAssetId(null)}>Remove photo</button>}
          <Field label="Badge / logo">
            <button className="btn sm" onClick={() => setPickerFor('badge')}>{badgeAssetId ? `#${badgeAssetId} · change` : 'Choose…'}</button>
          </Field>
          {badgeAssetId && <button className="btn ghost sm" onClick={() => setBadgeAssetId(null)}>Remove badge</button>}
        </div>
      </div>

      {pickerFor && (
        <AssetPicker
          purpose={pickerFor === 'image' ? 'item' : 'badge'}
          onPick={(id) => {
            if (pickerFor === 'image') setImageAssetId(id)
            else setBadgeAssetId(id)
            setPickerFor(null)
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  )
}
