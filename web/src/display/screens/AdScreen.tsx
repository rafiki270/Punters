import type { Ad } from '../types'

type Props = {
  ad: Ad
  contentBase: string
  fullscreen: boolean
  paddingTop: number | string
  paddingBottom: number
  paddingX: number | string
}

export default function AdScreen({ ad, contentBase, fullscreen, paddingTop, paddingBottom, paddingX }: Props) {
  const isPortrait = Number(ad.height || 0) > Number(ad.width || 0)
  const className = fullscreen
    ? (isPortrait ? 'h-full w-full object-contain' : 'h-full w-full object-cover')
    : 'max-h-full max-w-full object-contain'

  return (
    <div
      className="h-full w-full flex items-center justify-center"
      style={{
        paddingTop: fullscreen ? 0 : paddingTop,
        paddingBottom: fullscreen ? 0 : paddingBottom,
        paddingLeft: fullscreen ? 0 : paddingX,
        paddingRight: fullscreen ? 0 : paddingX,
      }}
    >
      <img src={`${contentBase}/api/assets/${ad.id}/content`} alt={ad.filename} className={className} />
    </div>
  )
}
