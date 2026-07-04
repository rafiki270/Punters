import { createRemoteJWKSet, jwtVerify } from 'jose'
import { httpError } from './errors'

/**
 * Talks to the Punters relay (see v2/AUTH_ARCHITECTURE.md). Session verification is
 * stateless — the JWKS is fetched once and cached by `jose`, so the admin keeps working
 * through brief relay outages until a session's own expiry.
 */

function relayUrl(): string {
  return process.env.RELAY_URL ?? 'http://localhost:4100'
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
function sessionJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(`${relayUrl()}/relay/.well-known/jwks.json`))
  return jwks
}

export async function verifyRelaySession(token: string): Promise<{ sub: string; email: string }> {
  try {
    const { payload } = await jwtVerify(token, sessionJwks(), { algorithms: ['RS256'] })
    return { sub: payload.sub!, email: String(payload.email) }
  } catch {
    throw httpError(401, 'Invalid or expired session')
  }
}

async function relayFetch<T>(path: string, opts: { method?: string; token: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${relayUrl()}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw httpError(res.status, (data as { error?: string }).error ?? 'Relay request failed')
  return data as T
}

export interface RelayMemberships {
  orgs: { orgId: number; orgName: string; orgRole: string }[]
  teams: { orgId: number; orgName: string; teamId: number; teamName: string; teamRole: string | null }[]
}

export const relay = {
  memberships: (sessionToken: string) => relayFetch<RelayMemberships>('/relay/me/memberships', { token: sessionToken }),
  createOrganisation: (sessionToken: string, name: string) =>
    relayFetch<{ organisation: { id: number; name: string } }>('/relay/organisations', { method: 'POST', token: sessionToken, body: { name } }),
  createVenue: (sessionToken: string, orgId: number, name: string) =>
    relayFetch<{ team: { id: number; name: string } }>(`/relay/organisations/${orgId}/venues`, { method: 'POST', token: sessionToken, body: { name } }),
  bindVenue: (sessionToken: string, teamId: number) =>
    relayFetch<{ orgId: number; orgName: string; teamId: number; teamName: string; serviceToken: string }>(
      `/relay/venues/${teamId}/bind`,
      { method: 'POST', token: sessionToken },
    ),
  exchangeTicket: (ticket: string) =>
    fetch(`${relayUrl()}/session/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw httpError(res.status, (data as { error?: string }).error ?? 'Ticket exchange failed')
      return data as { sessionToken: string; claims: { sub: string; email: string } }
    }),
  theme: (serviceToken: string, teamId: number) =>
    relayFetch<{ theme: import('@punters/shared').OrgTheme }>(`/relay/teams/${teamId}/theme`, { token: serviceToken }),
  catalog: (serviceToken: string, teamId: number, since: number) =>
    relayFetch<import('@punters/shared').SharedCatalogDelta>(`/relay/teams/${teamId}/catalog?since=${since}`, { token: serviceToken }),
}
