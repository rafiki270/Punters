import { useEffect, useState } from 'react'

export default function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onFullscreenChange = () => {
      const docAny = document as any
      const active = !!(document.fullscreenElement || docAny.webkitFullscreenElement || docAny.mozFullScreenElement || docAny.msFullscreenElement)
      setIsFullscreen(active)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange as any)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange as any)
    }
  }, [])

  const toggleFullscreen = () => {
    const docAny = document as any
    const elAny = document.documentElement as any
    const isFs = !!(document.fullscreenElement || docAny.webkitFullscreenElement || docAny.mozFullScreenElement || docAny.msFullscreenElement)
    if (!isFs) {
      if (elAny.requestFullscreen) elAny.requestFullscreen()
      else if (elAny.webkitRequestFullscreen) elAny.webkitRequestFullscreen()
      else if (elAny.mozRequestFullScreen) elAny.mozRequestFullScreen()
      else if (elAny.msRequestFullscreen) elAny.msRequestFullscreen()
    } else {
      if (document.exitFullscreen) document.exitFullscreen()
      else if (docAny.webkitExitFullscreen) docAny.webkitExitFullscreen()
      else if (docAny.mozCancelFullScreen) docAny.mozCancelFullScreen()
      else if (docAny.msExitFullscreen) docAny.msExitFullscreen()
    }
  }

  return { isFullscreen, toggleFullscreen }
}
