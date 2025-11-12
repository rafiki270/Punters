import type { Ad } from '../types'

type Props = {
  ads: Ad[]
  contentBase: string
  paddingTop: number | string
  paddingBottom: number
  paddingX: number | string
}

export default function AdPairScreen({ ads, contentBase, paddingTop, paddingBottom, paddingX }: Props) {
  return (
    <div
      className="h-full w-full grid grid-cols-2 gap-4 items-center justify-center"
      style={{ paddingTop, paddingBottom, paddingLeft: paddingX, paddingRight: paddingX }}
    >
      {ads.map((ad, idx) => (
        <div key={idx} className="flex items-center justify-center">
          <img src={`${contentBase}/api/assets/${ad.id}/content`} alt={ad.filename} className="max-h-full max-w-full object-contain" />
        </div>
      ))}
    </div>
  )
}
