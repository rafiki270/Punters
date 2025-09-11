# Punters Taproom Display

Local-first web app to power taproom TVs with live beer lists and scheduled promotional content. Runs on a “main” device (often a Raspberry Pi) and one or more “client” display devices that stay in sync.

> Project status: Planning/Scaffolding. See REQUIREMENTS.md for the evolving spec.

## Features (MVP)
- Manage beers and taps; quick actions (kicked/swap).
- Upload promo images and build simple playlists.
- Single-screen rotation with configurable durations.
- Multi-screen paired mode (two screens) with synchronized page steps.
- PWA client with offline cache for assets and last playlist.
- Global settings on main: light/dark mode and rotation time (default 90s).
- Per-device display mode: inherit global, or force ads-only, beer-only, or rotate all.
- Pricing with volumes: Pint, Half Pint (default), plus 1/3 and 2/3; primary price displayed.
 - Default prices in Settings: prefill per volume (e.g., Pint £6, Half £3) with optional guest-beer defaults.
- Configurable layout per device: columns and items-per-column for beer pages; automatic pagination with live countdown.
- Translatable UI (admin and display); mobile-first admin.
 - Tap management: set tap count, assign/clear/kick; typeahead search from past beers; per-tap history.

## Tech Stack
- Single server app: Node.js + TypeScript (Fastify) with Socket.IO; also serves the built frontend
- Frontend: React + Vite + TypeScript (PWA)
- Styling: Tailwind CSS (+ headless components for admin)
- Data: SQLite via Prisma; assets (images) stored in the database
- Package manager: npm
- i18n: i18next
- Packaging: Docker Compose for one-command install

## Architecture & AI Hand-off
- See `ARCHITECTURE.md` for the architectural paradigm, layering, and conventions developers should follow when extending the system.
- See `AI.md` for a concise hand-off brief if another AI assistant needs to continue from the current state.

## Modes & Discovery
- Modes: The Node process can run in `server` (main) or `client` mode via `MODE` env var (default `server`).
  - Server mode: advertises itself over Bonjour/mDNS (type `_punters._tcp`) and exposes full admin overlays.
  - Client mode: shows only Settings and a Server picker; data editing is hidden; the Display fetches from the selected main server.
- Discovery: In client mode, `/api/discovery/servers` lists discovered servers on the LAN; the Admin overlay includes a dropdown to select and save one. The selection is saved in the browser and used to fetch display data from `http://<server-host>:<port>`.
  - Fallback: If no servers are discovered, you can manually enter the server URL in the Admin overlay (Server tab).

## Prerequisites
- Node.js 20+ and npm
- Git
- For Raspberry Pi: Raspberry Pi OS (Bookworm or later) with Chromium installed

## Quick Start
- Clone repo and install deps (root + web)
  - `make install`
- Configure environment
  - Copy `.env.example` to `.env` and adjust if needed
- Initialize database
  - `npm run prisma:generate`
  - `npm run prisma:migrate`
  - `npm run db:seed`
- Run in development
  - Server: `npm run dev` (http://localhost:3000)
  - Web (separate terminal): `npm run dev:web` (http://localhost:5173)
  - The web dev server proxies `/api` and `/socket.io` to the server
- Build and run in one process (serving static web)
  - `npm run build`
  - `npm start` (http://localhost:3000)
- Docker (one-command install)
  - `docker compose up --build`

## Server Details
- Port: `3000` (configurable via `PORT` environment variable)
- Health: `GET /api/health`
- Settings: `GET/PUT /api/settings` (responds with `defaultPrices` and `defaultGuestPrices` maps computed from DefaultPrice records)
- Sizes: `GET/POST/PUT/DELETE /api/sizes`
- Beers: `GET /api/beers`, `GET /api/beers/search?q=...`, `GET/PUT/DELETE /api/beers/:id`, `GET/PUT /api/beers/:id/prices`
- Taps: `GET /api/taps`, `PUT /api/taps/config`, `PUT/DELETE /api/taps/:number/assign`, `POST /api/taps/:number/status`, `GET /api/taps/:number/history`
- Display data: `GET /api/display/beerlist` — assigned beers sorted by tap number (empty taps omitted)
 - Display data: `GET /api/display/ads` — list of ad images (assets)
- i18n: `GET /api/i18n/:locale`
 - Media: `GET /api/assets`, `POST /api/upload` (JPG/PNG), `DELETE /api/assets/:id`, `GET /api/assets/:id/content` (binary)
   - Note: Assets are stored in the database and streamed via the content endpoint.
 - Devices: `GET/POST /api/devices`, `PUT/DELETE /api/devices/:id`
  - Auth: `POST /api/auth/set-password` (enable and set; requires `{ password, confirm }` and, if already enabled, `{ current }`), `POST /api/auth/login` (returns token + cookie), `POST /api/auth/logout`, `GET /api/auth/status`
 - Admin: `POST /api/admin/factory-reset/request` (returns 6-digit code), `POST /api/admin/factory-reset` (body: `{ "code": "123456" }`)

Auth toggle
- Default: disabled. Enable by calling `POST /api/auth/set-password` with `{ password, confirm }` (must match). When enabled, protected endpoints require `Authorization: Bearer <token>` (from login) or the provided cookie.
- Changing password when enabled requires `{ current }` in the same request to verify the existing password.
- Mutations guard: All admin-mutating routes (settings PUT, sizes POST/PUT/DELETE, beers POST/PUT/DELETE/prices, taps config/assign/clear/status, media upload/delete, devices POST/PUT/DELETE) require auth when enabled; are open when disabled.

Factory reset
- Two-step flow to reduce accidents:
  - `POST /api/admin/factory-reset/request` to obtain a short-lived 6-digit code.
  - `POST /api/admin/factory-reset` with `{ "code": "XXXXXX" }` to wipe data and restore defaults (sizes, settings).

## Makefile shortcuts
- Run `make help` to list available commands.
- `make launch` — one-shot dev: installs dependencies (unless `SKIP_INSTALL=1`), prepares DB (generate/migrate/seed), then starts web (5173) + server (3000).
  - Prints detected LAN IPs so you can open `http://<ip>:5173/` from other devices.
- `make launch80` — same as `launch` but serves the web app on port 80 instead of 5173.
  - On macOS/Linux/Windows, port 80 is privileged; run with sudo/Administrator: `sudo make launch80`.
- `make install` — install dependencies
- `make prisma-generate` — generate Prisma client
- `make prisma-migrate` — run migrations (dev)
- `make db-seed` — seed defaults (sizes, settings)
- `make dev` — run server in dev mode on 3000
- `make dev-web` — run web dev server on 5173
- `make build` — build web and server
- `make start` — start built server (serves web)
- `make docker-up` / `make docker-down` / `make docker-logs`

## Backend Features Implemented
- **Settings API:** Global settings with theme, rotation, locale, currency, default display size; responds with default price maps; PUT guarded by auth when enabled.
- **Sizes + Prices:** CRUD for serve sizes; beer prices managed per size; guest beer flag; defaults prefill from DefaultPrice on beer create/assign.
- **Beers:** CRUD, archive, typeahead search; prices endpoint to upsert per-size values.
  - Beer form allows uploading a badge image inline; the image is uploaded and linked to the beer automatically.
- **Taps:** Numeric taps, set tap count, assign/create+assign, clear, status (on/off/coming_soon/kicked), and per-tap history; beer list ordered by tap number.
- **Media (DB-backed):** Upload JPG/PNG, list, delete; binary served via `/api/assets/:id/content` with cache headers; stored with mimeType, dimensions, size.
- **Devices:** CRUD for device displayMode and layout (columns/items-per-column) to drive pagination.
- **Auth (optional):** Single password; enable via set-password with confirm and current (when changing); login sets token/cookie; all admin mutations guarded when enabled.
- **Factory Reset:** Two-step confirmation (request code, then confirm) to wipe and reseed defaults.
- **Display Data:** `/api/display/beerlist` and `/api/display/ads` power the rotating display.
- **Sync Tick:** Socket.IO `tick` broadcast every second for future slide synchronization.

## Display rotation
- Default route shows the Display view (dark mode by default).
- Rotates through beer pages and advert images using the rotation time in Settings.
- Beer pages are built from assigned taps, ordered by tap number. If no beers are set, a centered message “No beers are set yet” is shown.
- If there is only one page total, the countdown footer is hidden.
- Overlay Admin panel can be toggled in the Display via a floating button; UI controls auto-hide after inactivity.
  - Admin overlays include Settings, Sizes, Beers (add + edit), Taps, and Media. Changes trigger in-place data refresh (no full page reload) so the display updates immediately.
  - Taps (server mode): set number of taps; per-tap whisperer to assign beers with client-side filtering; Clear and Kicked actions.
  - Devices (server mode): set per-device layout (columns, items-per-column) and content mode (All, Beers only, Media only).
- Ad images are rendered in aspect-fit mode.

## Exposing on Your Network
- Development (Vite): The dev server runs on `http://<your-ip>:5173` and is now bound to all interfaces. After `make launch`, open the Display on other devices via `http://<your-ip>:5173/`.
  - Vite proxies API calls to `http://localhost:3000`; no extra config needed on the same host.
  - If you see HMR warnings on remote devices, it’s safe to ignore during early development.
- Production (single server): Build with `npm run build` and start with `npm start`, then open `http://<your-ip>:3000/`.
- Docker: `docker compose up --build` publishes port 3000; connect to `http://<your-ip>:3000/`.
- Security: When exposing beyond a trusted LAN, enable the admin password (`POST /api/auth/set-password`) so admin routes are protected.

## Raspberry Pi
- One-line interactive install (choose Server or Client):
  - `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/rafiki270/Punters/refs/heads/main/scripts/rpi-install.sh)"`
- Server mode:
  - Runs the app locally, binds to port 80, and autostarts Chromium fullscreen to `http://localhost` at boot.
  - Prompts for a hostname (defaults to `punters`) and enables mDNS, so you can reach it via `http://<hostname>.local`.
- Client mode:
  - Prompts for the server URL (e.g., `http://punters.local`) and autostarts Chromium fullscreen to that URL at boot.
- URLs after install:
  - Server mode: `http://<hostname>.local/` (defaults to `http://punters.local/`), API health at `http://<hostname>.local/api/health`.
  - Client mode: Chromium opens to the URL you provide during install.
- Update on Pi:
  - From `/opt/punters`: `make update` (adds migrations and rebuilds). Use `RESTART=1` to restart the kiosk service after building: `RESTART=1 make update`.

## Contributing
- Open issues or proposals based on REQUIREMENTS.md.
- Keep changes small and focused; we’ll evolve the structure incrementally.

## License
TBD.

---
For scope and architecture, read REQUIREMENTS.md.
## Raspberry Pi one-line install (multi-arch Docker)

We publish a multi-arch image (amd64, arm64) to GHCR on tagged releases. Note: Prisma does not provide engines for 32-bit armv7, so a 64-bit OS is required on Raspberry Pi (e.g., RPi OS 64-bit on Pi 3/4/5).
You can deploy to a Pi (or any Debian-based host) with one command:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/rafiki270/Punters/main/deploy/install.sh)" -- --port 80 --data-dir /opt/punters/data --image ghcr.io/rafiki270/punters:latest
```

Flags:
- `--port`: host port to expose (default 80)
- `--data-dir`: persistent data dir (default `/opt/punters/data`)
- `--watchtower`: include auto-updater service (optional)
- `--image`: container image (default placeholder; set to your GHCR image)

The script will:
- Install Docker + Compose plugin if missing
- Write `/opt/punters/docker-compose.yml`
- Pull your image and start it with `docker compose up -d`
