import { useCallback, useEffect, useRef, useState } from 'react'
import type { DisplayFeed } from '@punters/shared'
import { api } from '../api'
import { onChanged, onTick } from '../socket'

const KEY_STORAGE = 'punters.screenKey'

/**
 * Register this browser window as a screen (hello), then keep its feed fresh:
 * refetch on socket change events (debounced) and maintain a server-clock offset
 * so rotation math agrees across every screen in the zone.
 */
export function useFeed() {
  const [feed, setFeed] = useState<DisplayFeed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const keyRef = useRef<string | null>(localStorage.getItem(KEY_STORAGE))
  const offsetRef = useRef(0) // serverNow - clientNow
  const debounce = useRef<ReturnType<typeof setTimeout>>()

  const refetch = useCallback(async () => {
    const key = keyRef.current
    if (!key) return
    try {
      const data = await api.get<DisplayFeed>(`/api/display/feed?key=${encodeURIComponent(key)}`)
      offsetRef.current = data.serverNow - Date.now()
      setFeed(data)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        const res = await api.post<{ screen: { key: string } }>('/api/screens/hello', {
          key: keyRef.current ?? undefined,
          width: window.screen.width,
          height: window.screen.height,
          orientation: window.screen.width >= window.screen.height ? 'landscape' : 'portrait',
        })
        if (cancelled) return
        keyRef.current = res.screen.key
        localStorage.setItem(KEY_STORAGE, res.screen.key)
        await refetch()
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    }
    boot()

    const offChanged = onChanged(() => {
      clearTimeout(debounce.current)
      debounce.current = setTimeout(refetch, 400)
    })
    const offTick = onTick(({ now }) => {
      offsetRef.current = now - Date.now()
    })
    // Belt and braces for long unattended uptimes: refresh every 5 minutes.
    const interval = setInterval(refetch, 5 * 60_000)

    return () => {
      cancelled = true
      offChanged()
      offTick()
      clearInterval(interval)
      clearTimeout(debounce.current)
    }
  }, [refetch])

  const serverNow = useCallback(() => Date.now() + offsetRef.current, [])

  return { feed, error, serverNow }
}
