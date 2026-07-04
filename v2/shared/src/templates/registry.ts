import type { TemplateSpec, TemplateSlot, TemplateCategory, TemplateGrid } from './types'

/**
 * The template library. Each entry is pure layout data; the display renders them
 * generically and the admin gallery previews them straight from the grid definition.
 */

function menu(id: string, area: string, label: string, defaults?: TemplateSlot['defaults']): TemplateSlot {
  return { id, area, kind: 'menu', label, defaults }
}
function slot(kind: TemplateSlot['kind'], id: string, area: string, label: string, defaults?: TemplateSlot['defaults']): TemplateSlot {
  return { id, area, kind, label, defaults }
}
function t(
  id: string,
  name: string,
  category: TemplateCategory,
  description: string,
  grid: TemplateGrid,
  slots: TemplateSlot[],
): TemplateSpec {
  return { id, name, category, description, grid, slots }
}

const HEADER_ROW = '96px'
const FOOTER_ROW = '160px'

export const TEMPLATES: TemplateSpec[] = [
  // ----------------------------------------------------------- lists
  t('list-1col', 'Single list', 'lists', 'One full-bleed list. Big rows, ideal for a short tap list.',
    { columns: '1fr', rows: '1fr', areas: ['main'] },
    [menu('main', 'main', 'List', { columns: 1 })]),

  t('list-2col', 'Two-column list', 'lists', 'One list flowing across two columns.',
    { columns: '1fr', rows: '1fr', areas: ['main'] },
    [menu('main', 'main', 'List', { columns: 2 })]),

  t('list-3col', 'Three-column list', 'lists', 'One list flowing across three columns.',
    { columns: '1fr', rows: '1fr', areas: ['main'] },
    [menu('main', 'main', 'List', { columns: 3 })]),

  t('list-4col', 'Four-column list', 'lists', 'Dense four-column list for very large ranges.',
    { columns: '1fr', rows: '1fr', areas: ['main'] },
    [menu('main', 'main', 'List', { columns: 4, minRow: 32, maxRow: 64 })]),

  t('header-list-2col', 'Headered list', 'lists', 'Logo and title band above a two-column list.',
    { columns: '220px 1fr', rows: `${HEADER_ROW} 1fr`, areas: ['logo head', 'main main'] },
    [slot('logo', 'logo', 'logo', 'Logo'), slot('text', 'head', 'head', 'Title'), menu('main', 'main', 'List', { columns: 2 })]),

  t('duo-lists', 'Two lists', 'lists', 'Two independent lists side by side — e.g. beers left, wines right.',
    { columns: '1fr 1fr', rows: '1fr', areas: ['left right'] },
    [menu('left', 'left', 'Left list'), menu('right', 'right', 'Right list', { source: { kinds: ['wine'] } })]),

  t('trio-lists', 'Three lists', 'lists', 'Three independent lists — e.g. beer, cocktails, wine.',
    { columns: '1fr 1fr 1fr', rows: '1fr', areas: ['a b c'] },
    [menu('a', 'a', 'Left list'), menu('b', 'b', 'Middle list', { source: { kinds: ['cocktail'] } }), menu('c', 'c', 'Right list', { source: { kinds: ['wine'] } })]),

  t('duo-lists-titled', 'Two lists, headered', 'lists', 'Title band plus two independent lists.',
    { columns: '1fr 1fr', rows: `${HEADER_ROW} 1fr`, areas: ['head head', 'left right'] },
    [slot('text', 'head', 'head', 'Title'), menu('left', 'left', 'Left list'), menu('right', 'right', 'Right list', { source: { kinds: ['cocktail'] } })]),

  // ----------------------------------------------------------- split / hero
  t('hero-left-list', 'Image left, list right', 'split', 'A tall hero image beside your list.',
    { columns: '2fr 3fr', rows: '1fr', areas: ['hero main'] },
    [slot('image', 'hero', 'hero', 'Hero image'), menu('main', 'main', 'List')]),

  t('hero-right-list', 'List left, image right', 'split', 'Mirror of the classic split.',
    { columns: '3fr 2fr', rows: '1fr', areas: ['main hero'] },
    [menu('main', 'main', 'List'), slot('image', 'hero', 'hero', 'Hero image')]),

  t('hero-center-flanked', 'Centre image, lists around', 'split', 'A centred image with menu columns either side.',
    { columns: '1fr 1fr 1fr', rows: '1fr', areas: ['left hero right'] },
    [menu('left', 'left', 'Left list'), slot('image', 'hero', 'hero', 'Centre image'), menu('right', 'right', 'Right list', { source: { kinds: ['cocktail'] } })]),

  t('hero-top-banner', 'Banner + list', 'split', 'Wide image banner above a two-column list.',
    { columns: '1fr', rows: '2fr 3fr', areas: ['hero', 'main'] },
    [slot('image', 'hero', 'hero', 'Banner image'), menu('main', 'main', 'List', { columns: 2 })]),

  t('hero-bottom-banner', 'List + banner', 'split', 'Two-column list with a wide image below.',
    { columns: '1fr', rows: '3fr 2fr', areas: ['main', 'hero'] },
    [menu('main', 'main', 'List', { columns: 2 }), slot('image', 'hero', 'hero', 'Banner image')]),

  t('featured-spotlight', 'Featured item', 'split', 'One spotlighted item large, the rest listed beside it.',
    { columns: '2fr 3fr', rows: '1fr', areas: ['feat main'] },
    [slot('featured', 'feat', 'feat', 'Featured item'), menu('main', 'main', 'List')]),

  t('split-menu-ads', 'List + ad column', 'split', 'List on the left, rotating promos on the right third.',
    { columns: '2fr 1fr', rows: '1fr', areas: ['main ads'] },
    [menu('main', 'main', 'List', { columns: 1 }), slot('ads', 'ads', 'ads', 'Ad rotator')]),

  // ----------------------------------------------------------- food
  t('food-grid', 'Food cards ×3', 'food', 'Photo cards in three columns — burgers, pizza, specials.',
    { columns: '1fr', rows: '1fr', areas: ['main'] },
    [menu('main', 'main', 'Cards', { source: { kinds: ['food'] }, style: 'card', columns: 3, minRow: 200, maxRow: 340 })]),

  t('food-grid-4', 'Food cards ×4', 'food', 'Photo cards in four columns for larger menus.',
    { columns: '1fr', rows: '1fr', areas: ['main'] },
    [menu('main', 'main', 'Cards', { source: { kinds: ['food'] }, style: 'card', columns: 4, minRow: 180, maxRow: 300 })]),

  t('food-hero-grid', 'Banner + food cards', 'food', 'Appetite-appeal banner above a card grid.',
    { columns: '1fr', rows: '1fr 2fr', areas: ['hero', 'main'] },
    [slot('image', 'hero', 'hero', 'Banner image'), menu('main', 'main', 'Cards', { source: { kinds: ['food'] }, style: 'card', columns: 3, minRow: 180, maxRow: 300 })]),

  t('food-duo', 'Two food sections', 'food', 'Two lists side by side — e.g. starters and mains.',
    { columns: '1fr 1fr', rows: '1fr', areas: ['left right'] },
    [menu('left', 'left', 'Left section', { source: { kinds: ['food'] } }), menu('right', 'right', 'Right section', { source: { kinds: ['food'] } })]),

  t('menu-book', 'Menu book', 'food', 'Classic menu: two columns grouped by category.',
    { columns: '1fr', rows: '1fr', areas: ['main'] },
    [menu('main', 'main', 'Menu', { source: { kinds: ['food'] }, columns: 2, groupByCategory: true, minRow: 44, maxRow: 84 })]),

  t('menu-book-3col', 'Menu book ×3', 'food', 'Category-grouped menu across three columns.',
    { columns: '1fr', rows: '1fr', areas: ['main'] },
    [menu('main', 'main', 'Menu', { source: { kinds: ['food'] }, columns: 3, groupByCategory: true, minRow: 40, maxRow: 72 })]),

  t('beer-food-split', 'Beer + food', 'food', 'Tap list on the left, food cards on the right.',
    { columns: '1fr 1fr', rows: '1fr', areas: ['beer food'] },
    [menu('beer', 'beer', 'Beer list', { source: { tapsOnly: true }, showTapNumbers: true }), menu('food', 'food', 'Food cards', { source: { kinds: ['food'] }, style: 'card', columns: 2, minRow: 180, maxRow: 300 })]),

  // ----------------------------------------------------------- taps
  t('tap-board', 'Tap board', 'taps', 'What’s pouring, ordered by tap number.',
    { columns: '1fr', rows: '1fr', areas: ['main'] },
    [menu('main', 'main', 'Taps', { source: { tapsOnly: true }, columns: 2, showTapNumbers: true })]),

  t('tap-board-hero', 'Tap board + image', 'taps', 'Tap list with a hero image on the right.',
    { columns: '3fr 2fr', rows: '1fr', areas: ['main hero'] },
    [menu('main', 'main', 'Taps', { source: { tapsOnly: true }, showTapNumbers: true }), slot('image', 'hero', 'hero', 'Hero image')]),

  // ----------------------------------------------------------- ads / info
  t('ad-full', 'Fullscreen promo', 'ads', 'Edge-to-edge rotating promo artwork.',
    { columns: '1fr', rows: '1fr', areas: ['ads'] },
    [slot('ads', 'ads', 'ads', 'Ad rotator')]),

  t('ad-pair', 'Promo pair', 'ads', 'Two vertical promos side by side.',
    { columns: '1fr 1fr', rows: '1fr', areas: ['left right'] },
    [slot('ads', 'left', 'left', 'Left rotator'), slot('ads', 'right', 'right', 'Right rotator', { intervalSec: 11 })]),

  t('list-ads-footer', 'List + promo strip', 'ads', 'Two-column list with a promo strip along the bottom.',
    { columns: '1fr', rows: `1fr ${FOOTER_ROW}`, areas: ['main', 'ads'] },
    [menu('main', 'main', 'List', { columns: 2 }), slot('ads', 'ads', 'ads', 'Promo strip', { fit: 'contain' })]),

  t('announcement', 'Announcement', 'info', 'Big type for events, quiz night, last orders.',
    { columns: '1fr', rows: `1fr ${HEADER_ROW}`, areas: ['text', 'logo'] },
    [slot('text', 'text', 'text', 'Message', { size: 'xl' }), slot('logo', 'logo', 'logo', 'Logo')]),

  t('happy-hour', 'Happy hour', 'info', 'Headline offer above a large-row price list, ticker below.',
    { columns: '1fr', rows: `${HEADER_ROW} 1fr 72px`, areas: ['head', 'main', 'tick'] },
    [slot('text', 'head', 'head', 'Headline', { size: 'lg' }), menu('main', 'main', 'Offer list', { minRow: 64, maxRow: 128 }), slot('ticker', 'tick', 'tick', 'Ticker')]),

  t('logo-break', 'Logo break', 'info', 'A calm brand interstitial with a clock.',
    { columns: '1fr', rows: '1fr 96px', areas: ['logo', 'clock'] },
    [slot('logo', 'logo', 'logo', 'Logo'), slot('clock', 'clock', 'clock', 'Clock')]),
]

export const TEMPLATE_MAP: Record<string, TemplateSpec> = Object.fromEntries(
  TEMPLATES.map((tpl) => [tpl.id, tpl]),
)

export function getTemplate(id: string): TemplateSpec | undefined {
  return TEMPLATE_MAP[id]
}

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: 'lists', label: 'Lists' },
  { id: 'split', label: 'Split & hero' },
  { id: 'food', label: 'Food' },
  { id: 'taps', label: 'Tap boards' },
  { id: 'ads', label: 'Promos' },
  { id: 'info', label: 'Info' },
]
