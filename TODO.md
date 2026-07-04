# TODO / Project Plan

> **Punters v2 rewrite in progress** — see `v2/` (architecture in `v2/ARCHITECTURE.md`,
> roadmap below in the v2 section). The v1 app below keeps running until v2 reaches parity.

## v2 (ground-up rewrite in `v2/`)
- [x] Architecture: modular workspaces (shared / server / web), template-driven pages
- [x] Shared: 30-template registry, deterministic rotation scheduler, min/max autofit math (unit-tested)
- [x] Server: Fastify 5 + Prisma, unified catalog (beer/cider/wine/spirit/cocktail/soft/hot/food), zones/screens/pages, taps workflow ported from v1, resolved display feed, Socket.IO sync
- [x] Media pipeline: sharp WebP renditions (thumb/sm/md/lg) with reference-guarded deletes
- [x] Web: display engine (generic template renderer, auto-fit menus, sub-pagination, ads rotator), compact admin (Taps, Menu, Pages + template gallery, Screens & zones with pair codes, Media, Settings)
- [x] Auth: relay service (`v2/relay/`) integrating UnlikeOtherAuthenticator — config JWT/JWKS, PKCE login, one-time ticket handoff to each venue's local server, stateless session verification (see `v2/AUTH_ARCHITECTURE.md`)
- [x] Organisations & venues: sign-in gate, one-time venue-bind flow (pick existing venue or create org+venue), immutable per-server binding
- [x] Cross-venue sharing: organisation-wide theme (colours/fonts/logo, per-venue override) and shared menu catalog (live sync, per-item unlink-on-edit) via a ~20s poll loop
- [x] Verified live end-to-end with a real browser against a fake-UOA double (real onboarding needs a one-time human approval step against the real service — see `v2/relay/README.md`)
- [ ] Per-screen layout overrides within a zone (offset/span for video-wall style continuation)
- [ ] Drag-and-drop page reordering and playlist duplication across zones
- [ ] Display preview thumbnails inside the Pages panel (live mini render per page)
- [ ] Push-based catalog sync (Socket.IO relay→venue) instead of polling
- [ ] Scheduling: day-parting (breakfast/lunch/dinner playlists, happy-hour windows)
- [ ] Migration tool: import v1 SQLite data into v2
- [ ] Packaging: Dockerfile + Pi kiosk script for v2 (server) and relay deployment guide

This file mirrors the working plan so we can track progress in Git. Check items off as we complete them and adjust as scope evolves.

## Backend
- [x] Scaffold Fastify + TypeScript server and Prisma + SQLite
- [x] Implement consolidated REST API: settings, sizes, beers (CRUD/search/prices), taps (config/assign/clear/status/history)
- [x] Display endpoint: `GET /api/display/beerlist` (sorted by tap number, omit empties)
- [x] Display endpoint: `GET /api/display/ads` (list ad assets)
- [x] Upgrade Fastify to v5 and align plugins; fix npm audit (multipart)
- [ ] Media uploads: JPG/PNG validation, store under `data/media/`, serve with cache-busting
- [ ] Auth toggle: optional single admin password (enabled in settings), gate admin endpoints
- [ ] i18n bundles: load translation files via `/api/i18n/:locale`

## Frontend (React + Vite + Tailwind, PWA)
- [x] Scaffold PWA shell with basic routes and i18n init
- [ ] Admin: Settings page (theme, rotation, locale, default prices, default size)
- [ ] Admin: Sizes management (CRUD)
- [ ] Admin: Beers CRUD + per-size prices; guest flag; archive
- [ ] Admin: Taps screen with typeahead search from history and quick actions (assign/clear/kick/status)
- [ ] Admin: Media upload UI (JPG/PNG), library list
- [x] Display: Beer list layout (badge left; name, brewery, style+ABV; price right)
- [ ] Display: Columns and items-per-column pagination driven by device settings
- [x] Display: Footer with “Page X of Y • changes in T seconds” live countdown
- [x] Display: Rotate beers and ads; show empty state message when no beers
 - [x] Admin overlay modals on top of Display with auto-hide controls; reload after each change
- [ ] Display: Light/dark theme support; responsive for various TVs

## Sync and Devices
- [ ] Socket.IO: `tick`, `settings:update`, `device:status`, and playlist/device updates
- [ ] Device settings UI: per-device display mode, beerColumns, itemsPerColumn
 - [x] Bonjour/mDNS discovery: advertise in server mode, browse in client mode; client server picker

## Data and Seeding
- [x] Default sizes seeded (Pint, Half, 2/3, 1/3)
- [x] Global default prices for guest beers (e.g., Pint £6, Half £3)
- [x] Optional dev seed: sample beers and tap assignments for demo (`make db-seed-demo` or `SEED_DEMO=1 npm run db:seed`)

## Packaging & Deployment
- [x] Dockerfile and docker-compose for one-command install
- [x] Makefile with automatic help (`make help`)
- [x] `make launch` target: dev convenience (generate/migrate/seed, run web+server)
- [ ] Raspberry Pi systemd unit example and kiosk-mode setup guide

## Testing
- [ ] Unit: pagination logic, settings inheritance, display mode resolution
- [ ] Integration: API endpoints (beers, taps, sizes, settings)
- [ ] UI smoke: Admin key flows (beers, taps), Display render

## Documentation
- [x] REQUIREMENTS.md (living spec)
- [x] README.md (Quick Start, endpoints, run commands)
- [x] ARCHITECTURE.md (paradigm, layers, conventions)
- [x] AI.md (AI hand-off brief)
- [ ] Admin usage guide and translation notes

---
Updating this file:
- Edit directly as tasks change.
- We’ll keep it roughly in sync with our working plan during development.
