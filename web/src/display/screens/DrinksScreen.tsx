import type { DrinksPage, Size } from '../types'

type Props = {
  page: DrinksPage
  sizes: Size[]
  columns: number
  columnGap: number
  paddingTop: number | string
  paddingBottom: number
  indentPct: number
  cellScale: number
  contentBase: string
  formatMoney: (amountMinor: number, currency: string) => string
}

export default function DrinksScreen({ page, sizes, columns, columnGap, paddingTop, paddingBottom, indentPct, cellScale, contentBase, formatMoney }: Props) {
  const sizeMap = new Map<number, Size>()
  sizes.forEach((s) => sizeMap.set(s.id, s))
  const headerSize = Math.max(18, Math.round(30 * (cellScale / 50)))
  const bodySize = Math.max(14, Math.round(20 * (cellScale / 50)))
  const metaSize = Math.max(10, Math.round(12 * (cellScale / 50)))
  const indentWidth = `${indentPct}%`
  const indentPadding = `calc(${indentPct}% + 18px)`

  return (
    <div className="px-6 py-6 overflow-auto" style={{ paddingTop, paddingBottom }}>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: `${columnGap}px` }}>
        {page.columns.map((col, ci) => (
          <div key={`col-${ci}`} className="space-y-2">
            {col.map((entry, idx) => {
              if (entry.kind === 'header') {
                return (
                  <div key={`hdr-${ci}-${idx}`} className="font-bold mt-2" style={{ fontSize: headerSize }}>
                    {entry.name}
                  </div>
                )
              }

              const drink = entry.drink
              const hasLogo = !!drink.logoAssetId
              const infoLines = buildInfoLines(drink)

              if (hasLogo) {
                return (
                  <div key={`itm-${ci}-${idx}`} className="mb-3 border-b border-neutral-800/40 pb-1 flex gap-3">
                    <div className="shrink-0" style={{ width: indentWidth }}>
                      <div className="w-[58px] h-[58px] rounded bg-neutral-900/60 border border-neutral-800 flex items-center justify-center overflow-hidden">
                        <img src={`${contentBase}/api/assets/${drink.logoAssetId}/content`} alt={drink.name} className="object-contain max-h-full max-w-full" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate" style={{ fontSize: bodySize }}>{drink.name}</div>
                      {infoLines.length > 0 && (
                        <div className="opacity-80 truncate" style={{ fontSize: metaSize }}>{infoLines.join(' • ')}</div>
                      )}
                      {drink.description && (
                        <div className="opacity-80 whitespace-pre-wrap mt-0.5" style={{ fontSize: metaSize }}>{drink.description}</div>
                      )}
                      {renderPrices(drink.prices || [], sizeMap, formatMoney, metaSize)}
                    </div>
                  </div>
                )
              }

              return (
                <div key={`itm-${ci}-${idx}`} className="mb-3 border-b border-neutral-800/40 pb-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1" style={{ paddingLeft: indentPadding }}>
                      <div className="font-semibold truncate" style={{ fontSize: bodySize }}>{drink.name}</div>
                      {infoLines.length > 0 && (
                        <div className="opacity-80 truncate" style={{ fontSize: metaSize }}>{infoLines.join(' • ')}</div>
                      )}
                      {drink.description && (
                        <div className="opacity-80 whitespace-pre-wrap mt-0.5" style={{ fontSize: metaSize }}>{drink.description}</div>
                      )}
                    </div>
                    {renderPrices(drink.prices || [], sizeMap, formatMoney, metaSize, true)}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function buildInfoLines(drink: { producer?: string | null; style?: string | null; abv?: number | null; origin?: string | null }) {
  const parts: string[] = []
  if (drink.producer) parts.push(drink.producer)
  if (drink.style) parts.push(drink.style)
  if (drink.abv != null) parts.push(`${drink.abv.toFixed(1)}%`)
  if (drink.origin) parts.push(drink.origin)
  return parts
}

function renderPrices(
  prices: Array<{ serveSizeId: number; amountMinor: number; currency: string }>,
  sizeMap: Map<number, Size>,
  formatMoney: (amountMinor: number, currency: string) => string,
  fontSize: number,
  vertical = false
) {
  if (!prices.length) return null
  return (
    <div className={`flex ${vertical ? 'flex-col' : 'flex-wrap'} gap-x-3 gap-y-1 text-sm`}>
      {prices.map((p, idx) => {
        const size = sizeMap.get(p.serveSizeId)
        return (
          <div key={idx} className="flex items-center text-sm" style={{ fontSize }}>
            {size && <span className="opacity-70">{size.name}</span>}
            {size && <span className="mx-1">-</span>}
            <span className="font-semibold">{formatMoney(p.amountMinor, p.currency)}</span>
          </div>
        )
      })}
    </div>
  )
}
