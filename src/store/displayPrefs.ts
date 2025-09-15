import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

type Prefs = {
  [clientId: string]: {
    label?: string|null
    showBeer?: boolean
    showDrinks?: boolean
    showMedia?: boolean
  }
}

const FILE_PATH = path.join(process.cwd(), 'data', 'display-prefs.json')

async function ensureDir() {
  try { await fsp.mkdir(path.dirname(FILE_PATH), { recursive: true }) } catch {}
}

export async function loadPrefs(): Promise<Prefs> {
  try {
    await ensureDir()
    if (!fs.existsSync(FILE_PATH)) return {}
    const raw = await fsp.readFile(FILE_PATH, 'utf8')
    const json = JSON.parse(raw)
    return (json && typeof json === 'object') ? (json as Prefs) : {}
  } catch {
    return {}
  }
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  try {
    await ensureDir()
    const tmp = FILE_PATH + '.tmp'
    await fsp.writeFile(tmp, JSON.stringify(prefs, null, 2), 'utf8')
    await fsp.rename(tmp, FILE_PATH)
  } catch {
    // ignore
  }
}

export async function getClientPrefs(clientId: string): Promise<Prefs[string]> {
  const all = await loadPrefs()
  return all[clientId] || {}
}

export async function setClientPrefs(clientId: string, update: Prefs[string]): Promise<void> {
  const all = await loadPrefs()
  const cur = all[clientId] || {}
  all[clientId] = { ...cur, ...update }
  await savePrefs(all)
}

