/**
 * Deterministic rotation: every screen in a zone computes the current page purely from
 * (playlist, epoch, now). With clocks synced against the server, all screens agree on
 * the page and the remaining time without any coordination messages.
 */

export interface RotationPage {
  id: number | string
  durationSec: number
}

export interface RotationState {
  /** Index into the pages array, or -1 when there are no pages. */
  index: number
  /** Seconds until the current page changes (ceil). */
  remainingSec: number
  /** Seconds elapsed within the current page (floor, >= 0). */
  elapsedSec: number
  /** Total cycle length in seconds. */
  cycleSec: number
}

const MIN_DURATION = 1

export function rotationState(pages: RotationPage[], epochMs: number, nowMs: number): RotationState {
  if (pages.length === 0) return { index: -1, remainingSec: 0, elapsedSec: 0, cycleSec: 0 }

  const durations = pages.map((p) => Math.max(MIN_DURATION, Math.floor(p.durationSec)))
  const cycleSec = durations.reduce((a, b) => a + b, 0)
  const elapsedTotal = Math.max(0, (nowMs - epochMs) / 1000)
  let within = elapsedTotal % cycleSec

  for (let i = 0; i < durations.length; i++) {
    if (within < durations[i]) {
      return {
        index: i,
        remainingSec: Math.ceil(durations[i] - within),
        elapsedSec: Math.floor(within),
        cycleSec,
      }
    }
    within -= durations[i]
  }
  // Floating point edge: land on the last page's final instant.
  const last = durations.length - 1
  return { index: last, remainingSec: 0, elapsedSec: durations[last], cycleSec }
}

/**
 * Sub-pagination for menu slots whose content overflows the region: the page's duration
 * is divided evenly across chunks, and the active chunk derives from elapsed time.
 */
export function chunkIndex(chunks: number, pageDurationSec: number, elapsedSec: number): number {
  if (chunks <= 1) return 0
  const per = pageDurationSec / chunks
  return Math.min(chunks - 1, Math.floor(elapsedSec / per))
}
