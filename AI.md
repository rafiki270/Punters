# AI Hand-off Guide

This repository contains a local-first web app for managing and displaying taproom beer lists and adverts across one or more TVs. This document is a concise brief for any AI assistant to pick up and continue development.

## Current Scope (high level)
- Single-server Node.js app (Fastify + TypeScript) serving REST + Socket.IO and the React PWA frontend.
- SQLite via Prisma; assets (images) stored in DB; default pricing model via DefaultPrice table.
- Display rotates beer pages (from assigned taps) and adverts (image assets); countdown footer; empty-state message.
- Optional single-password auth; factory reset with two-step confirmation.

## Stack & Structure
- Backend: Fastify v5, TypeScript, Socket.IO; Zod for validation; Prisma for SQLite.
- Frontend: React + Vite + TypeScript; Tailwind CSS; i18next.
- See `ARCHITECTURE.md` for architectural paradigm, layers, and conventions.

## Key Files
- Server: `src/server.ts`, `src/db.ts`, `src/auth.ts`.
- Routes: `src/routes/*.ts` (settings, sizes, beers, taps, media, devices, display, i18n, admin).
- DB schema: `prisma/schema.prisma` (migrations committed), seed: `prisma/seed.ts`.
- Frontend: `web/` with `src/App.tsx` and basic routing; `/display` is implemented.
- Docs: `REQUIREMENTS.md`, `README.md`, `ARCHITECTURE.md`, `TODO.md`.

## Run & Dev
- First time: `make install`
- DB: `make prisma-generate && make prisma-migrate && make db-seed`
- Dev all-in-one: `make launch` (web 5173 + API 3000). Health: `GET /api/health`.
- Docker: `make docker-up`

## Important Endpoints
- Settings: `GET/PUT /api/settings` (responds with computed `defaultPrices` and `defaultGuestPrices` maps)
- Sizes: `GET/POST/PUT/DELETE /api/sizes`
- Beers: `GET /api/beers`, `GET /api/beers/search`, `GET/PUT/DELETE /api/beers/:id`, `GET/PUT /api/beers/:id/prices`
- Taps: `GET /api/taps`, `PUT /api/taps/config`, `PUT/DELETE /api/taps/:number/assign`, `POST /api/taps/:number/status`, `GET /api/taps/:number/history`
- Display: `GET /api/display/beerlist`, `GET /api/display/ads`
- Media: `GET /api/assets`, `POST /api/upload`, `DELETE /api/assets/:id`, `GET /api/assets/:id/content`
- Auth: `POST /api/auth/set-password`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/status`
- Admin: `POST /api/admin/factory-reset/request`, `POST /api/admin/factory-reset`

## Data Model Notes
- DefaultPrice replaces JSON defaults for SQLite compatibility.
- Tap status is a string (no enums in SQLite schema).
- Asset stores image binary in DB (mimeType/size/dimensions included).

## Conventions & Policies
- Always update `README.md`, `REQUIREMENTS.md`, and `TODO.md` when changing behavior or adding features.
- Keep routes thin; move logic into services as complexity grows.
- Validate inputs with Zod; sanitize outputs; never log secrets.
- Commit Prisma migrations; ignore `.env` and runtime DB files.

## Next Likely Tasks
- Display per-device layout: apply device `beerColumns` and `itemsPerColumn` (accept `deviceId` in `/display` URL or via pairing).
- Admin UI: Settings (theme/rotation/locale/default size/prices), Sizes CRUD, Beers CRUD + prices + guest flag, Taps screen with search/history, Media upload.
- Socket sync: align slide transitions on `tick` boundaries; add settings and device update events.
- Tag/category for adverts; scheduling/playlist.

## Open Questions (for product)
- Pairing flow and device identification UX.
- Exact default device layout and display details for multi-screen setups.
- Additional slide types beyond beers and ads.

This brief should be sufficient for another AI to continue implementation. Consult `ARCHITECTURE.md` for design principles and `TODO.md` for the task list.
