import { useMemo } from 'react'
import type { Ad, Beer, Device, Slide, TapBeer } from '../types'
import { slideMatchesMode, DisplayMode } from '../lib/displayMode'

type UseSlidesArgs = {
  taps: TapBeer[]
  columns: number
  effBeerItemsPerCol: number
  ads: Ad[]
  drinks: any[]
  cocktails: any[]
  drinkCategories: any[]
  device: Device | null
  localDisplayMode: DisplayMode
  localShowDrinks: boolean
  localShowCocktails: boolean
  effDrinksItemsPerCol: number
}

export default function useSlides({
  taps,
  columns,
  effBeerItemsPerCol,
  ads,
  drinks,
  cocktails,
  drinkCategories,
  device,
  localDisplayMode,
  localShowDrinks,
  localShowCocktails,
  effDrinksItemsPerCol,
}: UseSlidesArgs) {
  const tapBeers = useMemo(() => taps.filter(t => t.beer != null).map(t => ({ tapNumber: t.tapNumber, status: t.status, beer: t.beer as Beer })), [taps])

  const beerPages: Array<Array<{ tapNumber: number; status: string; beer: Beer }>> = useMemo(() => {
    const perCol = effBeerItemsPerCol
    const perPage = Math.max(1, columns) * Math.max(1, perCol)
    const pages: Array<Array<{ tapNumber: number; status: string; beer: Beer }>> = []
    for (let i = 0; i < tapBeers.length; i += perPage) pages.push(tapBeers.slice(i, i + perPage))
    return pages.length ? pages : [[]]
  }, [tapBeers, columns, effBeerItemsPerCol])

  const slides = useMemo(() => {
    const s: Slide[] = []
    beerPages.forEach(pg => s.push({ type: 'beer', data: pg }))
    const hasDrinks = Array.isArray(drinks) && drinks.some((d:any)=>d && d.active!==false)
    const hasCocktails = Array.isArray(cocktails) && cocktails.some((c:any)=>c && c.active!==false)
    const allowDrinks = (device && device.displayMode !== 'inherit')
      ? (device.displayMode === 'drinks' || device.displayMode === 'all')
      : (localDisplayMode !== 'ads' && localShowDrinks)
    const allowCocktails = (device && device.displayMode !== 'inherit')
      ? (device.displayMode === 'drinks' || device.displayMode === 'all')
      : (localDisplayMode !== 'ads' && localShowCocktails)
    if (hasDrinks && allowDrinks) {
      const cats = (drinkCategories || []).slice().sort((a:any,b:any)=> (a.displayOrder-b.displayOrder) || String(a.name).localeCompare(String(b.name)))
      const grouped = cats.map((c:any)=> ({ id:c.id, name:c.name, drinks: (drinks || []).filter((d:any)=> d.categoryId===c.id && d.active!==false).slice().sort((a:any,b:any)=> (a.displayOrder-b.displayOrder) || String(a.name).localeCompare(String(b.name))) })).filter((g:any)=> g.drinks.length>0)
      type Entry = { kind:'header'; name:string } | { kind:'item'; drink:any }
      const entries: Entry[] = []
      grouped.forEach(g => { entries.push({ kind:'header', name:g.name }); g.drinks.forEach((d:any)=> entries.push({ kind:'item', drink:d })) })
      const perCol = Math.max(1, effDrinksItemsPerCol)
      const colCount = Math.max(1, columns)
      const perPage = perCol * colCount
      for (let i=0; i<entries.length; i+=perPage) {
        const pageEntries = entries.slice(i, i+perPage)
        const columnsData: Entry[][] = []
        for (let c=0;c<colCount;c++) {
          columnsData.push(pageEntries.slice(c*perCol, (c+1)*perCol))
        }
        s.push({ type:'drinks', data: { columns: columnsData } })
      }
    }
    if (hasCocktails && allowCocktails) {
      const sorted = (cocktails || []).filter((c:any)=>c && c.active!==false).slice().sort((a:any,b:any)=> String(a.name).localeCompare(String(b.name)))
      const perCol = Math.max(1, effDrinksItemsPerCol)
      const colCount = Math.max(1, columns)
      const perPage = perCol * colCount
      for (let i=0; i<sorted.length; i+=perPage) {
        const chunk = sorted.slice(i, i+perPage)
        const columnsData: any[][] = []
        for (let c=0;c<colCount;c++) {
          columnsData.push(chunk.slice(c*perCol, (c+1)*perCol))
        }
        s.push({ type:'cocktails', data: { columns: columnsData } })
      }
    }
    const adsSorted = ads.slice().sort((a,b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    for (let i = 0; i < adsSorted.length; i++) {
      const a = adsSorted[i]
      const next = adsSorted[i+1]
      const canPair = (x: Ad) => (x.allowPair !== false)
      const isPortrait = (x: Ad) => Number(x.height||0) > Number(x.width||0)
      if (next && canPair(a) && canPair(next) && (isPortrait(a) && isPortrait(next))) {
        s.push({ type: 'adpair', data: [a, next] })
        i++
        continue
      }
      s.push({ type: 'ad', data: a })
    }
    let modeEff: DisplayMode = 'all'
    if (device && device.displayMode !== 'inherit') modeEff = device.displayMode as DisplayMode
    else modeEff = localDisplayMode
    const filtered = s.filter(sl => slideMatchesMode(modeEff, sl.type))
    return filtered.length ? filtered : [{ type: 'beer', data: [] }]
  }, [beerPages, ads, drinks, cocktails, drinkCategories, localDisplayMode, localShowDrinks, localShowCocktails, device?.displayMode, columns, effDrinksItemsPerCol])

  return { tapBeers, slides }
}
