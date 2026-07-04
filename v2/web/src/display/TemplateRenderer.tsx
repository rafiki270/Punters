import { getTemplate, menuConfig, ADS_DEFAULTS, IMAGE_DEFAULTS, TEXT_DEFAULTS } from '@punters/shared'
import type { FeedPage, FeedSettings, SlotConfig, TemplateSlot } from '@punters/shared'
import { MenuSlot } from './slots/MenuSlot'
import { ImageSlot, AdsSlot, TextSlot, FeaturedSlot, LogoSlot, TickerSlot, ClockSlot } from './slots/misc'

/**
 * Generic template renderer: builds the CSS grid from the spec and mounts the
 * right slot component per kind. New templates need zero renderer changes.
 */
export function TemplateRenderer({
  page,
  settings,
  elapsedSec,
}: {
  page: FeedPage
  settings: FeedSettings
  elapsedSec: number
}) {
  const template = getTemplate(page.templateId)
  if (!template) return null

  return (
    <div
      className="tpl-grid"
      style={{
        gridTemplateColumns: template.grid.columns,
        gridTemplateRows: template.grid.rows,
        gridTemplateAreas: template.grid.areas.map((r) => `"${r}"`).join(' '),
      }}
    >
      {template.slots.map((slot) => (
        <div key={slot.id} className="tpl-slot" style={{ gridArea: slot.area }}>
          {renderSlot(slot, page, settings, elapsedSec)}
        </div>
      ))}
    </div>
  )
}

function renderSlot(slot: TemplateSlot, page: FeedPage, settings: FeedSettings, elapsedSec: number) {
  const config: SlotConfig = { ...slot.defaults, ...page.config[slot.id] }
  const content = page.content[slot.id] ?? {}

  switch (slot.kind) {
    case 'menu':
      return (
        <MenuSlot
          config={menuConfig(slot, page.config)}
          items={content.items ?? []}
          settings={settings}
          durationSec={page.durationSec}
          elapsedSec={elapsedSec}
        />
      )
    case 'image':
      return <ImageSlot config={{ ...IMAGE_DEFAULTS, ...config }} urls={content.imageUrls ?? null} />
    case 'ads':
      return <AdsSlot config={{ ...ADS_DEFAULTS, ...config }} ads={content.ads ?? []} />
    case 'text':
      return <TextSlot config={{ ...TEXT_DEFAULTS, ...config }} settings={settings} />
    case 'featured':
      return <FeaturedSlot item={content.featured ?? null} config={config} settings={settings} />
    case 'logo':
      return <LogoSlot settings={settings} />
    case 'ticker':
      return <TickerSlot text={config.text ?? ''} />
    case 'clock':
      return <ClockSlot />
    default:
      return null
  }
}
