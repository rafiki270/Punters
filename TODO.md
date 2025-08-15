# TODO / Project Plan

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
- [ ] Optional dev seed: sample beers and tap assignments for demo

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
