import Link from 'next/link'
import { Bot, ArrowLeft, Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="fixed inset-0 pointer-events-none circuit-grid opacity-20" />
      <div className="relative z-10 text-center max-w-md">
        <div className="relative mx-auto mb-6 w-20 h-20">
          <div className="w-20 h-20 rounded-2xl bg-surface border border-accent/25 flex items-center justify-center shadow-glow-gold-sm animate-pulse-gold">
            <Bot className="w-9 h-9 text-accent" strokeWidth={1.5} />
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-lg bg-background border border-border flex items-center justify-center">
            <Compass className="w-3 h-3 text-muted" />
          </div>
        </div>

        <div className="font-display font-black text-7xl text-accent/20 mb-2 tracking-tight select-none">
          404
        </div>
        <h1 className="font-display text-2xl font-black text-foreground mb-2 -mt-2 tracking-tight">
          Lost in space
        </h1>
        <p className="text-muted text-sm leading-relaxed mb-7">
          Skippy can&apos;t find that page. It might have been moved or never existed.
        </p>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/chat"
            className="btn-gold relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold"
          >
            <Bot className="w-4 h-4 relative z-10" strokeWidth={1.5} />
            <span className="relative z-10">Go to Chat</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-border text-sm font-medium text-muted hover:text-foreground hover:border-accent/30 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
        </div>
      </div>
    </div>
  )
}
