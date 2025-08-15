import Bonjour from 'bonjour-service'

export type DiscoveredServer = { name: string; host: string; port: number; addresses: string[] }
const SERVICE_TYPE = process.env.DISCOVERY_TYPE || 'punters'

let browserInst: any = null
let advertiser: any = null
let list: DiscoveredServer[] = []
let currentMode: 'server'|'client' = 'server'
let bonjourInst: any = null
let currentPort = 0
let currentName: string | undefined

export function getMode() { return currentMode }
export function getDiscovered(): DiscoveredServer[] { return list }

export function startDiscovery(port: number, mode: 'server'|'client', preferredName?: string) {
  currentPort = port
  if (!bonjourInst) bonjourInst = new (Bonjour as any)()
  setConfig({ mode, name: preferredName })
}

export function setMode(mode: 'server'|'client') { setConfig({ mode }) }

export async function setName(name?: string) { await setConfig({ name }) }

export async function setConfig({ mode, name }: { mode?: 'server'|'client'; name?: string }) {
  if (mode) currentMode = mode
  if (name !== undefined) currentName = name
  // stop existing
  try { advertiser && advertiser.stop() } catch {}
  try { browserInst && browserInst.destroy() } catch {}
  advertiser = null
  browserInst = null
  list = []
  if (!bonjourInst) bonjourInst = new (Bonjour as any)()
  if (currentMode === 'server') {
    const base = currentName || process.env.DISCOVERY_NAME || (currentMode === 'server' ? 'punters-server' : 'punters-client')
    const unique = await suggestUniqueName(base)
    advertiser = bonjourInst.publish({ name: unique, type: SERVICE_TYPE, port: currentPort })
    advertiser.start()
  } else {
    browserInst = bonjourInst.find({ type: SERVICE_TYPE })
    browserInst.on('up', (svc: any) => updateList(svc))
    browserInst.on('down', (svc: any) => removeFromList(svc))
  }
}

function updateList(svc: any) {
  const host = svc.host || (svc.addresses && svc.addresses[0]) || 'unknown'
  const entry: DiscoveredServer = { name: svc.name || 'Punters', host, port: svc.port, addresses: svc.addresses || [] }
  const idx = list.findIndex((x) => x.name === entry.name && x.port === entry.port && x.host === entry.host)
  if (idx >= 0) list[idx] = entry
  else list.push(entry)
}

function removeFromList(svc: any) {
  list = list.filter((x) => !(x.name === svc.name && x.port === svc.port && x.host === (svc.host || x.host)))
}

// Compute an available name by scanning current services
export async function suggestUniqueName(base: string): Promise<string> {
  if (!bonjourInst) bonjourInst = new (Bonjour as any)()
  const seen = new Set<string>()
  // Collect existing names for a short window
  await new Promise<void>((resolve) => {
    const browser = bonjourInst.find({ type: SERVICE_TYPE })
    const timer = setTimeout(() => { try { browser.stop() } catch {}; resolve() }, 800)
    browser.on('up', (svc: any) => { if (svc?.name) seen.add(String(svc.name)) })
    browser.on('down', () => {})
  })
  let candidate = base
  let i = 2
  while (seen.has(candidate)) {
    candidate = `${base}-${i++}`
  }
  return candidate
}
