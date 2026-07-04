# Punters Relay

The one public HTTPS service in the whole system — see `../AUTH_ARCHITECTURE.md` for why
it exists and how login/binding/sync flow through it. Everything below the "Real UOA
onboarding" line is a **manual, one-time, human step**; nothing here can complete it for you.

## Local dev / test

```bash
npm install
npm run keys:generate        # prints two PKCS8 PEMs — paste into .env
cp .env.example .env         # then fill in the generated keys + a placeholder domain
npm run db:push
npm run dev                  # http://localhost:4100
```

`npm test` runs the full suite against a fake UOA test double (`tests/fakeUoa.ts`) —
that covers every line of relay code except the real UOA's hosted login UI itself.

## Real UOA onboarding

Steps 1-2 and 5-6 below are inherently manual (a real public deployment; a human approving
in UOA's admin and clicking an emailed link). Steps 3-4 — validating the config and
triggering the auto-discovery request — are automated by `npm run onboarding:trigger`
(`scripts/trigger-onboarding.ts`), so there's no URL to hand-build.

1. **Deploy the relay somewhere with a real public HTTPS hostname** (e.g.
   `cloud.punters.example`). `config_url`/`jwks_url`/`redirect_url` must all be reachable
   by UOA's backend — no loopback, no RFC1918, no VPN-only.
2. Set `.env`: `RELAY_PUBLIC_URL`, `UOA_DOMAIN` (must match that hostname), `UOA_CONTACT_EMAIL`,
   and the generated signing keys from `npm run keys:generate`.
3. **`npm run onboarding:trigger`** — validates the deployed config via UOA's own
   `POST /config/validate` (prints per-stage pass/fail and any recommendations; aborts here
   if it fails), then builds and opens the `/auth?config_url=...` discovery URL for you.
   (`npm run onboarding:check` runs just the validation, without triggering discovery.)
   You'll land on an "integration pending review" page.
4. **Wait for a human to approve it** in UOA's own admin (`/admin > New Integrations`) — this
   is on UOA's side, not ours.
5. UOA emails `contact_email` a claim link (valid 24h, single-use). Open it, click "Reveal
   secret", and immediately copy `client_secret` + `client_hash` into `.env`
   (`UOA_CLIENT_SECRET`, `UOA_CLIENT_HASH`) and your real secret store — it's shown once.
6. Run `npm run onboarding:check` again against your live `config_url` before pointing
   real users at it.

From here, `/login/start` on the deployed relay drives real logins end-to-end.

## Rotating the config-signing key

Add a **new** `kid` (never reuse one), update `CONFIG_SIGNING_KID`/`CONFIG_SIGNING_PRIVATE_KEY_PEM`,
redeploy. UOA re-fetches and re-verifies the config JWT on every auth request, so there's no
separate "activate" step — the new key takes effect on the next login.
