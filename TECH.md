# Punters Taproom Display

Local-first web app to power taproom TVs with live beer lists and scheduled promotional content. Runs on a “main” device (often a Raspberry Pi) and one or more “client” display devices that stay in sync.

## Current Features
- Beers & taps: assign beers, kick/clear, keep tap history, and manage sizes with default pricing templates.
- Cocktails: image + ingredient block + single price with enable/disable toggles, alphabetical list, and dedicated display slides.
- Other drinks: categorized bottle/can lists, per-size prices, and a stop-icon toggle that flips the `disabled` flag so items vanish from displays without deleting them.
- Media: upload promo images, order them, control pairing, hide logo/footer per asset, and play them in rotation.
- Rotation: configurable duration (default 90 s), countdown footer, multi-screen synchronization, per-device display modes (inherit/all/beer/drinks/ads), and per-screen content toggles (beer/drinks/cocktails/media).
- Display: React/Vite PWA with offline cache, auto-hide admin overlay, optional logo positioning/scaling, and per-device column/item overrides.
- Settings: global theme, background, spacing, and logo controls; device overrides for layout and content filters.
- Localization: server exposes `/api/i18n/:locale` and the admin/display consume those resources.

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

## Testing
- Unit suite (services + modules): `npm run test:unit`
  - Compiles the TypeScript tests into `dist-tests/` and runs them via Node's built-in test runner.
- Browser smoke (optional): `npm run test:smoke`
  - Requires `@playwright/test` and a running display host (e.g., `npm --prefix web run preview`).
  - Skips automatically when Playwright is not installed (useful for offline/dev environments).

## Server Details
- Port: `3000` (configurable via `PORT` environment variable)
- Health: `GET /api/health`
- Settings: `GET/PUT /api/settings` (returns default price maps)
- Sizes: `GET/POST/PUT/DELETE /api/sizes`
- Beers: `GET /api/beers`, `GET /api/beers/search?q=...`, `GET/PUT/DELETE /api/beers/:id`, `GET/PUT /api/beers/:id/prices`
- Taps: `GET /api/taps`, `PUT /api/taps/config`, `PUT/DELETE /api/taps/:number/assign`, `POST /api/taps/:number/status`, `GET /api/taps/:number/history`
- Cocktails: `GET /api/cocktails?active=true`, `GET /api/cocktails/:id`, `POST /api/cocktails`, `PUT /api/cocktails/:id`, `DELETE /api/cocktails/:id` (soft-disable)
- Drinks: `GET /api/drinks?active=true&disabled=false&withPrices=true`, `GET /api/drinks/:id`, `POST /api/drinks`, `PUT /api/drinks/:id`, `DELETE /api/drinks/:id` (soft-delete via `active=false`). The admin stop icon flips `disabled` on/off; disabled drinks stay editable but never appear on the display fetches.
- Display data:
  - `GET /api/display/beerlist` — assigned beers sorted by tap number (empty taps omitted)
  - `GET /api/display/ads` — ad/media assets (includes hide flags; only "Show"-enabled items are returned)
- Media: `GET /api/assets`, `POST /api/upload` (JPG/PNG), `DELETE /api/assets/:id`, `GET /api/assets/:id/content`
- Devices: `GET/POST /api/devices`, `PUT/DELETE /api/devices/:id`
- i18n: `GET /api/i18n/:locale`
- Auth: `POST /api/auth/set-password`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/status`
- Admin ops: `POST /api/admin/factory-reset/request`, `POST /api/admin/factory-reset`
- Logging: set `DISPLAY_LOG_LEVEL=info` to re-enable noisy socket/display connection logs; default `debug` keeps those events at debug level so production logs stay readable.

### Auth toggle
- Default: disabled. Enable by calling `POST /api/auth/set-password` with `{ password, confirm }` (must match). When enabled, protected endpoints require `Authorization: Bearer <token>` (from login) or the provided cookie.
- Changing password when enabled requires `{ current }` in the same request to verify the existing password.
- Mutations guard: All admin-mutating routes (settings PUT, sizes POST/PUT/DELETE, beers POST/PUT/DELETE/prices, taps config/assign/clear/status, media upload/delete, devices POST/PUT/DELETE) require auth when enabled; are open when disabled.

### Factory reset
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
  - `sudo /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/rafiki270/Punters/refs/heads/main/scripts/rpi-install.sh)"`

What it sets up
- Console kiosk: boots to TTY1, autologins a kiosk user, starts Xorg + a tiny WM (Openbox) + Chromium fullscreen.
- Installs Node.js 18+, npm, Chromium, git, and helpers.
- Clones/updates this repo at `INSTALL_DIR` (default `/opt/punters`) and writes `/etc/default/punters-kiosk`.
- Client mode: opens Chromium to your remote URL.
- Server mode: runs `make launch80` locally (web on port 80) and opens Chromium to `http://localhost`.

Common installer options (env)
- `INSTALL_DIR=/opt/punters` — target directory (default shown).
- `PIXEL_DOUBLE=1` — default Yes for 4K crispness.
- `SKIP_SPLASH=1` — skip and remove Plymouth splash for faster boots.
- `ENABLE_VNC=0` — VNC off by default; set `1` to enable.
- `KIOSK_USER=kiosk` — user for autologin.

Examples
- Fast client install (no splash/VNC):
  - `sudo SKIP_SPLASH=1 ENABLE_VNC=0 PIXEL_DOUBLE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/rafiki270/Punters/refs/heads/main/scripts/rpi-install.sh)"`
- Explicit install dir:
  - `sudo INSTALL_DIR=/opt/punters /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/rafiki270/Punters/refs/heads/main/scripts/rpi-install.sh)"`

Switching modes later (no reinstall)
- Client (point to server):
  - Local repo: `sudo KIOSK_USER=kiosk bash /opt/punters/scripts/rpi-enable-kiosk.sh client http://server.local`
  - Remote: `curl -fsSL https://raw.githubusercontent.com/rafiki270/Punters/refs/heads/main/scripts/rpi-enable-kiosk.sh | sudo KIOSK_USER=kiosk bash -s -- client http://server.local`
- Server: `sudo KIOSK_USER=kiosk bash /opt/punters/scripts/rpi-enable-kiosk.sh server`
- Config file: `/etc/default/punters-kiosk` (fields: `MODE`, `CLIENT_URL`, `INSTALL_DIR`).

Display tuning
- Force mode/rate: add to `/etc/default/punters-kiosk`:
  - `FORCE_MODE=1920x1080` and `FORCE_RATE=60` (often best for TVs), or `FORCE_MODE=3840x2160` for 4K.
- 4K UI scale: `BROWSER_FLAGS="--high-dpi-support=1 --force-device-scale-factor=2"`.

Logs and troubleshooting
- Kiosk log: `~/.local/share/punters/kiosk.log` (or `/tmp/punters/kiosk.log`) for the autologin user.
- X startup: `~/.local/share/punters/startx.log` (or `/tmp/punters/startx.log`).
- Disable VNC overlay if not needed: `sudo systemctl disable --now vncserver-x11-serviced`.
- Remove old boot splash: `sudo bash /opt/punters/scripts/rpi-remove-splash.sh`.

### Docker-based install
We publish a multi-arch image (amd64, arm64) to GHCR on tagged releases. Prisma requires a 64-bit OS on Raspberry Pi (Pi 3/4/5 on 64-bit RPi OS).

Deploy to a Pi (or any Debian-based host) with:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/rafiki270/Punters/main/deploy/install.sh)" -- --port 80 --data-dir /opt/punters/data --image ghcr.io/rafiki270/punters:latest
```

Flags:
- `--port`: host port to expose (default 80)
- `--data-dir`: persistent data dir (default `/opt/punters/data`)
- `--watchtower`: include auto-updater service (optional)
- `--image`: container image (default placeholder; set to your GHCR image)

The script installs Docker + Compose (if needed), writes `/opt/punters/docker-compose.yml`, then runs `docker compose up -d`.

## Contributing
- Open issues or proposals based on REQUIREMENTS.md.
- Keep changes small and focused; we’ll evolve the structure incrementally.

## License
TBD.
