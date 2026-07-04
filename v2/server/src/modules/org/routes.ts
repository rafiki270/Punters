import type { FastifyInstance } from 'fastify'
import { httpError } from '../../core/errors'
import { getSettings } from '../settings/routes'

const RELAY_URL = () => process.env.RELAY_URL ?? 'http://localhost:4100'

/**
 * Thin proxy from the venue admin UI to the relay's shared-catalog management API.
 * The relay itself enforces the org-admin role check (see relay/src/core/guards.ts) —
 * this just forwards the signed-in browser's session token as the bearer.
 */
async function proxy(path: string, opts: { method?: string; token: string; body?: unknown }) {
  const res = await fetch(`${RELAY_URL()}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw httpError(res.status, (data as { error?: string }).error ?? 'Organisation request failed')
  return data
}

export async function orgRoutes(app: FastifyInstance) {
  app.get('/api/org/items', async (req) => {
    const token = req.cookies['punters_session']
    if (!token) throw httpError(401, 'Not signed in')
    const settings = await getSettings()
    if (!settings.orgId) throw httpError(428, 'Venue not bound yet')
    return proxy(`/relay/organisations/${settings.orgId}/items`, { token })
  })

  app.post('/api/org/items', async (req) => {
    const token = req.cookies['punters_session']
    if (!token) throw httpError(401, 'Not signed in')
    const settings = await getSettings()
    if (!settings.orgId) throw httpError(428, 'Venue not bound yet')
    return proxy(`/relay/organisations/${settings.orgId}/items`, { method: 'POST', token, body: req.body })
  })

  app.put('/api/org/items/:id', async (req) => {
    const token = req.cookies['punters_session']
    if (!token) throw httpError(401, 'Not signed in')
    const { id } = req.params as { id: string }
    return proxy(`/relay/items/${id}`, { method: 'PUT', token, body: req.body })
  })

  app.delete('/api/org/items/:id', async (req) => {
    const token = req.cookies['punters_session']
    if (!token) throw httpError(401, 'Not signed in')
    const { id } = req.params as { id: string }
    return proxy(`/relay/items/${id}`, { method: 'DELETE', token })
  })

  app.post('/api/org/categories', async (req) => {
    const token = req.cookies['punters_session']
    if (!token) throw httpError(401, 'Not signed in')
    const settings = await getSettings()
    if (!settings.orgId) throw httpError(428, 'Venue not bound yet')
    return proxy(`/relay/organisations/${settings.orgId}/categories`, { method: 'POST', token, body: req.body })
  })
}
