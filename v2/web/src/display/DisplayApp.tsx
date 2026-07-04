import { useEffect, useMemo, useState } from 'react'
import { rotationState } from '@punters/shared'
import { useFeed } from './useFeed'
import { TemplateRenderer } from './TemplateRenderer'
import './display.css'

export function DisplayApp() {
  const { feed, error, serverNow } = useFeed()
  const [, force] = useState(0)
  // Independent-rotation screens anchor to their own boot time instead of the zone epoch.
  const localEpoch = useMemo(() => Date.now(), [])

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [])

  if (error && !feed) return <CenterMessage title="Punters" body={error} />
  if (!feed) return <CenterMessage title="Punters" body="Connecting…" />

  if (feed.screen.pairCode) {
    return (
      <CenterMessage
        title={feed.settings.venueName}
        body="Add this screen in Admin → Screens with the code"
        code={feed.screen.pairCode}
      />
    )
  }

  const activePages = feed.pages
  if (!feed.zone || activePages.length === 0) {
    return <CenterMessage title={feed.settings.venueName} body="No pages scheduled for this screen yet." />
  }

  const epoch = feed.zone.rotationMode === 'zone' ? feed.zone.rotationSinceMs : localEpoch
  const rot = rotationState(activePages, epoch, serverNow())
  const page = activePages[Math.max(0, rot.index)]

  return (
    <div className="display-root" data-theme={feed.settings.theme}>
      <TemplateRenderer key={page.id} page={page} settings={feed.settings} elapsedSec={rot.elapsedSec} />
      {activePages.length > 1 && (
        <div className="display-footer">
          {page.name} · {rot.remainingSec}s
        </div>
      )}
    </div>
  )
}

function CenterMessage({ title, body, code }: { title: string; body: string; code?: string }) {
  return (
    <div className="display-root">
      <div className="display-center">
        <div className="display-center-title">{title}</div>
        <div className="display-center-body">{body}</div>
        {code && <div className="display-pair-code">{code}</div>}
      </div>
    </div>
  )
}
