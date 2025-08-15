# Punters Taproom Display — Requirements

This document defines the scope, requirements, and architecture for a local-first web app that runs in a taproom to display currently available beers and scheduled promotional content on one or more TVs. It is the working source of truth for implementation and will be refined as we iterate.

## 1. Vision and Scope
- Operate primarily on a local network, hosted on a single “main” server device (often a Raspberry Pi), with one or more “client” display devices driving TVs.
- Single-server app: the same Node.js service provides the backend APIs and serves the web UI for Admin and Display.
- Display up-to-date beer lists and promotional slides/images with smooth rotation and synchronized multi-screen layouts.
- No hard limit on the number of physical screens in a group.
- Be simple to administer on-site with minimal technical overhead, resilient to unreliable internet, and safe for public display.

Terminology notes: prefer “Main” (server) and “Client” (display) to avoid legacy wording. The Main device holds the global settings.

Reference: `ARCHITECTURE.md` defines the architectural paradigm (modular monolith, layered routes/services/Prisma, validation with Zod, Socket.IO). Future changes should adhere to these conventions.

## 2. Personas and Roles
- Admin: Bar staff or owner who manages beers, media, layouts, schedules, devices, and global settings.
- Display Client: A browser or kiosk device connected to a TV; receives content and directions from the Main server.
- Viewer: Taproom guests; no interaction required.

## 3. Environments and Constraints
- Primary: Local network with no guaranteed internet access. Main device runs the server and can also act as a display.
- Typical host: Raspberry Pi 4 (2–8GB) or other small PC. Chromium-based kiosk browser for displays.
- Secondary: Standard desktop/laptop for development; optional Docker for convenience.
- Offline-first: Clients must keep a cached playlist and last-known assets to continue displaying during short outages.

## 4. Functional Requirements
### 4.1 Beer and Tap Management
- Create/update/archive beers with fields: name, brewery, style, ABV, IBU, description, colour, tags (e.g., vegan, gluten-reduced), badge image, and display flags.
- Taps are numeric only (1..N), where N is configurable per venue (some pubs have 4, some 35+).
- Assign beers to taps with quick actions (assign/clear/kicked/coming soon) and maintain a history to speed up re-assignment.
- Admin UI shows a tap count field and renders a row per tap with a whisperer (typeahead) to assign beers; filtering happens client-side; include a Clear action per row.
- Beer screens are auto-populated from the database (no manual composition required for beer list pages).
- Search/typeahead: assign flow provides a dropdown that searches historical beers (by name/brewery/style) to pre-populate fields and prices; new beers can be created inline if not found.
- Optional data import/export (CSV) for beers and prices.

### 4.2 Display Content and Layouts
- Slides: beer list views auto-populated from the database; promo/ad full-screen images; optional announcement text.
- Layouts: predefined templates optimized for 16:9 1080p and 4K screens; support orientation hints.
- Themes: light and dark modes, customizable colors, fonts, logo, background; saved as reusable profiles.
  - Default theme: dark mode.
- Transitions: simple and smooth (fade/slide) with configurable durations.
- Ad images render full-screen in aspect-fit (contain) mode to avoid cropping.

### 4.2.1 Beer List Row Layout
- Left: Beer badge image (typically circular; arbitrary shapes supported). Scales to a fixed visual size per layout; preserves image aspect.
- Center text block (between badge and right edge elements):
  - Row 1: Beer name — most prominent typography.
  - Row 2: Brewery name — secondary emphasis.
  - Row 3: Style and ABV — ABV displayed in bold next to style (confirmed).
- Right: Price — aligned to the far right of the row.
- Behavior: long text truncates with ellipsis; supports 1–2 lines for name if space allows. Prices use the configured currency format.
 - Sorting: beer rows are ordered by tap number ascending. Empty taps are omitted; e.g., if tap 1 is empty, tap 2 is first, tap 3 is second.

Pricing supports volumes; see 4.2.2 for volume display rules.

### 4.2.2 Pricing and Volumes (Display)
- Default volumes: Pint and Half Pint.
- Additional volumes supported: One Third Pint (1/3) and Two Thirds Pint (2/3); extensible for others.
- Display rule (MVP): show the primary price for the default volume (configurable per venue; default Pint). Secondary volumes may appear as a compact list or detail pane in a later phase.
 - Default prices: Global Settings define default price per volume. When creating a beer or assigning to a tap, missing prices are pre-filled from defaults and can be edited before saving. Support separate defaults for guest beers.

### 4.3 Rotation and Scheduling
- Single-screen mode: rotate through configured slides every X seconds.
- Multi-screen page mode: for two or more screens, display content sequentially in logical “pages” that can span multiple adjacent screens (commonly pairs). Example: two screens display page A left/right; then advance to page B left/right, etc.
- Unlimited screens: define a group with ordered screens [1..N]; content advances in synchronized steps across all N; pages may be defined for 1, 2, or more screens.
- Scheduling: time windows for specific slides or themes (e.g., weekday lunch menu, evening promos). Allow pinning a slide (pause rotation), skipping next, or temporarily hiding a slide.
- Pagination for beer pages: configurable columns and items-per-column per device; auto-generate pages based on total beers. Show footer with "Page X of Y • changes in T seconds" with a live countdown based on rotation time.
  - If only one page is present, hide the countdown footer.
- Data source for display: the beer list page consumes assigned taps sorted by tap number from the server.
 - Empty state: when no beers are assigned, display a centered message: "No beers are set yet".

### 4.4 Media and Asset Management
- Upload images (JPG/JPEG, PNG) via admin UI; configurable max size and dimension validation.
- Basic media library: list, preview, delete, tag, and schedule assets.
- Storage: local filesystem under a managed directory; cache-busted filenames.
- Rendering: ads use aspect-fit (contain) with letterboxing as needed; beer badges display alongside beer info.

### 4.5 Devices and Synchronization
- Device roles: Main (server) and Client (display). Main may also act as a client.
  - Process modes: The Node process runs in `server` (main) or `client` mode. In client mode, only limited settings and server selection are shown; all data comes from the main server.
- Discovery/pairing: simple join flow via QR code or short code; assign a client to a screen group and slot index.
  - Bonjour/mDNS discovery: main servers advertise via `_punters._tcp`; clients list discovered servers and can select one as their data source.
- Heartbeats: clients report online status, resolution/orientation, and version.
- Time sync: server provides epoch “ticks” for synchronized transitions across clients; tolerate small drift.
- Offline behavior: clients cache the playlist and assets; if disconnected, keep playing last-known rotation.
- Per-device layout: configure number of columns and items per column for beer pages; device uses these to paginate.
- Tap count is independent of device layout; Admin can set tap count in Settings and assign beers accordingly.

### 4.6 Administration and Control
- Web admin panel hosted by the main server: manage beers, media, layouts, schedules, themes, devices, and global settings.
- Live control: pause/resume rotation, skip to next slide, blackout screens, preview on admin device.
- Audit trail: minimal event log (who changed what, when) stored locally.
- Controls auto-hide: settings and control chrome hide on inactivity (e.g., no mouse/touch for N seconds); reappear on interaction.
  - Admin is accessible as an overlay within the Display view; Display is the default route.
 - Admin UI modality: Admin screens appear as modal overlays on top of the Display (Settings, Sizes, Beers, Taps, Media). After a successful change, data refreshes in place (no full page reload) so the Display updates immediately.
 - Defaults management: Admin can set default prices per volume, and optionally separate defaults for guest beers, used as prefill during beer creation/tap assignment.

### 4.7 Authentication and Access
- Local-first auth: single admin password configured in Settings on the Main device. Default: no password required (off). When enabled, gate Admin endpoints and UI.
- Optional network exposure is disabled by default; CORS and CSRF protections when enabled.
- Role model (future): Owner, Staff with scoped permissions.

### 4.8 Global and Device Settings
- Global settings (owned by Main):
  - Theme mode: `light` or `dark` (default: `light`).
  - Rotation time: integer seconds (default: 90 seconds).
  - Default display mode for clients: `all` (rotate), `beer` (beer pages only), or `ads` (ads only) — default: `all`.
  - Default primary volume for display pricing (default: Pint).
  - Default prices per volume (e.g., Pint £6, Half Pint £3); optional overrides for guest beers.
  - Locale/language for UI.
- Device-level settings (per Client):
  - Display mode: can be set to `inherit` (use global default), or explicitly `all` / `beer` / `ads`.
  - Beer layout: columns and items-per-column.
  - Device inherits other global settings unless otherwise specified.

## 5. Non-Functional Requirements
- Performance: target 60 FPS animations on 1080p displays; server must comfortably run on a Pi 4.
- Reliability: auto-start on boot; survive power loss without data corruption; watchdog restarts on crash.
- Security: local network by default; validate uploads, limit file types/sizes; sanitize all inputs.
- Observability: human-readable logs; device status dashboard (online/offline, last heartbeat).
- Maintainability: TypeScript across stack; clear module boundaries; minimal external dependencies.
- Internationalization: Admin and Display UIs are translatable (strings externalized); content (beer names, etc.) remains single-language.
- Responsive/mobile-first: Admin UI optimized for mobile control; displays scale for TVs.

## 6. Architecture Overview
- Single-server Node.js app (monolith): Fastify HTTP API + Socket.IO realtime, also serves built frontend assets.
- Frontend: React + Vite + TypeScript; PWA for installable, offline-capable displays and admin.
- UI framework: Tailwind CSS for styling; lightweight headless components for admin forms and modals.
- i18n: i18next (or equivalent) for runtime translation loading; locale stored in settings.
- Data: SQLite via Prisma (local file DB) for easy Pi deployment; file storage for media under `data/media/`.
- Indexes: search-optimized indexes on beer name/brewery/style for fast typeahead on modest hardware.
- Sync model: server is the clock source; clients subscribe to playlist updates and tick events; clients render based on schedule metadata and device/global settings.
- Packaging: systemd service on Pi; Docker Compose for one-command install on other hosts.

## 7. Data Model (initial draft)
- GlobalSettings (singleton): id, themeMode('light'|'dark'), rotationSec(default 90), defaultDisplayMode('all'|'beer'|'ads'), currency (e.g., 'GBP'/'EUR'), defaultSizeId, locale (e.g., 'en-GB'), updatedAt.
- Beer: id, name, brewery, style, abv, ibu, description, colorHex, tags, badgeAssetId, isGuest (boolean), active, createdAt, updatedAt.
- ServeSize: id, name (e.g., Pint, Half Pint, 1/3 Pint, 2/3 Pint), volumeMl, displayOrder.
- Price: id, beerId, serveSizeId, amountMinor, currency.
- Tap: id, number (unique), beerId, status (string: 'on'|'off'|'coming_soon'|'kicked'), notes.
- TapAssignment: id, tapNumber, beerId, assignedAt, removedAt, removedReason('kicked'|'cleared'|'replaced').
- Asset: id, type (image), filename, mimeType, width, height, sizeBytes, data (binary), tags, createdAt.
- DefaultPrice: id, serveSizeId, amountMinor, isGuest(boolean). Unique per (serveSizeId, isGuest).
- Theme: id, name, colors, fonts, logoAssetId.
- Slide: id, type (beerList, promoImage, announcement), config (JSON), durationSec, enabled.
- Playlist: id, name, slideIds, themeId, schedule (cron or time windows), active.
- Device: id, name, role (main/client), screenGroupId, screenIndex, displayMode('inherit'|'all'|'beer'|'ads'), beerColumns, itemsPerColumn, width, height, orientation, lastSeenAt, version.
- ScreenGroup: id, name, screenCount, playlistId.

## 8. Display Behavior and Pairing Logic
- Vocabulary: “Screen” is a physical TV; “Page” is a logical unit of content that may span 1..N screens.
- Single-screen: advance slides sequentially; duration per slide governs timing.
- Multi-screen (N ≥ 2):
  - For pages spanning multiple screens (commonly two), the server emits page steps; clients render their segment based on index within the group (e.g., left/right halves for pairs).
  - For content not requiring spanning (e.g., ads), render per-screen variants while maintaining synchronized step changes.
  - Clients start transitions on server ticks (e.g., every second) and switch exactly at aligned boundaries (e.g., end of duration).
- Drift handling: clients adjust to the next boundary if local time deviates beyond a threshold (e.g., >150ms).
- Content selection: device’s effective display mode = device.displayMode unless `inherit`, then use global defaultDisplayMode.
- Layout selection: device uses its beerColumns and itemsPerColumn to partition beers into pages; multi-screen groups keep page step alignment.

## 9. APIs (initial sketch, consolidated)
- Beers:
  - GET `/api/beers` (list, filters), GET `/api/beers/:id`, POST `/api/beers`, PUT `/api/beers/:id`, DELETE `/api/beers/:id` (archive)
  - GET `/api/beers/search?q=...&limit=` (typeahead by name/brewery/style)
- Taps:
  - GET `/api/taps` (current assignments and statuses)
  - PUT `/api/taps/config` (set tap count N)
  - PUT `/api/taps/:number/assign` (assign existing beerId or create+assign via payload)
  - DELETE `/api/taps/:number/assign` (clear assignment)
  - POST `/api/taps/:number/status` (set status: on/off/coming_soon/kicked)
  - GET `/api/taps/:number/history` (recent TapAssignment records)
- Sizes & Prices:
  - GET `/api/sizes`, POST `/api/sizes`, PUT `/api/sizes/:id`, DELETE `/api/sizes/:id`
  - GET `/api/beers/:id/prices`, PUT `/api/beers/:id/prices` (upsert per size)
- Media: POST `/api/upload`, CRUD `/api/assets`
- Settings: GET/PUT `/api/settings` (global), GET `/api/i18n/:locale` (translations)
  - Global settings payload includes: themeMode, rotationSec, defaultDisplayMode, defaultSizeId, currency, defaultPrices, defaultGuestPrices, locale.
- Devices & Groups: CRUD `/api/devices`, `/api/screengroups`
 - Display: `GET /api/display/beerlist` (assigned beers, tap order), `GET /api/display/ads` (ad assets)

## 10. Admin UI (initial sketch)
- Dashboard: live status of devices, playlist in effect, quick controls.
- Beers: CRUD, price management per size; quick actions. Beer create/edit supports uploading a badge image within the same flow; images are linked to the beer and stored as Assets.
- Taps: Assign/search dropdown with typeahead, clear/kick/coming soon; quick re-assign from recent history.
- Media: upload, preview, tag, schedule.
- Display: choose layout and theme, preview.
- Scheduling: assign playlist to screen groups, define time windows.
- Settings: global theme mode (light/dark), rotation time (default 90s), default display mode, locale, currency, default display size; device page sets per-device display mode and beer layout (columns/items).

## 11. Deployment and Operations
- Raspberry Pi
  - Install Node LTS (v20+), enable kiosk mode (Chromium), auto-login to launch client in full-screen.
  - Run server as `systemd` service; logs to journal and rotating files.
  - Data stored under `data/` with backups/export via admin UI.
- Desktop/Server
  - Docker Compose for a one-command install (server + static assets). Alternative: system install script for Node + service.
  - Development convenience: `make launch` performs Prisma generate/migrate/seed and starts web (5173) and API (3000) together.
- Networking
  - Local hostname (mDNS): e.g., `http://punters.local`.
  - QR code onboarding for client devices; short pairing code fallback.

## 12. Security and Privacy
- Default bind to LAN only; no WAN exposure without explicit opt-in.
- CSRF/CORS protections for admin; session timeout; bcrypt/argon2 for secrets.
- Validate and sanitize user inputs; antivirus scanning is out of scope but size/type checks enforced.

## 13. Testing Strategy
- Unit tests for core logic (pairing, schedule/tick calculations, playlist builder).
- Unit tests for settings inheritance and effective display mode resolution.
- Unit tests for pagination logic (columns/items per device) and countdown timer.
- Integration tests for API endpoints and DB persistence.
- UI smoke tests for critical admin flows (taps assignment, beer CRUD, pricing updates).
- On-device checks: performance budget on Pi (FPS, CPU), offline cache behavior.
- i18n snapshot tests for critical UI strings.

## 14. MVP Definition
- Admin can manage beers (name, brewery, style, ABV, colour, badge image) and upload JPG/PNG ads.
- Volumes and pricing: manage default sizes (Pint, Half Pint) plus 1/3 and 2/3; set prices per beer per size. Display primary volume price in list.
- Global settings: set light/dark theme, rotation time (default 90s), locale, default display size.
- Devices inherit global settings; per-device can choose display mode (ads/beer/all or inherit) and beer layout (columns/items).
- Single-screen rotation with configurable durations.
- Multi-screen page mode for two or more screens with synchronized steps; paired pages render side-by-side.
- Local auth (single admin account), SQLite storage, file-based media storage.
- PWA client that caches assets and last playlist; basic fade transitions.
- i18n infrastructure in place; mobile-first admin.
- Docker Compose file for easy install.
- Tap management: set tap count, assign/clear/kick, search and reuse past beers; view recent history per tap.

## 15. Phase 2 Roadmap (selected)
- Advanced scheduling (calendars, special events), announcements ticker.
- Role-based access control; multi-user activity log.
- More layouts and animations; video support (if feasible on Pi).
- Remote management and cloud backup (opt-in).
- Device auto-discovery and zero-touch pairing.
- Optional per-device theme override or ambient-light auto theme.
- Tap analytics and sales integration (optional).

## 16. Open Questions
- Tap-specific pricing overrides needed or are prices strictly per beer per size?
- Should devices be allowed to override theme mode or rotation time individually?
- Price model details (tiers, tax/VAT) and currency handling preferences.
- Required slide types beyond beer list and ads (e.g., events, QR menu, WiFi info)?
- Any asymmetric layouts or pages spanning >2 screens to support from day one?
- Media constraints: preferred max file size/dimensions for uploads.

---
Document version: 0.5 (taps numeric, history/typeahead, consolidated APIs, pagination and countdown).
