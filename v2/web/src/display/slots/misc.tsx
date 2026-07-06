import { useEffect, useState } from 'react'
import { formatMoney } from '@punters/shared'
import type { AdsSlotConfig, FeedAd, FeedItem, FeedSettings, ImageSlotConfig, SlotConfig, TextSlotConfig } from '@punters/shared'

/** Corner radius is authored at 1080p and scales with the actual viewport, matching
 * the row-height convention used elsewhere on the display (see MenuSlot). */
function cornerRadiusPx(config: { roundedCorners: boolean; cornerRadius: number }): string {
  if (!config.roundedCorners) return '0px'
  const vScale = window.innerHeight / 1080
  return `${Math.round(config.cornerRadius * vScale)}px`
}

export interface ImageSlotContent {
  imageUrls: { md: string; lg: string } | null
  mediaType?: 'image' | 'video'
  videoUrl?: string | null
}

export function ImageSlot({ config, content }: { config: ImageSlotConfig; content: ImageSlotContent }) {
  const { imageUrls, mediaType, videoUrl } = content
  const radius = cornerRadiusPx(config)
  if (mediaType === 'video' && videoUrl) {
    return (
      <video
        className={`image-slot ${config.fit}`}
        style={{ borderRadius: radius }}
        src={videoUrl}
        poster={imageUrls?.lg || undefined}
        autoPlay
        muted
        loop
        playsInline
      />
    )
  }
  if (!imageUrls) return <div className="slot-empty">Pick an image for this slot</div>
  return <div className={`image-slot ${config.fit}`} style={{ backgroundImage: `url(${imageUrls.lg})`, borderRadius: radius }} />
}

/** A video ad rotates on its own runtime — advance after min(durationSec, 120)s once known,
 * rather than the slot's fixed intervalSec (so a 30s promo plays through before cutting away). */
function adDwellSec(ad: FeedAd, intervalSec: number): number {
  if (ad.mediaType === 'video' && ad.durationSec != null) return Math.min(ad.durationSec, 120)
  return intervalSec
}

export function AdsSlot({ config, ads }: { config: AdsSlotConfig; ads: FeedAd[] }) {
  const [index, setIndex] = useState(0)

  // Per-ad setTimeout chain (rather than one fixed setInterval) so each ad can dwell for
  // its own duration — a known-length video plays through, everything else uses intervalSec.
  useEffect(() => {
    if (ads.length <= 1) return
    const current = ads[index % ads.length]
    const seconds = Math.max(3, adDwellSec(current, config.intervalSec))
    const t = setTimeout(() => setIndex((i) => (i + 1) % ads.length), seconds * 1000)
    return () => clearTimeout(t)
  }, [ads, index, config.intervalSec])

  if (ads.length === 0) return <div className="slot-empty">Upload media to rotate here</div>
  const radius = cornerRadiusPx(config)
  const activeIndex = index % ads.length
  return (
    <div className="ads-slot" style={{ borderRadius: radius }}>
      {ads.map((ad, i) => {
        const active = i === activeIndex
        const poster = ad.urls.lg
        return (
          <div
            key={ad.assetId}
            className={`ads-frame ${config.fit}${active ? ' on' : ''}`}
            style={{ backgroundImage: poster ? `url(${poster})` : undefined, borderRadius: radius }}
          >
            {/* Only the active frame's video is mounted, so inactive ads never decode in the background. */}
            {ad.mediaType === 'video' && active && ad.videoUrl && (
              <video
                key={ad.assetId}
                className={`ads-video ${config.fit}`}
                src={ad.videoUrl}
                poster={poster || undefined}
                autoPlay
                muted
                loop
                playsInline
              />
            )}
          </div>
        )
      })}
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
