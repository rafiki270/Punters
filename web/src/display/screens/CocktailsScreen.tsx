import type { CocktailsPage } from '../types'

type Props = {
  page: CocktailsPage
  columns: number
  columnGap: number
  paddingTop: number | string
  paddingBottom: number
  indentPct: number
  cellScale: number
  contentBase: string
  formatMoney: (amountMinor: number, currency: string) => string
}

export default function CocktailsScreen({ page, columns, columnGap, paddingTop, paddingBottom, indentPct, cellScale, contentBase, formatMoney }: Props) {
  const nameSize = Math.max(18, Math.round(28 * (cellScale / 50)))
  const ingredientsSize = Math.max(12, Math.round(16 * (cellScale / 50)))
  const priceSize = Math.max(14, Math.round(20 * (cellScale / 50)))
  const indentWidth = `${indentPct}%`
  const imgBox = Math.max(112, Math.round(140 * (cellScale / 50)))

  return (
    <div className="px-6 py-6 overflow-auto" style={{ paddingTop, paddingBottom }}>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: `${columnGap}px` }}>
        {page.columns.map((col, ci) => (
          <div key={`cocktail-col-${ci}`} className="space-y-3">
            {col.filter(Boolean).map((cocktail, idx) => (
              <div key={`cocktail-${ci}-${idx}`} className="border-b border-neutral-800/40 pb-2 flex items-start gap-[44px]">
                {cocktail?.imageAssetId ? (
                  <div className="shrink-0" style={{ width: indentWidth }}>
                    <div className="rounded bg-neutral-900/60 border border-neutral-800 flex items-center justify-center overflow-hidden" style={{ width: imgBox, height: imgBox }}>
                      <img
                        src={`${contentBase}/api/assets/${cocktail.imageAssetId}/content`}
                        alt={cocktail.name}
                        className="object-cover w-full h-full"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="shrink-0" style={{ width: indentWidth }} />
                )}
                <div className="min-w-0 flex-1" style={{ marginTop: '20px' }}>
                  <div className="font-semibold truncate" style={{ fontSize: nameSize }}>{cocktail?.name}</div>
                  {cocktail?.ingredients && (
                    <div className="opacity-80 whitespace-pre-wrap mt-1" style={{ fontSize: ingredientsSize }}>
                      {cocktail.ingredients}
                    </div>
                  )}
                  <div className="font-semibold mt-1" style={{ fontSize: priceSize }}>
                    {formatMoney(cocktail?.priceMinor || 0, cocktail?.currency || 'GBP')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
