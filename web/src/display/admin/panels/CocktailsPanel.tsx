import { useCallback, useEffect, useMemo, useState } from 'react'
import LoadingButton from '../components/LoadingButton'

type Cocktail = {
  id: number
  name: string
  ingredients?: string | null
  priceMinor: number
  currency: string
  active: boolean
  imageAssetId?: number | null
}

type FormState = {
  name: string
  ingredients: string
  price: string
  active: boolean
}

type CocktailsPanelProps = {
  currency?: string
  onRefresh: () => void
}

const emptyForm: FormState = {
  name: '',
  ingredients: '',
  price: '',
  active: true,
}

export default function CocktailsPanel({ currency, onRefresh }: CocktailsPanelProps) {
  const [cocktails, setCocktails] = useState<Cocktail[]>([])
  const [form, setForm] = useState<FormState>({ ...emptyForm })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewId, setImagePreviewId] = useState<number | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const list = await fetch('/api/cocktails').then((r) => r.json()).catch(() => [])
    if (Array.isArray(list)) setCocktails(list)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return cocktails
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((c) => (term ? c.name.toLowerCase().includes(term) : true))
  }, [cocktails, search])

  const formatPrice = (valueMinor: number) => {
    const cur = currency || 'GBP'
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format((valueMinor || 0) / 100)
  }

  const priceToMinor = (value: string) => {
    const num = Number(value)
    if (!Number.isFinite(num)) return 0
    return Math.round(num * 100)
  }

  const startCreate = () => {
    setEditingId(null)
    setForm({ ...emptyForm })
    setImageFile(null)
    setImagePreviewId(null)
    setRemoveImage(false)
  }

  const startEdit = (cocktail: Cocktail) => {
    setEditingId(cocktail.id)
    setForm({
      name: cocktail.name,
      ingredients: cocktail.ingredients || '',
      price: ((cocktail.priceMinor || 0) / 100).toString(),
      active: cocktail.active !== false,
    })
    setImageFile(null)
    setImagePreviewId(cocktail.imageAssetId ?? null)
    setRemoveImage(false)
  }

  const submit = async () => {
    if (!form.name.trim()) {
      alert('Cocktail name is required')
      return
    }
    const priceMinor = priceToMinor(form.price)
    if (!Number.isFinite(priceMinor) || priceMinor <= 0) {
      alert('Enter a valid price')
      return
    }
    let uploadedAssetId: number | undefined
    if (imageFile) {
      const fd = new FormData()
      fd.append('file', imageFile)
      fd.append('tag', 'cocktail:image')
      const upload = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!upload.ok) {
        alert('Image upload failed')
        return
      }
      const asset = await upload.json()
      uploadedAssetId = asset?.id
    }
    const ingredients = form.ingredients.trim()
    const payload: any = {
      name: form.name.trim(),
      ingredients: ingredients ? ingredients : undefined,
      priceMinor,
      active: form.active !== false,
    }
    if (typeof uploadedAssetId === 'number') payload.imageAssetId = uploadedAssetId
    else if (removeImage) payload.imageAssetId = null
    const method = editingId == null ? 'POST' : 'PUT'
    const url = editingId == null ? '/api/cocktails' : `/api/cocktails/${editingId}`
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      alert('Failed to save cocktail')
      return
    }
    await load()
    await onRefresh()
    startCreate()
  }

  const toggleActive = async (cocktail: Cocktail) => {
    await fetch(`/api/cocktails/${cocktail.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !cocktail.active }),
    })
    await load()
    await onRefresh()
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Cocktails</h3>
          <button onClick={startCreate} className="px-3 py-1.5 rounded bg-neutral-700 text-white text-sm">New</button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
        />
        <div className="border border-neutral-300 dark:border-neutral-800 rounded divide-y divide-neutral-200 dark:divide-neutral-800 max-h-[70vh] overflow-auto">
          {filtered.map((cocktail) => (
            <div key={cocktail.id} className="p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {cocktail.imageAssetId ? (
                  <img
                    src={`/api/assets/${cocktail.imageAssetId}/content`}
                    alt={cocktail.name}
                    className="h-10 w-10 rounded object-cover border border-neutral-300 dark:border-neutral-700"
                  />
                ) : (
                  <div className="h-10 w-10 rounded border border-dashed border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-xs text-neutral-500">
                    Img
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-semibold truncate">
                    {cocktail.name}
                    {!cocktail.active && <span className="ml-2 text-xs px-1 py-0.5 rounded bg-amber-200 text-amber-900">Disabled</span>}
                  </div>
                  <div className="text-xs opacity-70 truncate">{formatPrice(cocktail.priceMinor)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(cocktail)}
                  className="p-2 rounded bg-neutral-200 text-neutral-900 text-xs dark:bg-neutral-700 dark:text-neutral-100"
                  title="Edit cocktail"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(cocktail)}
                  className={`p-2 rounded text-xs ${cocktail.active ? 'bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100' : 'bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-100'}`}
                  title={cocktail.active ? 'Disable' : 'Enable'}
                >
                  {cocktail.active ? '🚫' : '✅'}
                </button>
              </div>
            </div>
          ))}
          {!filtered.length && (
            <div className="p-4 text-sm text-center text-neutral-500">No cocktails yet.</div>
          )}
        </div>
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">{editingId == null ? 'Create Cocktail' : `Edit ${form.name || 'Cocktail'}`}</h3>
        <div className="space-y-3">
          <label className="block text-sm font-medium">
            Name
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
            />
          </label>
          <label className="block text-sm font-medium">
            Ingredients (free text)
            <textarea
              value={form.ingredients}
              onChange={(e) => setForm((prev) => ({ ...prev, ingredients: e.target.value }))}
              rows={4}
              className="mt-1 w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
            />
          </label>
          <label className="block text-sm font-medium">
            Price ({currency || 'GBP'})
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
            />
            Active
          </label>
          <div className="space-y-2 border rounded border-neutral-300 dark:border-neutral-800 p-3">
            <div className="font-semibold text-sm">Image (optional)</div>
            {imagePreviewId && !removeImage && (
              <div className="flex items-center gap-3">
                <img
                  src={`/api/assets/${imagePreviewId}/content`}
                  alt="Cocktail"
                  className="h-16 w-16 object-cover rounded border border-neutral-300 dark:border-neutral-700"
                />
                <button
                  type="button"
                  onClick={() => {
                    setRemoveImage(true)
                    setImagePreviewId(null)
                    setImageFile(null)
                  }}
                  className="px-2 py-1 rounded bg-neutral-200 text-neutral-900 text-xs dark:bg-neutral-700 dark:text-neutral-100"
                >
                  Remove
                </button>
              </div>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => {
                setImageFile(e.target.files?.[0] ?? null)
                setRemoveImage(false)
                ;(e.target as HTMLInputElement).value = ''
              }}
              className="block w-full text-sm text-neutral-900 dark:text-neutral-100 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 dark:file:bg-neutral-700 dark:hover:file:bg-neutral-600"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LoadingButton onClick={submit} className="px-4 py-1.5 rounded bg-green-700 text-white">
            {editingId == null ? 'Create Cocktail' : 'Save Changes'}
          </LoadingButton>
          {editingId != null && (
            <button onClick={startCreate} className="px-4 py-1.5 rounded bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
