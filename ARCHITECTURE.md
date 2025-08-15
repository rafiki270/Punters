# Architecture Overview

This document describes the architectural approach, module boundaries, and conventions for the Punters Taproom Display project. It is not an exhaustive file map; instead it explains how the system is structured and how new features should be designed to fit.

## Paradigm
- Modular monolith running on a single server process.
- Layered architecture with clear boundaries:
- Routes (HTTP/WebSocket) expose APIs and translate I/O to internal calls
  - Services hold business logic (pure or side‑effecting)
  - Persistence via Prisma ORM (SQLite), isolated behind repository/service functions
  - Schemas/validation via Zod at the edges
  - Real‑time signaling via Socket.IO (tick, settings updates, device status)
- Offline/local‑first: server and clients work over LAN; clients should cache display assets and last-known playlist.

## Code Layout (intent)
- `src/server.ts`: Fastify bootstrap, plugin registration, route mounting, static serving, Socket.IO setup, tick broadcaster.
- `src/db.ts`: PrismaClient singleton (shared, re-used in dev to avoid pool explosion).
- `src/auth.ts`: Optional single-password auth, JWT issuance, cookie handling, `requireAdmin` guard.
- `src/routes/*`: Route modules grouped by domain. Responsibilities:
  - Parse/validate input (Zod where appropriate)
  - Authorize (via `requireAdmin` when auth is enabled)
  - Call service/repo functions
  - Shape outputs for clients (avoid leaking ORM internals)
  - Modules present today: `settings`, `sizes`, `beers`, `taps`, `media`, `devices`, `i18n`, `display`, `admin` (factory reset)
- `src/services/*` (future): Business logic that can be unit-tested in isolation (e.g., playlist/page builder, pairing logic, settings inheritance).
- `src/discovery.ts`: Bonjour/mDNS advertise/browse. In `MODE=server`, advertises `_punters._tcp` on the API port; in `MODE=client`, browses and exposes `/api/discovery/servers`.
- `prisma/schema.prisma`: Database schema. Keep relations explicit and SQLite-compatible; commit `prisma/migrations/**` to VCS.
- `prisma/seed.ts`: Idempotent seed for defaults (sizes, default prices, settings).
- `web/`: React + Vite + Tailwind PWA, with two primary views:
  - `/admin`: Manage data (beers/taps/media/sizes/settings/devices)
  - `/display`: Render rotation of beer pages and ads
  - `src/` organizes pages/components/hooks, with `i18n` initialization and Tailwind styles.

## Data Flow
- Admin flows: UI → REST (Fastify routes) → Zod validation → Service/Prisma → DB → return DTOs. Admin changes may emit WS signals (`settings:update`, future `display:update`).
- Display flows: UI reads `/api/display/beerlist` and `/api/display/ads`, rotates slides using `settings.rotationSec`, and may align transitions on `tick` events.
- Pairing and device configuration: Devices (clients) will be associated to settings (columns/items-per-column), either via device ID pairing flow or query params; per-device overrides resolve to an effective layout at render time.

## Conventions
- TypeScript strict mode; no `any` unless justified. Prefer small typed DTOs at the route boundary.
- Validation with Zod at inputs; never trust client data.
- Keep routes thin; move logic into services when it grows beyond simple orchestration.
- Return stable response shapes; avoid leaking ORM specifics.
- Authentication is optional and local-first: when enabled, all admin mutations must require `requireAdmin`.
- Migrations are committed; runtime DB files are ignored.
- Internationalization: keep user-facing strings in the frontend under i18n resources; the API remains locale-neutral, except for static bundles served by `/api/i18n/:locale`.
- Assets: Images are stored in DB (Asset) and streamed via content endpoints; render in aspect-fit for ads.

## Error Handling & Observability
- Routes return 4xx for validation/auth failures, 5xx for unexpected errors. Prefer explicit error messages for admin usage.
- Logging via Fastify’s logger; avoid logging sensitive data (passwords/JWTs).
- Consider adding request IDs and basic timing metrics later if needed.

## Testing Strategy
- Unit test core business logic (page builder, settings inheritance, display mode resolution).
- Integration test critical routes (beers/taps/sizes/settings) against a test DB.
- UI smoke tests for admin flows and display rendering.

## Extending the System
- Adding a feature:
  1) Extend schema (Prisma) + migration + seed if needed
  2) Add service functions for business logic
  3) Add/extend routes for API surfaces; validate inputs with Zod
  4) Wire front-end pages/components and i18n strings
  5) Add tests appropriate to surface area
  6) Update README, REQUIREMENTS, and TODO
- Keep device/display concerns decoupled from admin logic; ensure display remains performant on Raspberry Pi.

## Future Modules (planned)
- Playlist scheduling and builder service
- Pairing/onboarding flow for devices with QR code
- Advanced scheduling (time windows, events)
- Role-based access control (optional)
