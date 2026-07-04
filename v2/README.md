# Punters v2

The ground-up rewrite: a modular, template-driven menu display platform for bars,
taprooms, breweries, and restaurants. See `ARCHITECTURE.md` for the full design.

## Quick start

```bash
cd v2
npm install
npm run db:push      # create the SQLite database
npm run db:seed      # defaults + demo catalog, taps, and a sample zone
npm run start        # server on http://localhost:4000
```

- **`/`** — the display surface. Open it on any TV: it shows a 6-character pair code.
- **`/admin`** — the console: Taps, Menu, Pages, Screens, Media, Settings.

Development (hot reload): `npm run dev` (API on 4000, Vite on 5174 with proxying).
Production build of the web app: `npm run build` — the server serves `web/dist` automatically.

## The 5-minute venue setup

1. **Settings** — venue name, currency, theme, logo.
2. **Taps** — set how many taps you have; assign beers by typing (create inline if new).
3. **Menu** — add wines, cocktails, food (categories, photos, dietary flags, prices).
4. **Screens** — create a zone (e.g. “Left wall”), open `/` on each TV, claim its code.
5. **Pages** — add pages from the 30-template gallery, tune each slot, set durations.

Every TV in a zone rotates in perfect sync; add a second zone for an independent wall.
A device with multiple outputs runs one browser window per output — each is its own screen.

## Tests

```bash
npm test    # shared math + template registry, then server API suite
```
