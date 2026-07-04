import Fastify from 'fastify'

/**
 * A minimal stand-in for the real UOA service, used only so relay/tests can exercise
 * the full token-exchange → membership-bootstrap → session-mint chain without needing
 * the real UOA's human-in-the-loop onboarding approval. Response shapes match the
 * contracts documented at authentication.unlikeotherai.com/llm and /api.
 */
export async function buildFakeUoa(firstLogin?: Record<string, unknown>) {
  const app = Fastify({ logger: false })

  app.post('/auth/token', async (req) => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return { error: 'missing bearer' }
    return {
      access_token: FAKE_ACCESS_TOKEN,
      expires_in: 1800,
      refresh_token: `refresh_${Date.now()}`,
      refresh_token_expires_in: 2_592_000,
      token_type: 'Bearer',
      firstLogin: firstLogin ?? {
        memberships: { orgs: [], teams: [] },
        pending_invites: [],
        capabilities: { can_create_org: true, can_accept_invite: false },
      },
    }
  })

  app.post('/org/organisations', async (req) => {
    const body = req.body as { name: string; owner_id: string }
    return { orgId: `org_${body.owner_id}_${body.name.replace(/\s+/g, '_')}`, name: body.name }
  })

  app.post('/auth/revoke', async () => ({ ok: true }))

  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return { app, url: `http://127.0.0.1:${port}` }
}

// A JWT with header {"alg":"HS256"} and payload {"sub":"user_1","email":"bar@example.com"} —
// UOA access tokens are decoded (never verified) by the relay, so any well-formed JWT works.
export const FAKE_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEiLCJlbWFpbCI6ImJhckBleGFtcGxlLmNvbSJ9.fake-signature'
