import BeerCell from '../../components/BeerCell'
import type { Beer } from '../types'

type BeerRow = { tapNumber: number; status: string; beer: Beer }

type Props = {
  rows: BeerRow[]
  hasBeers: boolean
  columns: number
  columnGap: number
  cellScale: number
  paddingTop: number
  contentBase: string
  defaultSizeId: number | null
  formatMoney: (amountMinor: number, currency: string) => string
}

export default function BeerScreen({ rows, hasBeers, columns, columnGap, cellScale, paddingTop, contentBase, defaultSizeId, formatMoney }: Props) {
  if (!hasBeers) {
    return (
      <div className="h-[80vh] flex items-center justify-center text-center" style={{ paddingTop }}>
        <div className="text-3xl font-semibold opacity-70">No beers are set yet</div>
      </div>
    )
  }

  return (
    <div style={{ paddingTop }}>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: `${columnGap}px` }}>
        {rows.map((row) => {
          const factor = 0.7 + (cellScale / 100) * 1.5
          return (
            <BeerCell
              key={row.tapNumber}
              tapNumber={row.tapNumber}
              status={row.status}
              beer={row.beer}
              factor={factor}
              contentBase={contentBase}
              defaultSizeId={defaultSizeId}
              formatMoney={formatMoney}
            />
          )
        })}
      </div>
    </div>
  )
}
