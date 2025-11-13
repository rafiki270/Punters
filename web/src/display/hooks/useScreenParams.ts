import { useEffect, useMemo, useState } from 'react'

const readNumberParam = (searchKey: string, storageKey: string, fallback: number) => {
  const sp = new URLSearchParams(window.location.search)
  let val = Number(sp.get(searchKey) || '')
  if (!Number.isFinite(val) || val <= 0) {
    const ls = Number(localStorage.getItem(storageKey) || '')
    val = Number.isFinite(ls) && ls > 0 ? ls : fallback
  }
  return val
}

export default function useScreenParams() {
  const deviceId = useMemo(() => {
    const sp = new URLSearchParams(window.location.search)
    const id = sp.get('deviceId')
    return id ? Number(id) : null
  }, [])

  const [screenIndex, setScreenIndex] = useState<number>(() => readNumberParam('screenIndex', 'screenIndex', 1))
  const [screenCount, setScreenCount] = useState<number>(() => readNumberParam('screenCount', 'screenCount', 1))

  useEffect(() => {
    if (screenIndex > 1) localStorage.setItem('screenIndex', String(screenIndex))
    else localStorage.removeItem('screenIndex')
  }, [screenIndex])

  useEffect(() => {
    if (screenCount > 1) localStorage.setItem('screenCount', String(screenCount))
    else localStorage.removeItem('screenCount')
  }, [screenCount])

  return {
    deviceId,
    screenIndex,
    setScreenIndex,
    screenCount,
    setScreenCount,
  }
}
