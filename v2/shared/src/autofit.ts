/**
 * Menu list auto-fit: given a region and per-row min/max heights, decide the row height,
 * how many items fit per page, and how many sub-pages are needed. Pure math so it can be
 * unit-tested and reused by preview renderers.
 */

export interface FitInput {
  /** Region height in px (after padding). */
  regionH: number
  /** Number of items to lay out. */
  count: number
  /** Number of visual columns the list flows into. */
  columns: number
  /** Row height bounds in px (the admin's min/max item size controls). */
  minRow: number
  maxRow: number
  /** Vertical gap between rows in px. */
  gap: number
}

export interface FitResult {
  /** Chosen row height in px, within [minRow, maxRow]. */
  rowH: number
  /** Max rows per column at the chosen height. */
  rowsPerColumn: number
  /** Items shown per sub-page (rowsPerColumn * columns, capped at count). */
  pageSize: number
  /** Number of sub-pages needed to show everything. */
  pages: number
}

export function fitList(input: FitInput): FitResult {
  const columns = Math.max(1, Math.floor(input.columns))
  const minRow = Math.max(8, input.minRow)
  const maxRow = Math.max(minRow, input.maxRow)
  const gap = Math.max(0, input.gap)
  const regionH = Math.max(0, input.regionH)
  const count = Math.max(0, Math.floor(input.count))

  if (count === 0 || regionH < minRow) {
    return { rowH: minRow, rowsPerColumn: 0, pageSize: 0, pages: 0 }
  }

  // Capacity at the smallest permitted row height: n rows need n*row + (n-1)*gap.
  const capacityPerColumn = Math.max(1, Math.floor((regionH + gap) / (minRow + gap)))
  const pageSize = Math.min(count, capacityPerColumn * columns)
  const pages = Math.ceil(count / pageSize)

  // Rows actually needed on the fullest sub-page; grow rows up to maxRow to fill space.
  const rowsNeeded = Math.min(capacityPerColumn, Math.ceil(pageSize / columns))
  const ideal = (regionH + gap) / rowsNeeded - gap
  const rowH = Math.round(Math.min(maxRow, Math.max(minRow, ideal)))

  return { rowH, rowsPerColumn: rowsNeeded, pageSize, pages }
}

/** Split items into balanced column arrays for one sub-page. */
export function splitColumns<T>(items: T[], columns: number): T[][] {
  const cols = Math.max(1, columns)
  const perCol = Math.ceil(items.length / cols)
  const out: T[][] = []
  for (let c = 0; c < cols; c++) out.push(items.slice(c * perCol, (c + 1) * perCol))
  return out
}
