'use client'

import { useEffect, useState } from 'react'

const CURRENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0'
const DISMISSED_KEY = 'skippy_update_dismissed'

export function UpdateBanner() {
  const [newVersion, setNewVersion] = useState<string | null>(null)

  useEffect(() => {
    // Only run in deployed (non-localhost) environment
    if (typeof window === 'undefined') return
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    if (isLocal) return

    const check = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const latest = data.version as string

        if (!latest || latest === CURRENT_VERSION) return

        const dismissed = sessionStorage.getItem(DISMISSED_KEY)
        if (dismissed === latest) return

        setNewVersion(latest)
      } catch {
        // silently ignore — update check is non-critical
      }
    }

    check()
    // Re-check every 30 minutes
    const interval = setInterval(check, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (!newVersion) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-violet-700 px-4 py-2.5 text-white text-sm shadow-lg">
      <span className="font-medium">
        ✨ Skippy {newVersion} is available — reload to update
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => window.location.reload()}
          className="bg-white text-violet-700 font-semibold rounded-md px-3 py-1 text-xs hover:bg-violet-50 transition-colors"
        >
          Update now
        </button>
        <button
          onClick={() => {
            sessionStorage.setItem(DISMISSED_KEY, newVersion)
            setNewVersion(null)
          }}
          className="text-violet-200 hover:text-white transition-colors text-lg leading-none"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
