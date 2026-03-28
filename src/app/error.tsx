'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw, Bot } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Skippy Error]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="fixed inset-0 pointer-events-none circuit-grid opacity-20" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 text-center max-w-md"
      >
        <div className="relative mx-auto mb-6 w-20 h-20">
          <div className="w-20 h-20 rounded-2xl bg-surface border border-red-400/30 flex items-center justify-center shadow-[0_0_40px_rgba(248,113,113,0.15)]">
            <AlertTriangle className="w-9 h-9 text-red-400" strokeWidth={1.5} />
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-background border border-accent/30 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-accent" strokeWidth={1.5} />
          </div>
        </div>

        <h1 className="font-display text-2xl font-black text-foreground mb-2 tracking-tight">
          Something went wrong
        </h1>
        <p className="text-muted text-sm leading-relaxed mb-2">
          Skippy hit an unexpected error. This has been logged.
        </p>
        {error?.message && (
          <p className="text-xs font-mono text-red-400/70 bg-red-400/5 border border-red-400/15 rounded-lg px-3 py-2 mb-6 text-left break-all">
            {error.message}
          </p>
        )}

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={reset}
          className="btn-gold relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold"
        >
          <RefreshCw className="w-4 h-4 relative z-10" />
          <span className="relative z-10">Try again</span>
        </motion.button>
      </motion.div>
    </div>
  )
}
