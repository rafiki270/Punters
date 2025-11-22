export type Settings = {
  themeMode: 'light' | 'dark'
  rotationSec: number
  currency: string
  defaultSizeId?: number | null
  locale?: string
  defaultDisplayMode?: 'all' | 'beer' | 'drinks' | 'ads'
  logoAssetId?: number | null
  backgroundAssetId?: number | null
  backgroundPreset?: string | null
  cellScale?: number
  columnGap?: number
  logoPosition?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-right'
  logoScale?: number
  bgPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right'
  bgScale?: number
  beerColumns?: number
  itemsPerPage?: number
  logoBgEnabled?: boolean
  logoBgColor?: string
  logoBgRounded?: boolean
  logoBgRadius?: number
  bgOpacity?: number
  logoPadX?: number
  logoPadY?: number
  pageBgColor?: string
  showFooter?: boolean
  drinksCellScale?: number
  drinksItemsPerCol?: number
  drinksIndentPct?: number
}

export type Size = {
  id: number
  name: string
  volumeMl: number
  displayOrder: number
  forBeers?: boolean
  forDrinks?: boolean
}

export type Price = {
  serveSizeId: number
  amountMinor: number
  currency: string
  size?: {
    id: number
    name: string
    displayOrder: number
    volumeMl?: number
  }
}

export type Beer = {
  id: number
  name: string
  brewery: string
  style: string
  abv?: number
  isGuest: boolean
  badgeAssetId?: number | null
  prices: Price[]
  colorHex?: string | null
}

export type TapBeer = {
  tapNumber: number
  status: string
  beer: Beer | null
}

export type Ad = {
  id: number
  filename: string
  mimeType: string
  width?: number | null
  height?: number | null
  allowPair?: boolean
  fullscreen?: boolean
  requireLogo?: boolean
  hideLogo?: boolean
  displayOrder?: number
  visible?: boolean
}

export type Device = {
  id: number
  name: string
  displayMode: 'inherit' | 'all' | 'beer' | 'drinks' | 'ads'
  beerColumns: number
  itemsPerColumn: number
  cellScale?: number | null
  columnGap?: number | null
  logoPosition?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-right' | null
  logoScale?: number | null
  bgPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right' | null
  bgScale?: number | null
}

export type Drink = {
  id: number
  name: string
  categoryId?: number | null
  displayOrder?: number | null
  producer?: string | null
  style?: string | null
  abv?: number | null
  origin?: string | null
  description?: string | null
  active?: boolean
  disabled?: boolean
  logoAssetId?: number | null
  prices?: Price[]
}

export type DrinkEntry = { kind: 'header'; name: string } | { kind: 'item'; drink: Drink }
export type DrinksPage = { columns: DrinkEntry[][] }
export type Cocktail = {
  id: number
  name: string
  ingredients?: string | null
  priceMinor: number
  currency: string
  active?: boolean
  imageAssetId?: number | null
}
export type CocktailsPage = { columns: Cocktail[][] }
export type Discovered = { name: string; host: string; port: number; addresses: string[] }

export type Slide =
  | { type: 'beer'; data: Array<{ tapNumber: number; status: string; beer: Beer }> }
  | { type: 'ad'; data: Ad }
  | { type: 'drinks'; data: DrinksPage }
  | { type: 'cocktails'; data: CocktailsPage }
  | { type: 'adpair'; data: Ad[] }
