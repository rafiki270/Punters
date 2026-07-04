import { useState } from 'react'
import { TapsPanel } from './panels/TapsPanel'
import { ItemsPanel } from './panels/ItemsPanel'
import { PagesPanel } from './panels/PagesPanel'
import { ScreensPanel } from './panels/ScreensPanel'
import { MediaPanel } from './panels/MediaPanel'
import { SettingsPanel } from './panels/SettingsPanel'
import './admin.css'

const SECTIONS = [
  { id: 'taps', label: 'Taps', icon: '◨', node: <TapsPanel /> },
  { id: 'menu', label: 'Menu', icon: '≡', node: <ItemsPanel /> },
  { id: 'pages', label: 'Pages', icon: '▦', node: <PagesPanel /> },
  { id: 'screens', label: 'Screens', icon: '⧉', node: <ScreensPanel /> },
  { id: 'media', label: 'Media', icon: '▣', node: <MediaPanel /> },
  { id: 'settings', label: 'Settings', icon: '⚙', node: <SettingsPanel /> },
] as const

export function AdminApp() {
  const [section, setSection] = useState<string>('taps')
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
      </nav>
      <main className="admin-main">{SECTIONS.find((s) => s.id === section)?.node}</main>
    </div>
  )
}
