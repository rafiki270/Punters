import type { AssetUrls, ItemKind, OrgTheme } from '@punters/shared'

/** Admin-side API row shapes (Prisma rows serialized over JSON). */

export interface AdminCategory {
  id: number
  kind: ItemKind
  name: string
  displayOrder: number
  active: boolean
}

export interface AdminSize {
  id: number
  name: string
  volumeMl: number | null
  displayOrder: number
  kinds: string
}

export interface AdminPrice {
  id: number
  sizeId: number | null
  amountMinor: number
  size: AdminSize | null
}

export interface AdminItem {
  id: number
  kind: ItemKind
  name: string
  producer: string | null
  style: string | null
  abv: number | null
  description: string | null
  categoryId: number | null
  category: AdminCategory | null
  vegan: boolean
  vegetarian: boolean
  glutenFree: boolean
  dairyFree: boolean
  spicyLevel: number
  imageAssetId: number | null
  badgeAssetId: number | null
  active: boolean
  prices: AdminPrice[]
  sharedItemId: number | null
  overridden: boolean
}

export interface AdminTap {
  number: number
  status: 'on' | 'off' | 'kicked'
  itemId: number | null
  item: AdminItem | null
  notes: string | null
}

export interface AdminAsset {
  id: number
  purpose: string
  tag: string | null
  originalName: string
  mime: string
  mediaType: 'image' | 'video'
  width: number | null
  height: number | null
  sizeBytes: number
  durationSec: number | null
  urls: AssetUrls
  /** Only set for video assets — the /media/... URL of the stored original file. */
  videoUrl: string | null
  optimizedBytes: number
}

export interface AdminScreen {
  id: number
  key: string
  pairCode: string | null
  name: string
  zoneId: number | null
  zone: AdminZone | null
  outputIndex: number
  width: number | null
  height: number | null
  lastSeenAt: string | null
}

export interface AdminPage {
  id: number
  zoneId: number
  name: string
  templateId: string
  durationSec: number
  sortOrder: number
  active: boolean
  config: string
}

export interface AdminZone {
  id: number
  name: string
  rotationMode: 'zone' | 'screen'
  screens?: AdminScreen[]
  pages?: AdminPage[]
}

export interface AdminSettings {
  id: number
  venueName: string
  currency: string
  locale: string
  theme: 'dark' | 'light'
  logoAssetId: number | null
  backgroundAssetId: number | null
  orgId: number | null
  orgName: string | null
  teamId: number | null
  teamName: string | null
  orgTheme: string | null
  themeOverrides: string | null
}

// ---------------------------------------------------------------- auth

export interface AuthMe {
  authenticated: boolean
  venueBound: boolean
  user?: { sub: string; email: string }
  org?: { id: number; name: string } | null
  team?: { id: number; name: string } | null
}

export interface RelayMembershipOrg {
  orgId: number
  orgName: string
  orgRole: string
}

export interface RelayMembershipTeam {
  orgId: number
  orgName: string
  teamId: number
  teamName: string
  teamRole: string | null
}

export interface RelayMemberships {
  orgs: RelayMembershipOrg[]
  teams: RelayMembershipTeam[]
  canCreateOrg: boolean
}

export type { OrgTheme }

export interface OrgSharedItem {
  id: number
  kind: string
  name: string
  producer: string | null
  style: string | null
  abv: number | null
  description: string | null
  categoryName: string | null
  active: boolean
  prices: { sizeName: string | null; amountMinor: number }[]
}
