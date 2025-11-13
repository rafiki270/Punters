export type DisplayMode = 'everything' | 'all' | 'beer' | 'drinks' | 'ads'

export function modeFromContentFlags(showBeer: boolean, showDrinks: boolean, showMedia: boolean): DisplayMode {
  if (showMedia && (showBeer || showDrinks)) return 'everything'
  if (showBeer && showDrinks) return 'all'
  if (showBeer) return 'beer'
  if (showDrinks) return 'drinks'
  return 'ads'
}

type SlideType = 'beer' | 'drinks' | 'ad' | 'adpair'

export function slideMatchesMode(mode: DisplayMode, slideType: SlideType): boolean {
  if (mode === 'everything') return true
  if (mode === 'all') return slideType === 'beer' || slideType === 'drinks'
  if (mode === 'beer') return slideType === 'beer'
  if (mode === 'drinks') return slideType === 'drinks'
  return slideType === 'ad' || slideType === 'adpair'
}
