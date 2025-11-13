import { useMemo } from 'react'
import type { Ad, Device, Settings, Slide } from '../types'
import { computeAllModeIndex } from '../lib/slidePicker'
import type { DisplayMode } from '../lib/displayMode'

type UseSlideTimingArgs = {
  slides: Slide[]
  settings: Settings | null
  device: Device | null
  localDisplayMode: DisplayMode
  screenCount: number
  screenIndex: number
  cycleOffset: number
  epoch: number
  anchorMs: number | null
  rotation: number
  paused: boolean
  pauseSnapshot: { idx: number|null; secsLeft: number } | null
  secs: number
  syncEnabled: boolean
}

export default function useSlideTiming({
  slides,
  settings,
  device,
  localDisplayMode,
  screenCount,
  screenIndex,
  cycleOffset,
  epoch,
  anchorMs,
  rotation,
  paused,
  pauseSnapshot,
  secs,
  syncEnabled,
}: UseSlideTimingArgs) {
  const value = useMemo(() => {
    const slidesLen = Math.max(0, slides.length)
    const baseSeconds = anchorMs ? Math.max(0, (epoch - anchorMs) / 1000) : (epoch / 1000)
    const cycle = Math.floor(baseSeconds / Math.max(1, rotation)) + cycleOffset
    const effSecs = syncEnabled ? (rotation - Math.floor((baseSeconds) % Math.max(1, rotation))) : secs
    let cur: Slide | null = null
    let curIdx: number | null = null
    if (paused && pauseSnapshot && pauseSnapshot.idx != null && slidesLen > 0) {
      const frozenIdx = ((pauseSnapshot.idx % slidesLen) + slidesLen) % slidesLen
      cur = slides[frozenIdx]
      curIdx = frozenIdx
    } else if (slidesLen > 0) {
      let modeEff: DisplayMode = 'all'
      if (device && device.displayMode !== 'inherit') modeEff = device.displayMode as DisplayMode
      else modeEff = localDisplayMode
      if (modeEff === 'all' || modeEff === 'everything') {
        const idx = computeAllModeIndex(slidesLen, screenCount, screenIndex, cycle)
        if (idx != null) {
          cur = slides[idx]
          curIdx = idx
        }
      } else {
        const idx = Math.floor(baseSeconds / Math.max(1, rotation)) % slidesLen
        cur = slides[idx]
        curIdx = idx
      }
    }
    const curType = cur?.type as Slide['type'] | undefined
    const curIsAd = curType === 'ad' || curType === 'adpair'
    const curIsFullscreen = curType === 'ad' && (cur?.data as Ad)?.fullscreen
    const curHidesFooter = (() => {
      if (!cur) return false
      if (cur.type === 'ad') return (cur.data as Ad)?.fullscreen === true
      if (cur.type === 'adpair') {
        const pair = cur.data as Ad[]
        return Array.isArray(pair) && pair.some(item => item?.fullscreen === true)
      }
      return false
    })()
    const footPadPx = ((settings?.showFooter !== false) && !curHidesFooter) ? 96 : 24
    return {
      cur,
      curIdx,
      curIsAd,
      curIsFullscreen,
      curHidesFooter,
      footPadPx,
      remainingSecs: paused && pauseSnapshot ? pauseSnapshot.secsLeft : effSecs,
    }
  }, [slides, settings?.showFooter, device?.displayMode, localDisplayMode, screenCount, screenIndex, cycleOffset, epoch, anchorMs, rotation, paused, pauseSnapshot, secs, syncEnabled])

  return value
}
