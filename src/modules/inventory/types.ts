export type PriceDTO = {
  serveSizeId: number
  amountMinor: number
  currency: string
}

export type BeerDTO = {
  id: number
  name: string
  brewery: string
  style: string
  abv?: number | null
  badgeAssetId?: number | null
  isGuest?: boolean | null
  colorHex?: string | null
  prices?: PriceDTO[]
}

export type TapDTO = {
  tapNumber: number
  status: 'on' | 'off' | 'coming_soon' | 'kicked'
  beer: BeerDTO | null
}
