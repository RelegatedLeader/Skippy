'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Mic, Swords, GraduationCap, LayoutGrid, Settings,
  Info, Download, FileText, Brain, Zap,
} from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { useSidebar } from '@/components/layout/SidebarContext'

// ─── Feature card types ───────────────────────────────────────────────────────

interface Feature {
  icon: React.ElementType
  label: string
  desc: string
  href?: string
  action?: () => void
  accent: string
  glow: string
  badge?: string
  featured?: boolean
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MorePage() {
  const router   = useRouter()
  const { isOpen, toggle, close } = useSidebar()

  async function handleExport() {
    try {
      const res = await fetch('/api/export')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `skippy-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
    }
  }

  const features: Feature[] = [
    {
      icon: Mic,
      label: 'Talk to Skippy',
      desc: 'Voice mode — say "Skippy" or tap here. Everything we say is logged to chat.',
      href: '/chat?voice=1',
      accent: '#29c2e6',
      glow: 'rgba(41,194,230,0.18)',
      badge: 'Always listening',
      featured: true,
    },
    {
      icon: Swords,
      label: 'Debates',
      desc: 'Go head-to-head with Skippy. Pick a topic and argue it out.',
      href: '/debate',
      accent: '#f59e0b',
      glow: 'rgba(245,158,11,0.12)',
    },
    {
      icon: GraduationCap,
      label: 'Learn',
      desc: 'Spaced-repetition vocabulary and language learning.',
      href: '/learn',
      accent: '#8b5cf6',
      glow: 'rgba(139,92,246,0.12)',
    },
    {
      icon: LayoutGrid,
      label: 'Summaries',
      desc: 'Weekly digests of what\'s been going on in your life.',
      href: '/summaries',
      accent: '#10b981',
      glow: 'rgba(16,185,129,0.12)',
    },
    {
      icon: FileText,
      label: 'Notes',
      desc: 'Capture thoughts, ideas, and Skippy can help you refine them.',
      href: '/notes',
      accent: '#29c2e6',
      glow: 'rgba(41,194,230,0.10)',
    },
    {
      icon: Brain,
      label: 'Memory',
      desc: 'Everything Skippy knows about you. View, edit, and guide it.',
      href: '/memory',
      accent: '#7ee8fa',
      glow: 'rgba(126,232,250,0.10)',
    },
    {
      icon: Download,
      label: 'Export Data',
      desc: 'Download all your chats, notes, and memories as a JSON file.',
      action: handleExport,
      accent: '#64748b',
      glow: 'rgba(100,116,139,0.10)',
    },
    {
      icon: Settings,
      label: 'Settings',
      desc: 'API keys, preferences, and account management.',
      href: '/settings',
      accent: '#64748b',
      glow: 'rgba(100,116,139,0.10)',
    },
    {
      icon: Info,
      label: 'About',
      desc: 'What Skippy is, how it works, and what\'s coming.',
      href: '/about',
      accent: '#64748b',
      glow: 'rgba(100,116,139,0.08)',
    },
  ]

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] md:h-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-lg mx-auto px-4 pt-8 pb-28">

          {/* Header */}
          <div className="mb-7">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4" style={{ color: '#29c2e6' }} />
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'rgba(41,194,230,0.6)' }}>
                Everything Skippy
              </span>
            </div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">More</h1>
            <p className="text-sm text-muted/60 mt-0.5">All features in one place</p>
          </div>

          {/* Feature grid */}
          <div className="flex flex-col gap-3">
            {features.map((f) => {
              const inner = (
                <div
                  key={f.label}
                  className="relative flex items-center gap-4 px-4 py-4 rounded-2xl transition-all active:scale-[0.98] cursor-pointer"
                  style={{
                    background: f.featured
                      ? `radial-gradient(ellipse at 10% 50%, ${f.glow} 0%, rgba(6,13,26,0.6) 80%)`
                      : `rgba(10,20,42,0.6)`,
                    border: f.featured
                      ? `1px solid rgba(41,194,230,0.25)`
                      : `1px solid rgba(30,58,110,0.5)`,
                    boxShadow: f.featured ? `0 0 24px ${f.glow}` : 'none',
                  }}
                >
                  {/* Icon */}
                  <span
                    className="flex-shrink-0 flex items-center justify-center rounded-xl"
                    style={{
                      width: 44,
                      height: 44,
                      background: `${f.glow.replace('0.18', '0.14').replace('0.12', '0.1').replace('0.10', '0.08').replace('0.08', '0.06')}`,
                      border: `1px solid ${f.accent}28`,
                    }}
                  >
                    <f.icon className="w-5 h-5" style={{ color: f.accent }} />
                  </span>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground text-sm">{f.label}</span>
                      {f.badge && (
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                          style={{ background: 'rgba(41,194,230,0.12)', color: '#29c2e6', border: '1px solid rgba(41,194,230,0.2)' }}
                        >
                          {f.badge}
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#29c2e6] ml-1 animate-pulse align-middle" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted/50 leading-snug mt-0.5 line-clamp-2">{f.desc}</p>
                  </div>

                  {/* Chevron */}
                  <svg className="w-4 h-4 flex-shrink-0 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )

              if (f.href) {
                return (
                  <Link key={f.label} href={f.href} className="block">
                    {inner}
                  </Link>
                )
              }

              return (
                <div key={f.label} onClick={f.action} className="block">
                  {inner}
                </div>
              )
            })}
          </div>

          {/* Footer hint */}
          <p className="text-center text-[11px] mt-8" style={{ color: 'rgba(71,85,105,0.5)' }}>
            Say <span style={{ color: 'rgba(41,194,230,0.5)' }}>"Skippy"</span> anywhereto start talking
          </p>
        </div>
      </main>
    </div>
  )
}
