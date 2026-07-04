import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { AuthMe, RelayMemberships } from '../../types'
import { Field, useToast } from '../../ui/components'

/**
 * Shown once, right after first sign-in on a fresh server: pick which venue this
 * physical server is, or create a brand-new organisation + first venue. Immutable
 * after binding — see AUTH_ARCHITECTURE.md's "Venue binding" section.
 */
export function BindVenue({ me, onBound }: { me: AuthMe; onBound: () => void }) {
  const [memberships, setMemberships] = useState<RelayMemberships | null>(null)
  const [mode, setMode] = useState<'pick' | 'create'>('pick')
  const [orgName, setOrgName] = useState('')
  const [venueName, setVenueName] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, show] = useToast()

  useEffect(() => {
    api
      .get<RelayMemberships>('/api/auth/relay-memberships')
      .then((res) => {
        setMemberships(res)
        if (res.teams.length === 0) setMode('create')
      })
      .catch((e) => show(e.message, true))
  }, [show])

  async function bind(teamId: number) {
    setBusy(true)
    try {
      await api.post('/api/auth/bind', { teamId })
      onBound()
    } catch (e) {
      show((e as Error).message, true)
      setBusy(false)
    }
  }

  async function createOrgAndVenue() {
    if (!orgName.trim() || !venueName.trim()) return show('Enter both an organisation and a venue name', true)
    setBusy(true)
    try {
      const org = await api.post<{ organisation: { id: number } }>('/api/auth/create-organisation', { name: orgName.trim() })
      const venue = await api.post<{ team: { id: number } }>('/api/auth/create-venue', { orgId: org.organisation.id, name: venueName.trim() })
      await bind(venue.team.id)
    } catch (e) {
      show((e as Error).message, true)
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card wide">
        <div className="auth-brand">P</div>
        <h1>Which venue is this?</h1>
        <p className="muted">Signed in as {me.user?.email}. This server needs to be bound to one venue — it can't be changed later.</p>

        {mode === 'pick' && memberships && (
          <>
            <div className="venue-list">
              {memberships.teams.map((t) => (
                <button key={t.teamId} className="venue-row" disabled={busy} onClick={() => bind(t.teamId)}>
                  <strong>{t.teamName}</strong>
                  <span className="faint">{t.orgName} · {t.teamRole ?? 'member'}</span>
                </button>
              ))}
            </div>
            <button className="btn ghost" onClick={() => setMode('create')}>+ Create a new organisation &amp; venue</button>
          </>
        )}

        {mode === 'create' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Organisation name">
              <input className="input" placeholder="e.g. Acme Taverns Group" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </Field>
            <Field label="This venue's name">
              <input className="input" placeholder="e.g. Acme Riverside" value={venueName} onChange={(e) => setVenueName(e.target.value)} />
            </Field>
            <button className="btn primary" style={{ height: 36 }} disabled={busy} onClick={createOrgAndVenue}>
              Create &amp; bind this server
            </button>
            {memberships && memberships.teams.length > 0 && (
              <button className="btn ghost" onClick={() => setMode('pick')}>← Back to my venues</button>
            )}
          </div>
        )}
        {toast}
      </div>
    </div>
  )
}
