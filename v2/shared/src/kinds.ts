// The unified catalog: every menu entry in the system is an Item of one of these kinds.
// Adding a kind here is all that's needed for it to appear in admin tabs and menu-slot
// source pickers — the rest of the system is kind-agnostic.

export type ItemKind =
  | 'beer'
  | 'cider'
  | 'wine'
  | 'spirit'
  | 'cocktail'
  | 'soft'
  | 'hot'
  | 'food'

export interface KindMeta {
  kind: ItemKind
  label: string
  plural: string
  /** Field applicability drives which admin form fields and display columns show. */
  hasAbv: boolean
  hasProducer: boolean
  hasStyle: boolean
  hasDietary: boolean
  /** Default pricing shape: per-size grid or one price. Both are always allowed. */
  defaultPricing: 'sizes' | 'single'
  /** Can be poured from a tap (eligible for tap assignment). */
  tappable: boolean
}

export const KINDS: KindMeta[] = [
  { kind: 'beer', label: 'Beer', plural: 'Beers', hasAbv: true, hasProducer: true, hasStyle: true, hasDietary: true, defaultPricing: 'sizes', tappable: true },
  { kind: 'cider', label: 'Cider', plural: 'Ciders', hasAbv: true, hasProducer: true, hasStyle: true, hasDietary: true, defaultPricing: 'sizes', tappable: true },
  { kind: 'wine', label: 'Wine', plural: 'Wines', hasAbv: true, hasProducer: true, hasStyle: true, hasDietary: false, defaultPricing: 'sizes', tappable: false },
  { kind: 'spirit', label: 'Spirit', plural: 'Spirits', hasAbv: true, hasProducer: true, hasStyle: true, hasDietary: false, defaultPricing: 'sizes', tappable: false },
  { kind: 'cocktail', label: 'Cocktail', plural: 'Cocktails', hasAbv: false, hasProducer: false, hasStyle: false, hasDietary: false, defaultPricing: 'single', tappable: false },
  { kind: 'soft', label: 'Soft drink', plural: 'Soft drinks', hasAbv: false, hasProducer: true, hasStyle: false, hasDietary: false, defaultPricing: 'sizes', tappable: false },
  { kind: 'hot', label: 'Hot drink', plural: 'Hot drinks', hasAbv: false, hasProducer: false, hasStyle: false, hasDietary: true, defaultPricing: 'single', tappable: false },
  { kind: 'food', label: 'Food', plural: 'Food', hasAbv: false, hasProducer: false, hasStyle: false, hasDietary: true, defaultPricing: 'single', tappable: false },
]

export const KIND_META: Record<ItemKind, KindMeta> = Object.fromEntries(
  KINDS.map((k) => [k.kind, k]),
) as Record<ItemKind, KindMeta>

export const ALL_KINDS: ItemKind[] = KINDS.map((k) => k.kind)

export function isItemKind(value: string): value is ItemKind {
  return (ALL_KINDS as string[]).includes(value)
}

export interface DietaryFlags {
  vegan: boolean
  vegetarian: boolean
  glutenFree: boolean
  dairyFree: boolean
}
