import Bonjour from 'bonjour-service'

export type DiscoveredServer = { name: string; host: string; port: number; addresses: string[] }
const SERVICE_TYPE = process.env.DISCOVERY_TYPE || 'punters'

let browserInst: any = null
let advertiser: any = null
let list: DiscoveredServer[] = []
let currentMode: 'server'|'client' = 'server'
let bonjourInst: any = null
let currentPort = 0

export function getMode() { return currentMode }
export function getDiscovered(): DiscoveredServer[] { return list }

export function startDiscovery(port: number, mode: 'server'|'client') {
  currentPort = port
  if (!bonjourInst) bonjourInst = new (Bonjour as any)()
  setMode(mode)
}

export function setMode(mode: 'server'|'client') {
  currentMode = mode
  // stop existing
  try { advertiser && advertiser.stop() } catch {}
  try { browserInst && browserInst.destroy() } catch {}
  advertiser = null
  browserInst = null
  list = []
  if (!bonjourInst) bonjourInst = new (Bonjour as any)()
  if (currentMode === 'server') {
    advertiser = bonjourInst.publish({ name: process.env.DISCOVERY_NAME || 'Punters Main', type: SERVICE_TYPE, port: currentPort })
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
