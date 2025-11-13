export type DisplayMode = 'everything' | 'all' | 'beer' | 'drinks' | 'ads'

export function modeFromContentFlags(showBeer: boolean, showDrinks: boolean, showCocktails: boolean, showMedia: boolean): DisplayMode {
  const anyDrinks = showDrinks || showCocktails
  if (showMedia && (showBeer || anyDrinks)) return 'everything'
  if (showMedia && !showBeer && !anyDrinks) return 'ads'
  if (showBeer && anyDrinks) return 'all'
  if (showBeer) return 'beer'
  if (anyDrinks) return 'drinks'
  return 'ads'
}

type SlideType = 'beer' | 'drinks' | 'cocktails' | 'ad' | 'adpair'

export function slideMatchesMode(mode: DisplayMode, slideType: SlideType): boolean {
  if (mode === 'everything') return true
  if (mode === 'all') return slideType === 'beer' || slideType === 'drinks' || slideType === 'cocktails'
  if (mode === 'beer') return slideType === 'beer'
  if (mode === 'drinks') return slideType === 'drinks' || slideType === 'cocktails'
  return slideType === 'ad' || slideType === 'adpair'
}
