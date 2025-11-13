import { useEffect, useRef, useState } from 'react'

export default function useAutoHide(delayMs: number) {
  const [visible, setVisible] = useState(true)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const show = () => {
      setVisible(true)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setVisible(false), delayMs)
    }
    show()

    const onMove = () => show()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchstart', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchstart', onMove)
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [delayMs])

  return visible
}
