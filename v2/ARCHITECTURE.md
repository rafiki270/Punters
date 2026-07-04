# Punters v2 — Architecture

A ground-up rewrite of Punters as a modular, commercial-grade menu display platform for
bars, taprooms, breweries, and restaurants. One small server runs the whole venue; any
number of TVs (across any number of devices, including multiple outputs on one device)
render synchronized, template-driven pages.

## Design goals

1. **Modular everything.** Content types, page templates, display slots, and admin panels
   are all registries — adding a new template or item kind touches one file.
2. **Template-driven layouts.** Pages are built from a library of 30+ layout templates
   (grids of *slots*). A template is pure data (CSS grid + slot definitions); the display
   renders any template generically. A visual gallery in the admin lets staff pick layouts.
3. **True multi-screen.** *Zones* group screens that rotate in lockstep (e.g. "3 TVs on the
   left wall"). Rotation is deterministic — every screen computes the current page from a
   shared epoch + server-synced clock, so screens never drift, even after reconnects.
   A single device with multiple outputs simply runs one browser window per output; each
   pairs as its own screen.
4. **Every venue type.** A unified `Item` catalog covers beer, cider, wine, spirits,
   cocktails, soft drinks, hot drinks, and food (with categories, dietary flags, spice
   levels, thumbnails). Pricing supports per-size price grids *and* single prices.
5. **Fast media.** Uploads are optimized on the server (sharp): WebP renditions at
   thumb/small/medium/large sizes. Displays and the admin always load the right size.
6. **Compact, professional admin.** A dense design system (28px controls, 13px type,
   inline editing, no page-long forms). Everything reachable in ≤2 clicks from the rail.
7. **Keep what works.** The taps workflow is ported as-is: set tap count, assign beers via
   typeahead, clear/kick/status, full assignment history.

## Repository layout

```
v2/
  shared/    # @punters/shared — types, template registry, rotation math, autofit math
  server/    # Fastify 5 + Prisma (SQLite) + Socket.IO + sharp
  web/       # React + Vite — /display renderer and /admin console (no CSS framework;
             # hand-rolled design tokens = the design system)
```

npm workspaces; `npm install` once at `v2/`. The server serves the built web app in
production; in dev, Vite proxies `/api`, `/media`, and websockets to the server (port 4000).

## Domain model

```
Settings      venue name, currency, locale, theme, logo/background assets
Zone          a synchronized group of screens; rotationMode 'zone' | 'screen',
              rotationSince (sync epoch, reset when the playlist changes)
Screen        belongs to a zone (or unclaimed); pairing code, output index for
              multi-output devices, resolution/orientation, last-seen
Page          one entry in a zone's rotation: templateId + per-slot config (JSON) +
              duration + order + active
Category      per-kind grouping (Starters, Mains, IPA, Red Wine, …)
Item          unified menu item: kind (beer|cider|wine|spirit|cocktail|soft|hot|food),
              producer/style/abv for drinks, dietary flags + spicy level for food,
              image + badge assets, active (soft archive)
ServeSize     Pint, Half, 175ml … with the kinds it applies to
Price         (item, size?) → amountMinor; a null size = single price
Tap / TapAssignment   ported from v1: numeric taps, live item, full history
Asset / AssetVariant  original + WebP renditions (thumb 320 / sm 640 / md 1280 / lg 1920)
```

## Template system

`shared/src/templates/` defines:

```ts
TemplateSpec { id, name, category, grid: {columns, rows, areas}, slots: TemplateSlot[] }
TemplateSlot { id, area, kind: 'menu'|'image'|'ads'|'text'|'featured'|'logo'|'ticker'|'clock',
               defaults }
```

The registry ships 30 templates across five families — lists (1–4 columns, headered,
side-by-side independent lists), split/hero (image left/right/center-flanked/banner,
featured-item spotlight), food (card grids, menu-book with category grouping,
beer+food splits), tap boards, and ads/info (fullscreen ads, ad pairs, ad footers,
announcements, happy hour, logo break).

A page stores `{ [slotId]: SlotConfig }`. Menu slots configure their **source**
(item kinds, categories, taps-only), column count, row style (`row` | `card`), and
**min/max row height** — the display auto-fits: row height = clamp(min, available/needed, max),
and overflow paginates *within* the page's duration. The autofit math is a pure function
(`shared/src/autofit.ts`) with unit tests.

## Synchronization

- The server is the clock authority. Every zone has `rotationSince`; the display feed
  returns `serverNow`, so each client computes `offset = serverNow - clientNow` and derives
  the current page index deterministically (`shared/src/scheduler.ts`, unit-tested).
  Same inputs on every screen in a zone ⇒ pixel-synchronized rotation with zero
  coordination traffic.
- `rotationMode: 'screen'` makes each screen rotate independently (epoch = its own start).
- Socket.IO broadcasts `changed { scope }` on any admin mutation; displays debounce-refetch
  the feed. A periodic `tick` keeps clock offsets honest.

## Screen pairing

A TV opens `http://server:4000/` → it auto-registers and shows a 6-character pair code.
In Admin → Screens the new screen appears with its code; staff name it and drop it into a
zone. The screen stores its key in localStorage and reconnects forever after. No typing
URLs or IDs on a TV.

## Media pipeline

`POST /api/media` (multipart) → sharp probes the image, then writes WebP renditions
(thumb/sm/md/lg, capped at source size) plus the original under `data/media/<id>/`.
The API returns per-variant URLs; menu thumbnails use `thumb`, hero slots use `lg`.
Deletion is guarded against references from items and settings.

## Server modules

Each module is a folder with `routes.ts` (+ `service.ts` where logic warrants it),
registered in `app.ts`: `settings`, `media`, `catalog` (items/categories/sizes/prices),
`taps`, `screens` (zones/screens/pages), `display` (the resolved feed). Modules
communicate only through Prisma and the typed event bus (`core/events.ts` → sockets).

## Testing

- `shared`: pure-function tests (rotation scheduler, autofit, money, template registry
  validity — unique ids, slot/area consistency).
- `server`: API smoke tests via `app.inject()` against a scratch SQLite database.

## What stays out of v1

Nothing in `v2/` imports from the old codebase. The old app keeps running until v2 reaches
feature parity; then the root is swapped.
