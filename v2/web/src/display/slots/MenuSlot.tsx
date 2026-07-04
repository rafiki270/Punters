import { useLayoutEffect, useRef, useState } from 'react'
import { fitList, splitColumns, chunkIndex, formatMoney } from '@punters/shared'
import type { FeedItem, FeedSettings, MenuSlotConfig } from '@punters/shared'

/**
 * The workhorse slot: renders a menu list or card grid, auto-fitting row size
 * between the configured min/max and sub-paginating overflow within the page's
 * duration. Row min/max are authored at 1080p and scale with actual viewport.
 */

type Entry = { type: 'header'; label: string } | { type: 'item'; item: FeedItem }

export function MenuSlot({
  config,
  items,
  settings,
  durationSec,
  elapsedSec,
}: {
  config: MenuSlotConfig
  items: FeedItem[]
  settings: FeedSettings
  durationSec: number
  elapsedSec: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [regionH, setRegionH] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setRegionH(entries[0].contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const entries: Entry[] = []
  if (config.groupByCategory) {
    let lastCategory: string | null = null
    for (const item of items) {
      const cat = item.categoryName ?? 'More'
      if (cat !== lastCategory) {
        entries.push({ type: 'header', label: cat })
        lastCategory = cat
      }
      entries.push({ type: 'item', item })
    }
  } else {
    for (const item of items) entries.push({ type: 'item', item })
  }

  // Row bounds are authored for 1080p; scale to the actual viewport.
  const vScale = window.innerHeight / 1080
  const gap = config.style === 'card' ? Math.round(16 * vScale) : Math.round(6 * vScale)
  const fit = fitList({
    regionH,
    count: entries.length,
    columns: config.columns,
    minRow: config.minRow * vScale,
    maxRow: config.maxRow * vScale,
    gap,
  })

  const chunk = chunkIndex(fit.pages, durationSec, elapsedSec)
  const visible = entries.slice(chunk * fit.pageSize, (chunk + 1) * fit.pageSize)
  const columns = splitColumns(visible, config.columns)

  return (
    <div className="menu-slot">
      {config.title && <div className="menu-title">{config.title}</div>}
      <div className="menu-region" ref={ref}>
        <div className="menu-columns" style={{ gap: Math.round(28 * vScale) }}>
          {columns.map((col, i) => (
            <div className="menu-col" key={i} style={{ gap }}>
              {col.map((entry, j) =>
                entry.type === 'header' ? (
                  <div key={`h${j}`} className="menu-cat" style={{ height: fit.rowH }}>
                    {entry.label}
                  </div>
                ) : config.style === 'card' ? (
                  <MenuCard key={entry.item.id} item={entry.item} rowH={fit.rowH} settings={settings} config={config} />
                ) : (
                  <MenuRow key={entry.item.id} item={entry.item} rowH={fit.rowH} settings={settings} config={config} />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      {fit.pages > 1 && (
        <div className="menu-pages">
          {Array.from({ length: fit.pages }, (_, i) => (
            <span key={i} className={i === chunk ? 'dot on' : 'dot'} />
          ))}
        </div>
      )}
    </div>
  )
}

function Dietary({ item }: { item: FeedItem }) {
  const chips: string[] = []
  if (item.dietary.vegan) chips.push('VG')
  else if (item.dietary.vegetarian) chips.push('V')
  if (item.dietary.glutenFree) chips.push('GF')
  if (item.dietary.dairyFree) chips.push('DF')
  return (
    <>
      {chips.map((c) => (
        <span key={c} className="diet-chip">{c}</span>
      ))}
      {item.spicyLevel > 0 && <span className="diet-chip hot">{'🌶'.repeat(item.spicyLevel)}</span>}
    </>
  )
}

function Prices({ item, settings, max = 3 }: { item: FeedItem; settings: FeedSettings; max?: number }) {
  if (item.prices.length === 0) return null
  if (item.prices.length === 1) {
    return <span className="price-main">{formatMoney(item.prices[0].amountMinor, settings.currency, settings.locale)}</span>
  }
  return (
    <span className="price-set">
      {item.prices.slice(0, max).map((p, i) => (
        <span key={i} className="price-pair">
          {p.sizeName && <span className="price-size">{p.sizeName}</span>}
          <span className="price-main">{formatMoney(p.amountMinor, settings.currency, settings.locale)}</span>
        </span>
      ))}
    </span>
  )
}

function MenuRow({
  item,
  rowH,
  settings,
  config,
}: {
  item: FeedItem
  rowH: number
  settings: FeedSettings
  config: MenuSlotConfig
}) {
  const sub = [item.producer, item.style, item.abv != null ? `${item.abv}%` : null].filter(Boolean).join(' · ')
  return (
    <div className="menu-row" style={{ height: rowH, fontSize: rowH * 0.34 }}>
      {config.showTapNumbers && item.tapNumber != null && <span className="tap-no">{item.tapNumber}</span>}
      {config.showBadges && item.badge && <img className="row-badge" src={item.badge.thumb} alt="" />}
      <span className="row-main">
        <span className="row-name">
          {item.name}
          {config.showBadges && <Dietary item={item} />}
        </span>
        {(sub || item.description) && <span className="row-sub">{sub || item.description}</span>}
      </span>
      {config.showPrices && <Prices item={item} settings={settings} />}
    </div>
  )
}

function MenuCard({
  item,
  rowH,
  settings,
  config,
}: {
  item: FeedItem
  rowH: number
  settings: FeedSettings
  config: MenuSlotConfig
}) {
  return (
    <div className="menu-card" style={{ height: rowH, fontSize: Math.max(13, rowH * 0.085) }}>
      <div className="card-media">
        {item.image ? <img src={item.image.sm} alt="" /> : <div className="card-media-empty" />}
      </div>
      <div className="card-body">
        <div className="card-top">
          <span className="row-name">{item.name}</span>
          {config.showPrices && <Prices item={item} settings={settings} max={1} />}
        </div>
        {item.description && <div className="card-desc">{item.description}</div>}
        {config.showBadges && (
          <div className="card-diet">
            <Dietary item={item} />
          </div>
        )}
      </div>
    </div>
  )
}
