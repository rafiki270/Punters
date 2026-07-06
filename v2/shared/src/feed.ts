import type { ItemKind, DietaryFlags } from './kinds'
import type { SlotConfig } from './templates/types'

/**
 * The resolved display feed: everything a screen needs to render its zone's rotation.
 * The server resolves menu sources, featured items, and ad playlists at request time;
 * screens re-fetch (debounced) when a `changed` socket event arrives.
 */

export interface AssetUrls {
  thumb: string
  sm: string
  md: string
  lg: string
}

export interface FeedPrice {
  amountMinor: number
  /** Serve size name, or null for a single price. */
  sizeName: string | null
}

export interface FeedItem {
  id: number
  kind: ItemKind
  name: string
  producer: string | null
  style: string | null
  abv: number | null
  description: string | null
  categoryId: number | null
  categoryName: string | null
  tapNumber: number | null
  dietary: DietaryFlags
  spicyLevel: number
  image: AssetUrls | null
  badge: AssetUrls | null
  prices: FeedPrice[]
}

export interface FeedAd {
  assetId: number
  urls: AssetUrls
  width: number | null
  height: number | null
  mediaType: 'image' | 'video'
  /** /media/... URL of the stored original file; only set when mediaType is 'video'. */
  videoUrl: string | null
  /** Known video duration, when ffprobe was available at upload time. */
  durationSec: number | null
}

export interface FeedSlotContent {
  /** For menu slots. */
  items?: FeedItem[]
  /** For featured slots. */
  featured?: FeedItem | null
  /** For ads slots. */
  ads?: FeedAd[]
  /** For image slots: poster/image URLs, or null if a video asset has no poster. */
  imageUrls?: AssetUrls | null
  /** For image slots: whether the configured asset is a video. */
  mediaType?: 'image' | 'video'
  /** For image slots holding a video asset. */
  videoUrl?: string | null
  durationSec?: number | null
}

export interface FeedPage {
  id: number
  name: string
  templateId: string
  durationSec: number
  config: Record<string, SlotConfig>
  content: Record<string, FeedSlotContent>
}

export interface FeedSettings {
  venueName: string
  currency: string
  locale: string
  theme: 'dark' | 'light'
  logoUrls: AssetUrls | null
  backgroundUrls: AssetUrls | null
}

export interface DisplayFeed {
  serverNow: number
  settings: FeedSettings
  screen: {
    id: number
    name: string
    zoneId: number | null
    outputIndex: number
    pairCode: string | null
  }
  zone: {
    id: number
    name: string
    rotationMode: 'zone' | 'screen'
    /** Rotation epoch (ms since Unix epoch) for deterministic sync. */
    rotationSinceMs: number
  } | null
  pages: FeedPage[]
}
