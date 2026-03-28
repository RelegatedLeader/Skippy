'use client'

import { useEffect } from 'react'
import { Bot, RefreshCw } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Skippy Global Error]', error)
  }, [error])

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#04080f] text-[#d8e8f8] flex items-center justify-center font-sans antialiased">
        <div className="text-center max-w-sm px-6">
          <div className="w-16 h-16 rounded-2xl bg-[#07101f] border border-red-400/30 flex items-center justify-center mx-auto mb-5">
            <Bot className="w-8 h-8 text-[#e8b84b]" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-bold mb-2">Skippy crashed</h1>
          <p className="text-sm text-[#4d6888] mb-6 leading-relaxed">
            A critical error occurred. Try refreshing the page.
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#e8b84b] text-[#04080f] text-sm font-bold hover:bg-[#d4a028] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
