import type { ItemKind } from '../kinds'

/**
 * A template is pure data: a CSS grid plus named slots. The display renders any
 * template generically, so adding a layout means adding one entry to the registry.
 */

export type SlotKind = 'menu' | 'image' | 'ads' | 'text' | 'featured' | 'logo' | 'ticker' | 'clock'

export type TemplateCategory = 'lists' | 'split' | 'food' | 'taps' | 'ads' | 'info'

export interface TemplateSlot {
  id: string
  /** CSS grid-area name; must appear in the template's grid.areas. */
  area: string
  kind: SlotKind
  label: string
  /** Per-kind default config merged under any page-level overrides. */
  defaults?: Partial<SlotConfig>
}

export interface TemplateGrid {
  /** grid-template-columns value, e.g. '2fr 1fr'. */
  columns: string
  /** grid-template-rows value, e.g. 'auto 1fr'. */
  rows: string
  /** grid-template-areas rows, e.g. ['head head', 'main side']. */
  areas: string[]
}

export interface TemplateSpec {
  id: string
  name: string
  category: TemplateCategory
  description: string
  grid: TemplateGrid
  slots: TemplateSlot[]
}

// ---------- Slot configuration (stored per page as { [slotId]: SlotConfig }) ----------

export interface MenuSource {
  kinds?: ItemKind[]
  categoryIds?: number[]
  /** Only items currently on a tap, ordered by tap number. */
  tapsOnly?: boolean
}

export type MenuRowStyle = 'row' | 'card'

export interface MenuSlotConfig {
  source: MenuSource
  columns: number
  /** Row height bounds in px at 1080p; the display scales them with viewport height. */
  minRow: number
  maxRow: number
  style: MenuRowStyle
  showPrices: boolean
  showTapNumbers: boolean
  showBadges: boolean
  groupByCategory: boolean
  title?: string
}

export interface ImageSlotConfig {
  assetId?: number
  fit: 'cover' | 'contain'
  /** When false, corners are square regardless of cornerRadius. */
  roundedCorners: boolean
  /** Corner radius in px at 1080p; only applied when roundedCorners is true. */
  cornerRadius: number
}

export interface AdsSlotConfig {
  /** Filter media by tag; empty = all ad media. */
  tag?: string
  intervalSec: number
  fit: 'cover' | 'contain'
  /** When false, corners are square regardless of cornerRadius. */
  roundedCorners: boolean
  /** Corner radius in px at 1080p; only applied when roundedCorners is true. */
  cornerRadius: number
}

export interface TextSlotConfig {
  title?: string
  body?: string
  align: 'left' | 'center'
  size: 'md' | 'lg' | 'xl'
}

export interface FeaturedSlotConfig {
  itemId?: number
  tagline?: string
}

export interface TickerSlotConfig {
  text?: string
}

export type SlotConfig = Partial<
  MenuSlotConfig & ImageSlotConfig & AdsSlotConfig & TextSlotConfig & FeaturedSlotConfig & TickerSlotConfig
>

export const MENU_DEFAULTS: MenuSlotConfig = {
  source: { kinds: ['beer'] },
  columns: 1,
  minRow: 40,
  maxRow: 96,
  style: 'row',
  showPrices: true,
  showTapNumbers: false,
  showBadges: true,
  groupByCategory: false,
}

// 12px matches the template gallery's original hardcoded radius, kept as the default look.
export const ADS_DEFAULTS: AdsSlotConfig = { intervalSec: 8, fit: 'cover', roundedCorners: true, cornerRadius: 12 }
export const IMAGE_DEFAULTS: ImageSlotConfig = { fit: 'cover', roundedCorners: true, cornerRadius: 12 }
export const TEXT_DEFAULTS: TextSlotConfig = { align: 'center', size: 'lg' }

export function menuConfig(slot: TemplateSlot, pageConfig: Record<string, SlotConfig> | undefined): MenuSlotConfig {
  return { ...MENU_DEFAULTS, ...slot.defaults, ...pageConfig?.[slot.id] } as MenuSlotConfig
}
