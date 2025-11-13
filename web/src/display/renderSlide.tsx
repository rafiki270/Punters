import BeerScreen from './screens/BeerScreen'
import DrinksScreen from './screens/DrinksScreen'
import AdScreen from './screens/AdScreen'
import AdPairScreen from './screens/AdPairScreen'
import type { Slide, Size, TapBeer } from './types'

type SlideRenderProps = {
  cur: Slide | null
  tapBeers: TapBeer[]
  columns: number
  columnGap: number
  cellScale: number
  drinksCellScale: number
  drinksIndentPct: number
  sizes: Size[]
  contentBase: string
  formatMoney: (amountMinor: number, currency?: string) => string
  defaultSizeId: number | null
  curIsFullscreen: boolean
  footPadPx: number
  logoBoxH: number
  logoOnTop: boolean
}

export default function renderSlide({
  cur,
  tapBeers,
  columns,
  columnGap,
  cellScale,
  drinksCellScale,
  drinksIndentPct,
  sizes,
  contentBase,
  formatMoney,
  defaultSizeId,
  curIsFullscreen,
  footPadPx,
  logoBoxH,
  logoOnTop,
}: SlideRenderProps) {
  if (!cur) {
    return <div className="h-[80vh]" style={{ paddingTop: logoOnTop ? logoBoxH : 0 }} />
  }

  const defaultPadTop: number | string = logoOnTop ? logoBoxH : '1.5rem'
  const beerPadTop = logoOnTop ? logoBoxH : 0
  const padX: number | string = '1.5rem'

  if (cur.type === 'beer') {
    return (
      <BeerScreen
        rows={cur.data}
        hasBeers={tapBeers.length > 0}
        columns={columns}
        columnGap={columnGap}
        cellScale={cellScale}
        paddingTop={beerPadTop}
        contentBase={contentBase}
        defaultSizeId={defaultSizeId}
        formatMoney={formatMoney}
      />
    )
  }

  if (cur.type === 'ad') {
    return (
      <AdScreen
        ad={cur.data}
        contentBase={contentBase}
        fullscreen={curIsFullscreen}
        paddingTop={defaultPadTop}
        paddingBottom={footPadPx}
        paddingX={padX}
      />
    )
  }

  if (cur.type === 'drinks') {
    return (
      <DrinksScreen
        page={cur.data}
        sizes={sizes}
        columns={columns}
        columnGap={columnGap}
        paddingTop={defaultPadTop}
        paddingBottom={footPadPx}
        indentPct={drinksIndentPct}
        cellScale={drinksCellScale}
        contentBase={contentBase}
        formatMoney={formatMoney}
      />
    )
  }

  return (
    <AdPairScreen
      ads={cur.data}
      contentBase={contentBase}
      paddingTop={defaultPadTop}
      paddingBottom={footPadPx}
      paddingX={padX}
    />
  )
}
