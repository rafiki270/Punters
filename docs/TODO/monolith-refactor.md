# Monolith Refactor Plan

## Target Architecture
- **Transport shell**: `src/server.ts` only wires Fastify, Socket.IO, and shared plugins; route registration moves to `src/app.ts` that receives dependencies (db, config) and mounts feature modules.
- **Core layer (`src/core`)**: shared utilities for config, logging, HTTP helpers (validation, error mapping), and the Prisma singleton. Nothing outside `core` talks directly to environment globals.
- **Domain modules (`src/modules/<domain>`)**: each domain exposes `schema.ts` (Zod DTOs), `service.ts` (business logic over repositories), `routes.ts` (transport adapters), and optional `events.ts`. Modules never reach into each other’s data; cross-module calls go through exported services.
- **Repositories (`src/modules/<domain>/repo.ts`)**: thin wrappers over Prisma that encapsulate queries and keep the rest of the code database-agnostic.
- **Event + job layer (`src/lib/events`, `src/lib/jobs`)**: wraps the in-memory emitter today, but keeps space for Queue/WS adapters later.
- **Frontend split**: `web/src/admin` and `web/src/display` become independent entry points that share design system atoms in `web/src/ui`. Each surface fetches typed DTOs produced by the server modules.

## Guardrails
- Every new file or change-set we add while executing this plan must stay under 500 lines; break features into multiple slices if needed.
- Decompose features by behavior, not by technology; aim for vertical slices that flow HTTP → service → repo → tests → UI.
- Maintain parity with the current behavior at the end of each slice; no long-lived breakages.

## Refactor Breakdown (each item scoped to ≤500 LOC of net new code)
- [x] **1. Scaffold the modular layout** _(2025-11-12 Codex)_
  - Create `src/core`, `src/modules`, and `src/lib` folders with placeholder exports.
  - Move `db.ts`, `auth.ts`, and `events.ts` into `src/core`/`src/lib` with re-exports to avoid breaking imports.
  - Outcome: folder structure exists, old imports keep working via barrel files.
- [x] **2. HTTP + config foundation** _(2025-11-12 Codex)_
  - Introduce `src/core/http.ts` with helpers for route registration (Zod parsing, error replies) and `src/core/config.ts` for env defaults.
  - Update `src/server.ts` to delegate plugin registration to a new `buildApp()` function in `src/app.ts`.
- [x] **3. Settings module extraction** _(2025-11-12 Codex)_
  - Create `src/modules/settings/{schema,repo,service,routes}.ts`.
  - Move all `/api/settings` logic out of `src/routes/settings.ts`, keeping the Fastify handler under 300 lines by splitting service/business logic.
  - Add targeted unit tests for the service (pricing, rotation defaults) in `tests/settings.service.test.ts`.
- [x] **4. Sizes + pricing module** _(2025-11-12 Codex)_
  - Carve the size/default price logic into `src/modules/catalog` with DTOs shared by beers/taps.
  - Ensure beer creation uses the new service; remove duplicated Prisma calls from `src/routes/beers.ts`.
- [x] **5. Inventory module (beers, taps, drinks)** _(2025-11-12 Codex)_
  - Define shared types (`BeerDTO`, `TapDTO`) and move business logic (badge cleanup, price upserts) into services.
  - Expose thin routers that call into the services; emit change events through `src/lib/events` only.
- [x] **6. Media & assets module** _(2025-11-12 Codex)_
  - Extract upload/asset persistence to its own service; clarify lifecycle hooks (auto-delete unused assets).
  - Prepare hook points for CDN/local storage switching later.
- [x] **7. Devices + display preferences module** _(2025-11-12 Codex)_
  - Consolidate client preference storage, pairing logic, and socket sync helpers into one module.
  - Server routes focus on validation + serialization, while services orchestrate Prisma + Socket.IO.
- [x] **8. Discovery + networking module** _(2025-11-12 Codex)_
  - Wrap Bonjour/mDNS helpers in a module that exposes explicit commands (`startServerAdvert`, `listPeers`).
  - Replace direct imports in `src/server.ts` with the module interface.
- [x] **9. Frontend entry split** _(2025-11-12 Codex)_
  - Create `web/src/admin/App.tsx` and `web/src/display/App.tsx`, move existing logic into feature-specific components (<500 lines each).
  - Wire Vite with two entry points and lazy-load shared design system pieces.
- [x] **10. Testing + automation pass** _(2025-11-12 Codex)_
  - Add a Node test harness (tsc + `node --test`) covering service modules and wire an optional Playwright smoke test that exercises the display bundle (auto-skips when Playwright isn't installed in offline environments).
  - Provide npm scripts for unit vs smoke runs so CI can call them independently.

## Execution Notes
- After each module extraction, delete the legacy file under `src/routes` only when its replacement is wired in and tested.
- Document interface contracts (DTOs, events) in `Docs/api.md` as they stabilize.
- Keep ticket tracking in this file: append date + author when marking a slice done, along with any follow-ups discovered.
