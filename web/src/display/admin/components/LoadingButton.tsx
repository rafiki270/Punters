import { useState, type ReactNode } from 'react'

type LoadingButtonProps = {
  onClick: () => void | Promise<void>
  children: ReactNode
  className?: string
}

export default function LoadingButton({ onClick, children, className }: LoadingButtonProps) {
  const [loading, setLoading] = useState(false)
  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    const minDelay = new Promise<void>(res => setTimeout(res, 1000))
    try {
      await Promise.all([Promise.resolve(onClick()), minDelay])
    } finally {
      setLoading(false)
    }
  }
  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`${className ?? ''} inline-flex items-center gap-2 ${loading ? 'opacity-80 cursor-not-allowed' : ''}`}
    >
      {loading && <span className="inline-block h-4 w-4 border-2 border-neutral-300 border-t-transparent rounded-full animate-spin" />}
      <span>{children}</span>
    </button>
  )
}
