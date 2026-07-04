# Authentication & Organisation Architecture

Punters v2 integrates [UnlikeOtherAuthenticator (UOA)](https://authentication.unlikeotherai.com)
for login, and layers a Punters-specific **relay** service on top to solve two things UOA
doesn't: (1) local venue servers have no public HTTPS hostname, which UOA's config/redirect
rules require, and (2) sharing branding and menus across venues in an organisation is a
Punters concept, not a UOA one.

## Why a relay exists

UOA's contract (`/llm`) is strict: `config_url`, `jwks_url`, and `redirect_url` must all be
public HTTPS, non-loopback, non-RFC1918. A venue's Punters server is a Raspberry Pi (or
similar) on the venue's own LAN — exactly the kind of address UOA refuses to fetch or
redirect to. So the **relay** (`v2/relay/`) is the one public HTTPS service in the whole
system: it is Punters' single UOA integration ("domain" in UOA's terms), and every venue's
local server talks to it, never to UOA directly.

```
Browser (on venue LAN)  ──►  Relay (public HTTPS)  ──►  UOA
        ▲                         │
        └── one-time ticket ──────┘
        │
        ▼
Venue's local Fastify server (LAN-only, no public hostname)
```

## Login flow (browser + local admin + relay + UOA)

1. Local admin has no session → shows "Sign in" → browser navigates to
   `https://<relay>/login/start?returnTo=<local-admin-origin>/admin/auth/callback`.
2. Relay generates a PKCE pair, stores `{codeVerifier, returnTo}` under an opaque `state`
   (short-lived `PkceState` row, referenced by a cookie), and redirects the browser to
   UOA's `/auth?config_url=<relay config>&redirect_url=<relay's own HTTPS callback>&code_challenge=...`.
3. UOA authenticates the user and redirects to the relay's fixed callback with `?code=...`.
4. Relay (server-to-server) exchanges the code at `POST /auth/token` using its `client_hash`
   bearer + the stored PKCE verifier, gets `access_token`/`refresh_token`/`firstLogin`,
   persists the refresh token, and mirrors the user (`uoaSub`, email).
5. Relay mints its **own** short-lived RS256 session JWT (claims: `sub`, `email`, and — once
   bound — `orgId`/`orgRole`/`teamId`/`teamRole`), stores it behind a one-time opaque
   `LoginTicket`, and redirects the browser to `returnTo?ticket=<opaque>`.
6. The venue's local server receives that request, calls the relay server-to-server
   (`POST /relay/session/exchange {ticket}` — one-time, 60s expiry), gets the session JWT,
   sets it as an `httpOnly` cookie, and redirects the browser to `/admin`.
7. From then on the local server verifies the cookie **statelessly** against the relay's own
   published JWKS (`GET /relay/.well-known/jwks.json`, cached ~10 min) — no relay call needed
   per request, so the admin keeps working through brief relay outages until the session expires.

This mirrors the exact code-for-token exchange pattern UOA itself uses one level up
(never put the real token in a URL; hand back an opaque, one-time, short-lived reference
instead) — same shape, applied to the relay→venue hop.

## Venue binding (org/team ↔ this physical server)

A freshly-flashed venue server is authenticated but **unbound**: it doesn't yet know which
organisation/team it belongs to. After first login, `GET /api/auth/me` reports
`venueBound: false` and the admin shows a one-time bootstrap screen:

- **Account already has team memberships** → picker: "Which venue is this?" Selecting one
  calls `POST /relay/venues/:teamId/bind`, which mints a **`VenueServiceToken`** (a durable,
  non-human credential, separate from the browser session) and returns
  `{orgId, teamId, orgName, teamName, serviceToken}`. The local server writes these into its
  singleton `Settings` row and never asks again (same pattern as the existing `mode` field).
- **No memberships, can create an org** → "Create your organisation and first venue" form.
- **No memberships, can only accept an invite** → "Accept invitation" screen.
- **Neither** → "Contact your organisation admin" — Punters does **not** invent a synthetic
  tenant, per UOA's own explicit guidance.

The `VenueServiceToken` (not the human session) is what the local server uses for all
*unattended* relay calls — pulling shared-catalog/theme deltas on a timer, independent of
whether any browser is currently signed in.

## Documented API gap: no generic "create team" endpoint

UOA's contract documents `POST /org/organisations` (create org) and team **invitation**
endpoints, but no generic `POST .../teams` to create a new team under an org. Since "venue"
(team) creation is core to Punters (a chain onboarding its second, third, tenth location),
the relay has to do something reasonable in that gap:

- When binding adopts a team UOA already told us about (via `firstLogin.memberships.teams[]`
  or a later `GET /org/me`), the relay's `Team.uoaTeamId` is the real UOA id.
- When a venue is created **within Punters** with no matching UOA team yet, the relay mints
  a synthetic id (`local:<cuid>`) so the rest of the system (roles, catalog scoping, service
  tokens) works uniformly, and flags it (`Team.uoaLinked = false`) so it's visibly a
  Punters-side placeholder rather than something silently passed off as UOA-native. If UOA
  adds a real team-creation endpoint later, this is the one seam that needs updating
  (`relay/src/modules/orgs/routes.ts`, `createVenue`).

## Sharing model: organisation → venue

Chosen model: **live sync with per-item unlink** (not fork-on-every-edit, not branding-only).

- The relay owns the canonical **shared catalog**: `SharedCategory` / `SharedItem` per
  organisation, plus an `Organisation.catalogVersion` counter bumped on every shared write.
- Every venue's local server polls `GET /relay/teams/:teamId/catalog?since=<version>`
  (default every 20s, matching the existing Screens-panel polling cadence) using its
  `VenueServiceToken`, and upserts the delta into its own local `Item`/`Category` tables.
- A local `Item` gets two new columns: `sharedItemId` (nullable — which org item it mirrors)
  and `overridden` (bool). Sync **skips** any item with `overridden = true` — that venue owns
  it locally from that point on and stops receiving organisation-wide updates for it.
- Editing a shared item's fields in the venue admin prompts: *"This will unlink the item from
  the Organisation catalog — you'll manage it locally and won't receive future
  organisation-wide updates."* Confirming sets `overridden = true` and applies the edit.
  There's also an explicit "Unlink" action for the same effect without editing first.
- **Theme** (colors, fonts, logo) follows the identical shape at the field-group level:
  `Organisation` holds the shared theme; venue `Settings.themeOverrides` is a sparse JSON
  object of just the fields a venue has chosen to customize, merged over the org theme at
  render time (`shared/src/relay.ts#mergeTheme`, pure + unit-tested).
- Deletes: the relay never hard-deletes a `SharedItem` that venues have mirrored without
  `overridden`; it sets `active: false` and that flows through the same delta pull, hiding it
  on displays without silently orphaning a venue's locally-forked copy of the same item.

## What's out of scope for this pass

- Push-based sync (Socket.IO from relay to venue) — polling is simpler to get right first;
  the relay's `catalogVersion` counter is the seam a future push channel would hang off.
- 2FA, SCIM, admin API keys, the OAuth 2.1 public-client (MCP) profile — none of that serves
  Punters' venue-login use case.
- Actually completing UOA's "auto-onboarding" handshake against the real production service.
  That requires generating a real keypair, deploying the relay somewhere with a real public
  hostname, hitting `/auth?config_url=...` once, and a human clicking the emailed claim link
  (or a superuser revealing the secret in UOA's admin UI) — inherently a manual, one-time,
  human step. See `v2/relay/README.md` for the exact checklist. Everything up to that
  boundary (the config/JWKS endpoints, the token-exchange code, the whole relay↔venue chain)
  is implemented and tested against a fake UOA test double in `relay/tests/`.
