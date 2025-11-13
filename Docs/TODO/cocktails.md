# Cocktails Feature Plan

## Scope & Requirements
- Introduce a dedicated **Cocktails** product type with image, name, manual ingredients block, and a single price (no serve sizes).
- Surface cocktails everywhere drinks currently appear: admin navigation (between `Taps` and `Other drinks`), display overlays, and arrangements/options panels.
- Provide a new display screen that mirrors the drinks layout but is tuned for cocktail metadata (image + ingredients + single price) and can be scheduled alongside drinks.
- Allow admins to decide per screen whether to show beers, drinks, cocktails, and media (supporting combinations like drinks+cocktails without beers).
- Ensure cocktail images are stored separately so they never show up in Media/ad playlists.
- Cocktails always inherit the global currency; there is no per-item override.
- Cocktails stay separate from the “Other drinks” experience—if cocktails are disabled, they simply disappear instead of falling back to the drinks page.

## High-Level Design Notes
- **Data model**: add `Cocktail` table (id, name, ingredientsText, priceMinor, currency, active, imageAssetId FK to `Asset`). Reuse Prisma relations, timestamps, and `Asset` tagging (`tag='cocktail:image'`) so uploads are isolated from Media assets. Currency should be auto-populated from global settings, and `active` behaves like drinks (soft enable/disable rather than hard delete).
- **APIs/Services**: new `createCocktailsService` (list/create/update/toggle-active). Expose Fastify routes under `/api/cocktails` (queryable by `active=true`) and register them in `buildApp`. Emit `emitChange('cocktails')` so connected displays reload.
- **Admin UI**: add a `CocktailsPanel` modelled after `DrinksPanel`/`BeersPanel` with a two-column layout (left list sorted alphabetically, right edit form). Support file uploads to `/api/upload` (tagging as `cocktail:image`), a textarea for ingredients, and a currency-aware single price input (display-only, still stored in minor units). Include an enable/disable toggle instead of destructive deletes.
- **Display data flow**: extend `useDisplayData` to fetch `/api/cocktails?active=true` and pass that list into `useSlides`. Add `Cocktail` types in `web/src/display/types.ts`.
- **Slide generation**: extend `Slide` union to include `'cocktails'`, add a `CocktailScreen.tsx` cloned from `DrinksScreen.tsx` (but showing ingredients + single price). `useSlides` should build cocktail pages using the same column/indent settings applied to drinks. Maintain rotation order as `beer pages → drinks pages (if enabled) → cocktail pages (if enabled) → ads`.
- **Content toggles**: expand `DisplayClient` state, prefs (`prefsStore`), sockets, and Admin Arrangements panel to track `showCocktails`. Update `modeFromContentFlags` to accept four booleans (`beer`, `drinks`, `cocktails`, `media`) while keeping the public modes (`everything`, `all`, `beer`, `drinks`, `ads`). `slideMatchesMode('drinks', …)` should treat both drinks + cocktails as valid.
- **UI affordance**: replace the dropdown in Arrangements → Options with checkbox groups (Beer, Drinks, Cocktails, Media) or extend the dropdown to include the new combinations (Drinks + Cocktails, Cocktails only, Beer + Cocktails, etc.). Persist selections by POSTing `{ showBeer, showDrinks, showCocktails, showMedia }`.
- **Media separation**: update `media/service.ts` and `routes/display.ts` asset filters so anything tagged `cocktail:image` never appears in Media or ad playlists. Prevent deletions from Media if an asset is referenced by a cocktail.
- **Testing**: extend `tests/display.mode.test.ts` for the new flag combos and add coverage for `cocktails` service logic (creation, currency validation, archive). Update any relevant snapshot/unit tests touching `DisplayMode`, device payloads, or slide building.

## TODO Checklist

### Data & Backend
- [x] Update `prisma/schema.prisma` with the `Cocktail` model (+ relation on `Asset`) and generate a migration; seed with sample data in `prisma/seed.ts`. No manual ordering field is required; cocktails are sorted by name at query time.
- [x] Implement `src/modules/inventory/cocktails.ts` mirroring the drinks service (list/create/update/toggle active/delete) and emit `cocktails` change events.
- [x] Add `/api/cocktails` routes (GET list with `active` filter, POST, PUT, DELETE) and register them in `buildApp` (no `/order` endpoint needed).
- [x] Extend `createMediaService.deleteAsset` guard + asset filters (`media/service.ts`, `routes/display.ts`) to respect the `cocktail:image` tag.
- [x] Update `src/app.ts`, `src/modules/devices/prefsStore.ts`, and related stores so `DisplayClient` payloads include `showCocktails`, persist it, and broadcast via sockets.

### Admin Experience
- [x] Insert the `Cocktails` tab between `Taps` and `Other drinks` in both `web/src/display/admin/AdminPage.tsx` and `AdminOverlay.tsx`.
- [x] Build `web/src/display/admin/panels/CocktailsPanel.tsx` with a responsive two-column layout (list on the left, edit form on the right) consistent with beer/drink panels, auto-sorting cocktails by name.
- [x] Support image upload (tagging as `cocktail:image`), preview/removal, enable/disable toggle, and a single price input stored in minor units (currency pulled from global settings).
- [x] Update Arrangements panel UI to expose Cocktails in the content selector (either via checkboxes or expanded dropdown options) and submit the new flag to `/api/clients/displays/:id/content`.

### Display Client
- [x] Extend `web/src/display/types.ts`, `useDisplayData`, and `useSlides` to fetch cocktails and build cocktail slides respecting drinks style settings (cell scale, indent, items per column).
- [x] Create `web/src/display/screens/CocktailsScreen.tsx` (copied from DrinksScreen) that renders the cocktail image, name, ingredients text, and single formatted price.
- [x] Update `renderSlide.tsx`, `slideMatchesMode`, and `modeFromContentFlags` to understand the `'cocktails'` slide type and the new showCocktails flag while keeping backwards compatibility.
- [x] Add `localShowCocktails` (and persistence) in `useDisplayPreferences` plus socket handling so local overrides and admin pushes stay in sync.

### QA & Documentation
- [x] Add/extend unit tests (`tests/display.mode.test.ts`, new `tests/inventory.cocktails.test.ts`, any service/controller tests) covering the new logic.
- [ ] Document the new API endpoints and admin workflow in `README.md` or an appropriate doc once implemented.
- [x] Verify migrations + Prisma client generation run cleanly (`npm run prisma:generate`, manual `tsc` + `node --test`) before shipping.
