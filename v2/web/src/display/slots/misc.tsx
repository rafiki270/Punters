import { useEffect, useState } from 'react'
import { formatMoney } from '@punters/shared'
import type { AdsSlotConfig, FeedAd, FeedItem, FeedSettings, ImageSlotConfig, SlotConfig, TextSlotConfig } from '@punters/shared'

export function ImageSlot({ config, urls }: { config: ImageSlotConfig; urls: { md: string; lg: string } | null }) {
  if (!urls) return <div className="slot-empty">Pick an image for this slot</div>
  return <div className={`image-slot ${config.fit}`} style={{ backgroundImage: `url(${urls.lg})` }} />
}

export function AdsSlot({ config, ads }: { config: AdsSlotConfig; ads: FeedAd[] }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (ads.length <= 1) return
    const t = setInterval(() => setIndex((i) => (i + 1) % ads.length), Math.max(3, config.intervalSec) * 1000)
    return () => clearInterval(t)
  }, [ads.length, config.intervalSec])

  if (ads.length === 0) return <div className="slot-empty">Upload media to rotate here</div>
  return (
    <div className="ads-slot">
      {ads.map((ad, i) => (
        <div
          key={ad.assetId}
          className={`ads-frame ${config.fit}${i === index % ads.length ? ' on' : ''}`}
          style={{ backgroundImage: `url(${ad.urls.lg})` }}
        />
      ))}
    </div>
  )
}

export function TextSlot({ config, settings }: { config: TextSlotConfig; settings: FeedSettings }) {
  return (
    <div className={`text-slot align-${config.align} size-${config.size}`}>
      <div className="text-title">{config.title ?? settings.venueName}</div>
      {config.body && <div className="text-body">{config.body}</div>}
    </div>
  )
}

export function FeaturedSlot({
  item,
  config,
  settings,
}: {
  item: FeedItem | null
  config: SlotConfig
  settings: FeedSettings
}) {
  if (!item) return <div className="slot-empty">Pick a featured item</div>
  const sub = [item.producer, item.style, item.abv != null ? `${item.abv}%` : null].filter(Boolean).join(' · ')
  return (
    <div className="featured-slot">
      {item.image && <div className="featured-media" style={{ backgroundImage: `url(${item.image.lg})` }} />}
      <div className="featured-body">
        {config.tagline && <div className="featured-tagline">{config.tagline}</div>}
        <div className="featured-name">{item.name}</div>
        {sub && <div className="featured-sub">{sub}</div>}
        {item.description && <div className="featured-desc">{item.description}</div>}
        {item.prices[0] && (
          <div className="featured-price">{formatMoney(item.prices[0].amountMinor, settings.currency, settings.locale)}</div>
        )}
      </div>
    </div>
  )
}

export function LogoSlot({ settings }: { settings: FeedSettings }) {
  return (
    <div className="logo-slot">
      {settings.logoUrls ? <img src={settings.logoUrls.md} alt={settings.venueName} /> : <span>{settings.venueName}</span>}
    </div>
  )
}

export function TickerSlot({ text }: { text: string }) {
  if (!text) return null
  return (
    <div className="ticker-slot">
      <div className="ticker-track">
        <span>{text}</span>
        <span aria-hidden>{text}</span>
      </div>
    </div>
  )
}

export function ClockSlot() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return <div className="clock-slot">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
}
