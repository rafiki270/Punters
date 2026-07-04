import { useEffect, useState } from 'react'
import { api } from '../../api'

/** Shown when no valid session exists. Sends the browser to the relay's hosted login,
 * which redirects back to this same origin's /admin/auth/callback once done. */
export function SignIn() {
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ loginUrl: string }>('/api/auth/config')
      .then((res) => setLoginUrl(res.loginUrl))
      .catch((e) => setError(e.message))
  }, [])

  function signIn() {
    if (!loginUrl) return
    const returnTo = `${window.location.origin}/admin/auth/callback`
    window.location.assign(`${loginUrl}?returnTo=${encodeURIComponent(returnTo)}`)
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">P</div>
        <h1>Punters</h1>
        <p className="muted">Sign in to manage this venue.</p>
        {error && <div className="error-text">{error}</div>}
        <button className="btn primary" style={{ height: 36, width: '100%' }} disabled={!loginUrl} onClick={signIn}>
          Sign in
        </button>
      </div>
    </div>
  )
}
