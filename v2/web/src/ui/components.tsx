import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Compact UI primitives. All controls are 28px tall; labels are 11px caps. */

export function Field({ label, children, grow }: { label: string; children: ReactNode; grow?: boolean }) {
  return (
    <div className="field" style={grow ? { flex: 1 } : undefined}>
      <label>{label}</label>
      {children}
    </div>
  )
}

export function Modal({
  title,
  onClose,
  children,
  size = 'md',
  actions,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  size?: 'md' | 'lg'
  actions?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size}`}>
        <div className="modal-head">
          {title}
          <span className="spacer" />
          {actions}
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Toast({ message, error }: { message: string; error?: boolean }) {
  return <div className={`toast${error ? ' err' : ''}`}>{message}</div>
}

/** One-shot toast state helper shared by panels. */
export function useToast(): [ReactNode, (msg: string, error?: boolean) => void] {
  const [state, setState] = useState<{ msg: string; error: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const show = (msg: string, error = false) => {
    setState({ msg, error })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState(null), error ? 5000 : 2200)
  }
  const node = state ? <Toast message={state.msg} error={state.error} /> : null
  return [node, show]
}

export interface TypeaheadOption {
  id: number | string
  label: string
  sub?: string
}

/** Debounced search dropdown; supports a trailing "create" affordance. */
export function Typeahead({
  placeholder,
  search,
  onPick,
  onCreate,
  autoFocus,
}: {
  placeholder: string
  search: (q: string) => Promise<TypeaheadOption[]>
  onPick: (opt: TypeaheadOption) => void
  onCreate?: (q: string) => void
  autoFocus?: boolean
}) {
  const [q, setQ] = useState('')
  const [options, setOptions] = useState<TypeaheadOption[]>([])
  const [open, setOpen] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (!q.trim()) {
      setOptions([])
      return
    }
    const mySeq = ++seq.current
    const t = setTimeout(async () => {
      const res = await search(q.trim()).catch(() => [])
      if (seq.current === mySeq) {
        setOptions(res)
        setOpen(true)
      }
    }, 180)
    return () => clearTimeout(t)
  }, [q, search])

  return (
    <div className="typeahead">
      <input
        className="input"
        placeholder={placeholder}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => options.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (options.length > 0 || (onCreate && q.trim())) && (
        <div className="typeahead-menu">
          {options.map((opt) => (
            <button key={opt.id} onMouseDown={() => { onPick(opt); setQ(''); setOpen(false) }}>
              {opt.label}
              {opt.sub && <span className="sub"> — {opt.sub}</span>}
            </button>
          ))}
          {onCreate && q.trim() && (
            <button onMouseDown={() => { onCreate(q.trim()); setQ(''); setOpen(false) }}>
              + Create “{q.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Numeric input that commits on blur/Enter; keeps typing friction low. */
export function NumberBox({
  value,
  onCommit,
  min,
  max,
  className = 'input w-xs',
}: {
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  className?: string
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    let v = Number(draft)
    if (!Number.isFinite(v)) return setDraft(String(value))
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    if (v !== value) onCommit(v)
    setDraft(String(v))
  }
  return (
    <input
      className={className}
      value={draft}
      inputMode="numeric"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

/** Compact labeled slider — live value shown inline, commits on every drag tick. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="slider-row">
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider-value">{value}{unit}</span>
    </div>
  )
}
