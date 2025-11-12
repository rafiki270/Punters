import React from 'react'

type Price = { amountMinor: number; currency: string; size?: { name?: string; volumeMl?: number; displayOrder?: number } }
type Beer = { id: number; name: string; brewery: string; style: string; abv?: number|null; badgeAssetId?: number|null; prices: Price[]; colorHex?: string|null }

export function BeerCell({
  tapNumber,
  status,
  beer,
  factor,
  contentBase,
  defaultSizeId,
  formatMoney,
}: {
  tapNumber: number;
  status: string;
  beer: Beer;
  factor: number;
  contentBase: string;
  defaultSizeId: number|null|undefined;
  formatMoney: (amountMinor: number, currency?: string) => string;
}) {
  const imgPx = Math.round(64 * factor)
  const titlePx = Math.round(20 * factor)
  const subPx = Math.round(14 * factor)
  const padY = Math.round(12 * factor)
  const isKicked = (status === 'kicked')
  const strikeCls = isKicked ? 'line-through opacity-60' : ''

  const prices = (beer.prices || []).slice()
  const defId = defaultSizeId ?? null
  prices.sort((a,b) => ((b.size?.volumeMl ?? 0) - (a.size?.volumeMl ?? 0)) || ((b.size?.displayOrder ?? 0) - (a.size?.displayOrder ?? 0)))
  let defIdx = defId ? prices.findIndex(p=>p.size && defId && p.size && (p as any).serveSizeId===defId) : -1
  if (defIdx === -1 && prices.length) defIdx = 0
  const items = prices.map((p, idx) => ({ p, isDefault: idx === defIdx }))
  items.sort((a,b) => (a.isDefault === b.isDefault) ? 0 : (a.isDefault ? -1 : 1))

  return (
    <div className={`relative flex items-center gap-4 border-b border-neutral-200/40`} style={{ paddingTop: padY, paddingBottom: padY }}>
      <div className={`rounded-full bg-neutral-200 overflow-hidden flex items-center justify-center`} style={{ width: imgPx, height: imgPx }}>
        {beer.badgeAssetId ? (
          <img src={`${contentBase}/api/assets/${beer.badgeAssetId}/content`} alt="badge" className="object-contain w-full h-full" />
        ) : (
          <span className="text-sm opacity-60">No image</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-bold truncate flex items-center gap-2 ${strikeCls}`} style={{ fontSize: titlePx }}>
          <span className="opacity-70">{tapNumber} -</span>
          <span className="truncate">{beer.name}</span>
          {beer.colorHex && beer.colorHex !== '#00000000' && (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 512 512">
              <title>Simple Pint Glass Icon</title>
              <path d="M128 64 h256 l-32 384 H160 L128 64 z" fill="none" stroke="#000" strokeWidth={16} strokeLinejoin="round"/>
              <path id="beer-fill" d="M144 80 h224 l-28 352 H172 L144 80 z" fill={beer.colorHex || '#000'} stroke="none"/>
              <path d="M320 80 h32 l-28 352 h-32 l28-352 z" fill="#E6B800" stroke="none" opacity="0.5"/>
              <path d="M128 64 c0 -24 24 -40 48 -40 h160 c24 0 48 16 48 40 v16 h-256 v-16 z" fill="#FFFFFF" stroke="#000" strokeWidth={16} strokeLinejoin="round"/>
              <rect x="160" y="448" width="192" height="16" fill="#FFFFFF" stroke="#000" strokeWidth={8}/>
            </svg>
          )}
        </div>
        <div className={`truncate opacity-80 ${strikeCls}`} style={{ fontSize: subPx }}>{beer.brewery}</div>
        <div className={`truncate opacity-80 ${strikeCls}`} style={{ fontSize: subPx }}>
          <span>{beer.style}</span>
          {beer.abv != null && <span className={`font-semibold ${strikeCls}`}> • {Number(beer.abv).toFixed(1)}% ABV</span>}
        </div>
      </div>
      <div className="text-right">
        <div className="flex flex-col items-end gap-0.5">
          {items.map(({p,isDefault},i) => (
            <div key={i} className={`${isDefault? 'font-semibold text-lg' : 'text-sm opacity-90'} whitespace-nowrap ${strikeCls}`}>
              {formatMoney(p.amountMinor, p.currency)}{p.size?.name ? ` — ${p.size.name}` : ''}
            </div>
          ))}
        </div>
      </div>
      {isKicked && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="text-red-600 font-extrabold uppercase rounded-2xl border-4 border-red-600" style={{ transform: 'rotate(-12deg)', padding: `${Math.max(6, Math.round(6 * factor))}px ${Math.max(10, Math.round(14 * factor))}px` }}>BEER GONE</div>
        </div>
      )}
    </div>
  )
}

export default BeerCell
