import type { Ad } from '../types'

type Props = {
  ads: Ad[]
  contentBase: string
  paddingTop: number | string
  paddingBottom: number
  paddingX: number | string
}

export default function AdPairScreen({ ads, contentBase, paddingTop: originalPadTop, paddingBottom, paddingX }: Props) {
  const slots: Array<Ad | null> = ads.slice(0, 2)
  while (slots.length < 2) slots.push(null)
  const resolvedPadTop =
    typeof paddingBottom === 'number'
      ? Math.max(0, paddingBottom * 0.2)
      : originalPadTop

  return (
    <div
      className="h-full w-full flex gap-6 min-h-0"
      style={{ paddingTop: resolvedPadTop, paddingBottom, paddingLeft: paddingX, paddingRight: paddingX }}
    >
      {slots.map((ad, idx) => (
        <div key={idx} className="flex-1 min-h-0 min-w-0 flex items-center justify-center">
          {ad && (
            <img
              src={`${contentBase}/api/assets/${ad.id}/content`}
              alt={ad.filename}
              className="h-full w-full object-contain"
            />
          )}
        </div>
      ))}
    </div>
  )
}
