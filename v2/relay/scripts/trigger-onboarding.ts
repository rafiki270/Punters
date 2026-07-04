import { randomBytes, createHash } from 'node:crypto'
import { spawn } from 'node:child_process'

/**
 * Automates the parts of "Real UOA onboarding" (see ../README.md) that are just HTTP
 * calls an operator would otherwise hand-construct: validating the deployed config_url,
 * then building and opening the PKCE discovery-trigger URL. It cannot do the two steps
 * that are inherently manual on UOA's side: a superuser approving the integration in
 * UOA's own admin, and a human clicking the emailed claim link to reveal the secret.
 *
 * Usage:
 *   npm run onboarding:trigger                # validate, then print + try to open the URL
 *   npm run onboarding:trigger -- --check-only # just run the validate check and stop
 */

const RELAY_PUBLIC_URL = requireEnv('RELAY_PUBLIC_URL')
const UOA_BASE_URL = requireEnv('UOA_BASE_URL')
const checkOnly = process.argv.includes('--check-only')

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing ${name} — set it in .env first (see relay/.env.example).`)
    process.exit(1)
  }
  return value
}

function base64url(buf: Buffer): string {
  return buf.toString('base64url')
}

async function validateConfig(): Promise<boolean> {
  const configUrl = `${RELAY_PUBLIC_URL}/uoa/config`
  console.log(`Validating ${configUrl} against ${UOA_BASE_URL}/config/validate ...`)
  let res: Response
  try {
    res = await fetch(`${UOA_BASE_URL}/config/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config_url: configUrl }),
    })
  } catch (err) {
    console.error(`Could not reach ${UOA_BASE_URL} at all: ${(err as Error).message}`)
    return false
  }

  const body = await res.json().catch(() => null)
  if (!res.ok || !body) {
    console.error(`/config/validate returned ${res.status}:`, body)
    return false
  }

  console.log(`ok: ${body.ok}`)
  if (Array.isArray(body.checks)) {
    for (const check of body.checks) console.log(`  - ${check.stage}: ${check.ok !== false ? 'pass' : 'FAIL'}`)
  }
  if (Array.isArray(body.issues) && body.issues.length) {
    console.log('Issues:')
    for (const issue of body.issues) console.log(`  - [${issue.stage}] ${issue.code}: ${issue.summary}`)
  }
  if (Array.isArray(body.recommendations) && body.recommendations.length) {
    console.log('Recommendations:')
    for (const rec of body.recommendations) console.log(`  - ${rec}`)
  }
  return !!body.ok
}

function buildDiscoveryUrl(): string {
  // A throwaway PKCE pair — this call only needs to *reach* UOA's auto-discovery
  // logic; nobody ever completes this particular authorization-code exchange.
  const codeVerifier = base64url(randomBytes(48))
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest())
  const params = new URLSearchParams({
    config_url: `${RELAY_PUBLIC_URL}/uoa/config`,
    redirect_url: `${RELAY_PUBLIC_URL}/auth/callback`,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${UOA_BASE_URL}/auth?${params}`
}

function tryOpen(url: string) {
  // Best-effort only: a missing opener (headless server, no desktop session) is expected,
  // not a failure — the URL is already printed above, so this must never crash the script.
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    const child = spawn(opener, [url], { stdio: 'ignore', detached: true })
    child.on('error', () => {}) // e.g. ENOENT when there's no opener — silently ignore
    child.unref()
  } catch {
    // Synchronous spawn failure (rare) — same as above, nothing more to do.
  }
}

async function main() {
  const valid = await validateConfig()
  if (!valid) {
    console.error('\nConfig did not pass validation — fix the issues above before triggering discovery.')
    process.exit(1)
  }
  if (checkOnly) return

  const url = buildDiscoveryUrl()
  console.log('\nConfig is valid. Triggering auto-discovery — this only needs to run once:')
  console.log(url)
  console.log('\nThis opens (or you should open) UOA\'s hosted page, which will show')
  console.log('"Integration pending review". From here the remaining steps are on UOA\'s')
  console.log('side: a superuser approves it in /admin > New Integrations, then UOA emails')
  console.log('the contact address a claim link for a human to open and reveal the secret')
  console.log('(see relay/README.md, steps 5-6) — nothing further here can do that for you.')
  tryOpen(url)
}

main()
