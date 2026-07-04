import { createHash } from 'node:crypto'
import { httpError } from '../../core/errors'

/**
 * Server-to-server calls to UOA itself. `UOA_BASE_URL` points at the real service in
 * production and at a fake test double in relay/tests — nothing here is UOA-specific
 * beyond the base URL and the bearer derivation.
 */

export function clientHash(): string {
  const domain = process.env.UOA_DOMAIN!
  const secret = process.env.UOA_CLIENT_SECRET
  if (!secret) throw new Error('UOA_CLIENT_SECRET not set — complete relay onboarding first (see relay/README.md)')
  return createHash('sha256').update(domain + secret).digest('hex')
}

function configUrl(): string {
  return `${process.env.RELAY_PUBLIC_URL}/uoa/config`
}

export interface TokenExchangeResult {
  access_token: string
  expires_in: number
  refresh_token: string
  refresh_token_expires_in: number
  token_type: 'Bearer'
  firstLogin?: {
    memberships: {
      orgs: { orgId: string; role: string }[]
      teams: { teamId: string; orgId: string; role: string }[]
    }
    pending_invites: { inviteId: string; type: string; orgId: string; teamId: string; teamName: string }[]
    capabilities: { can_create_org: boolean; can_accept_invite: boolean }
  }
}

export async function exchangeCode(input: {
  code: string
  redirectUrl: string
  codeVerifier: string
}): Promise<TokenExchangeResult> {
  const res = await fetch(`${process.env.UOA_BASE_URL}/auth/token?config_url=${encodeURIComponent(configUrl())}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${clientHash()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: input.code, redirect_url: input.redirectUrl, code_verifier: input.codeVerifier }),
  })
  if (!res.ok) throw httpError(502, `UOA token exchange failed (${res.status})`)
  return (await res.json()) as TokenExchangeResult
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const res = await fetch(`${process.env.UOA_BASE_URL}/auth/revoke?config_url=${encodeURIComponent(configUrl())}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${clientHash()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!res.ok) throw httpError(502, `UOA revoke failed (${res.status})`)
}

/**
 * UOA documents org creation (`POST /org/organisations`) but no generic team-creation
 * endpoint — see AUTH_ARCHITECTURE.md's "documented API gap" section. Team/venue records
 * are therefore owned by the relay; this call only covers the organisation half.
 */
export async function createOrganisation(input: { name: string; ownerId: string }): Promise<{ orgId: string; name: string }> {
  const res = await fetch(`${process.env.UOA_BASE_URL}/org/organisations?config_url=${encodeURIComponent(configUrl())}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${clientHash()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.name, owner_id: input.ownerId }),
  })
  if (!res.ok) throw httpError(502, `UOA organisation creation failed (${res.status})`)
  const body = (await res.json()) as { orgId: string; name: string }
  return body
}
