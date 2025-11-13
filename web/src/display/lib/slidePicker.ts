export function clampPositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function normalizeIndex(value: number, length: number) {
  if (length <= 0) return 0
  const mod = value % length
  return mod < 0 ? mod + length : mod
}

/**
 * When multiple screens share the same rotation, this computes which slide
 * should be displayed on the given screen index for the current cycle.
 */
export function computeAllModeIndex(
  slidesLen: number,
  screenCountRaw: number,
  screenIndexRaw: number,
  cycle: number,
): number | null {
  if (slidesLen <= 0) return null
  const sc = clampPositive(screenCountRaw, 1)
  const si = clampPositive(screenIndexRaw, 1)

  if (slidesLen <= sc) {
    const offset = normalizeIndex(cycle, slidesLen)
    return (si - 1 + offset) % slidesLen
  }

  const groupStart = normalizeIndex(cycle * sc, slidesLen)
  return (groupStart + si - 1) % slidesLen
}

export type PauseSnapshot = { idx: number | null; secsLeft: number }

export function resolvePauseToggle(paused: boolean, curIdx: number | null, remainingSecs: number) {
  if (paused) {
    return { paused: false, snapshot: null as PauseSnapshot | null }
  }
  return {
    paused: true,
    snapshot: { idx: curIdx ?? null, secsLeft: remainingSecs },
  }
}

export function computePausedNextSnapshot(
  slidesLen: number,
  curIdx: number | null,
  remainingSecs: number,
  previous: PauseSnapshot | null,
): PauseSnapshot | null {
  if (!Number.isFinite(slidesLen) || slidesLen <= 0) return null
  const baseIdx = curIdx ?? 0
  const nextIdx = (baseIdx + 1) % slidesLen
  const secsLeft = previous?.secsLeft ?? remainingSecs
  return { idx: nextIdx, secsLeft }
}
