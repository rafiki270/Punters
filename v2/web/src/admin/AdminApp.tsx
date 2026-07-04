import { useEffect, useState } from 'react'
import { api } from '../api'
import type { AuthMe } from '../types'
import { TapsPanel } from './panels/TapsPanel'
import { ItemsPanel } from './panels/ItemsPanel'
import { PagesPanel } from './panels/PagesPanel'
import { ScreensPanel } from './panels/ScreensPanel'
import { MediaPanel } from './panels/MediaPanel'
import { SettingsPanel } from './panels/SettingsPanel'
import { SignIn } from './auth/SignIn'
import { BindVenue } from './auth/BindVenue'
import './admin.css'

const SECTIONS = [
  { id: 'taps', label: 'Taps', icon: '◨' },
  { id: 'menu', label: 'Menu', icon: '≡' },
  { id: 'pages', label: 'Pages', icon: '▦' },
  { id: 'screens', label: 'Screens', icon: '⧉' },
  { id: 'media', label: 'Media', icon: '▣' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
] as const

function panelFor(id: string) {
  switch (id) {
    case 'taps': return <TapsPanel />
    case 'menu': return <ItemsPanel />
    case 'pages': return <PagesPanel />
    case 'screens': return <ScreensPanel />
    case 'media': return <MediaPanel />
    case 'settings': return <SettingsPanel />
    default: return null
  }
}

export function AdminApp() {
  const [me, setMe] = useState<AuthMe | 'loading'>('loading')
  const [section, setSection] = useState<string>('taps')

  const refetchMe = () => api.get<AuthMe>('/api/auth/me').then(setMe)
  useEffect(() => {
    refetchMe()
  }, [])

  if (me === 'loading') return null
  if (!me.authenticated) return <SignIn />
  if (!me.venueBound) return <BindVenue me={me} onBound={refetchMe} />

  return (
    <div className="admin-root">
      <nav className="admin-rail">
        <div className="admin-brand">P</div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={section === s.id ? 'rail-item active' : 'rail-item'}
            onClick={() => setSection(s.id)}
          >
            <span className="rail-icon">{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
        <div className="spacer" />
        <a className="rail-item" href="/" target="_blank" rel="noreferrer">
          <span className="rail-icon">▶</span>
          <span>Display</span>
        </a>
        <button
          className="rail-item"
          onClick={() => api.post('/api/auth/logout').then(() => (window.location.href = '/admin'))}
        >
          <span className="rail-icon">⏻</span>
          <span>Sign out</span>
        </button>
      </nav>
      <main className="admin-main">{panelFor(section)}</main>
    </div>
  )
}
