import { useState } from 'react'
import type { Discovered } from '../../types'
import LoadingButton from '../components/LoadingButton'

type ServerPanelProps = {
  servers: Discovered[]
  remoteBase: string | null
  onSelectServer: (url: string) => void
}

export default function ServerPanel({ servers, remoteBase, onSelectServer }: ServerPanelProps) {
  const [sel, setSel] = useState<string>(remoteBase || '')
  const [manual, setManual] = useState<string>(remoteBase || '')
  const options = servers.map(s => ({ url: `http://${s.host}:${s.port}`, label: `${s.name} (${s.host}:${s.port})` }))
  return (
      <div className="space-y-6">
      <div>
        <label className="block text-sm mb-1">Select Main Server</label>
        <select value={sel} onChange={(e)=>setSel(e.target.value)} className="w-full md:w-2/3 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700">
          <option value="">(none)</option>
          {options.map(o => <option key={o.url} value={o.url}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm mb-1">Or enter server URL (http://host:port)</label>
        <input placeholder="http://192.168.1.10:3000" value={manual} onChange={(e)=>setManual(e.target.value)} className="w-full md:w-2/3 px-2 py-1 rounded bg-white text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700" />
      </div>
      <LoadingButton onClick={async()=>{ const url = sel || manual; if (url) onSelectServer(url) }} className="px-3 py-1.5 rounded bg-green-700 text-white">Save</LoadingButton>
      <div className="text-xs opacity-70">This client will fetch data from the selected main server.</div>
    </div>
  )
}
