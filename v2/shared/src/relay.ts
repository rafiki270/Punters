/**
 * Types and pure helpers shared between the relay (org/venue auth + shared catalog)
 * and each venue's local server. Nothing here talks to a network — that's the point:
 * both sides can unit-test against the same merge/shape logic.
 */

export interface OrgTheme {
  colors?: Record<string, string>
  fonts?: { fontFamily?: string; importUrl?: string }
  logoUrl?: string | null
}

/**
 * A venue's `themeOverrides` is sparse — only the field groups it has chosen to
 * customize. Anything absent falls through to the organisation's theme untouched.
 * Overrides are merged per top-level group (colors/fonts/logoUrl), not deep-merged
 * field-by-field within `colors`, so a venue that overrides one color must supply
 * the whole palette for that group (keeps "what's inherited vs owned" unambiguous).
 */
export function mergeTheme(orgTheme: OrgTheme, overrides: OrgTheme | null | undefined): OrgTheme {
  if (!overrides) return orgTheme
  return {
    colors: overrides.colors ?? orgTheme.colors,
    fonts: overrides.fonts ?? orgTheme.fonts,
    logoUrl: overrides.logoUrl !== undefined ? overrides.logoUrl : orgTheme.logoUrl,
  }
}

export interface RelaySessionClaims {
  sub: string // UOA's stable external user id
  email: string
  orgId?: string
  orgRole?: string
  teamId?: string
  teamRole?: string
  iat: number
  exp: number
}

export interface SharedPrice {
  sizeName: string | null
  amountMinor: number
}

export interface SharedCatalogItem {
  id: number
  kind: string
  name: string
  producer: string | null
  style: string | null
  abv: number | null
  description: string | null
  categoryName: string | null
  vegan: boolean
  vegetarian: boolean
  glutenFree: boolean
  dairyFree: boolean
  spicyLevel: number
  imageUrl: string | null
  prices: SharedPrice[]
  active: boolean
  updatedAt: string
}

export interface SharedCatalogDelta {
  version: number
  items: SharedCatalogItem[]
}

/**
 * Decide whether a venue's local mirror of a shared item needs updating: skip anything
 * the venue has forked (`overridden`), and skip items whose upstream `updatedAt` isn't
 * newer than what's already stored (idempotent re-pulls after a version bump elsewhere).
 */
export function shouldApplySharedItem(
  local: { overridden: boolean; sharedUpdatedAt: string | null } | null,
  incoming: SharedCatalogItem,
): boolean {
  if (local?.overridden) return false
  if (!local?.sharedUpdatedAt) return true
  return new Date(incoming.updatedAt).getTime() > new Date(local.sharedUpdatedAt).getTime()
}
