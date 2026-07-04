# Punters v2

The ground-up rewrite: a modular, template-driven menu display platform for bars,
taprooms, breweries, and restaurants. See `ARCHITECTURE.md` for the layout/display design
and `AUTH_ARCHITECTURE.md` for authentication, organisations, and menu sharing.

## Workspaces

- `shared` — types, template registry, rotation/autofit math, org-theme/sharing helpers.
- `relay` — the one public HTTPS service: UOA login, organisations/venues, shared catalog.
- `server` — one venue's local server (Fastify + SQLite): taps, menu, screens, display feed.
- `web` — the display renderer (`/`) and admin console (`/admin`).

## Quick start (single venue, no auth)

```bash
cd v2
npm install
cp server/.env.example server/.env   # local SQLite path (no secrets)
npm run db:push      # create the SQLite database
npm run db:seed      # defaults + demo catalog, taps, and a sample zone
AUTH_DISABLED=true npm run start   # server on http://localhost:4000, admin ungated
```

- **`/`** — the display surface. Open it on any TV: it shows a 6-character pair code.
- **`/admin`** — the console: Taps, Menu, Pages, Screens, Media, Settings.

Development (hot reload): `npm run dev` (API on 4000, Vite on 5174 with proxying).
Production build of the web app: `npm run build` — the server serves `web/dist` automatically.

## With authentication and organisations

Real venues sign in through the **relay** (see `AUTH_ARCHITECTURE.md`) — one venue signs
in, picks or creates its organisation, and from then on the admin is gated behind that
login. To run it locally:

```bash
cd v2/relay
npm install && npm run keys:generate   # paste the two printed keys into .env
cp .env.example .env
npm run db:push
npm run dev     # relay on http://localhost:4100

cd ../server
# set RELAY_URL / RELAY_PUBLIC_URL in .env (defaults already point at localhost:4100)
npm run dev     # AUTH_DISABLED must be false/unset for the gate to apply
```

Completing a real login requires the real UOA service, which needs a one-time human
approval step — see `relay/README.md` for the exact checklist, and `relay/tests/fakeUoa.ts`
for a stand-in used by the test suite (and by hand, for local click-through testing without
touching the real service).

## The 5-minute venue setup

1. **Sign in** — first login on a fresh server prompts you to create an organisation and
   this venue, or pick an existing venue if your account already has one.
2. **Settings** — venue name, currency, theme, logo; organisation-shared colours/menu
   items appear here too, with a per-venue "customize" override.
3. **Taps** — set how many taps you have; assign beers by typing (create inline if new).
4. **Menu** — add wines, cocktails, food (categories, photos, dietary flags, prices).
   Items shared from your organisation show a "shared" badge and sync automatically;
   editing one unlinks just that item.
5. **Screens** — create a zone (e.g. "Left wall"), open `/` on each TV, claim its code.
6. **Pages** — add pages from the 30-template gallery, tune each slot, set durations.

Every TV in a zone rotates in perfect sync; add a second zone for an independent wall.
A device with multiple outputs runs one browser window per output — each is its own screen.

## Tests

```bash
npm test    # shared math + template registry, then relay, then server (45 tests)
```
