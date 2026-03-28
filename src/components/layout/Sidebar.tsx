'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { MessageSquare, FileText, Brain, Settings, Info, Swords, Sparkles, CheckSquare, Flame, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/components/notifications/NotificationProvider'

interface SidebarProps {
  children?: React.ReactNode
  className?: string
}

const navItems = [
  { href: '/chat',       icon: MessageSquare, label: 'Chat' },
  { href: '/notes',      icon: FileText,      label: 'Notes' },
  { href: '/todos',      icon: CheckSquare,   label: 'Todos' },
  { href: '/summaries',  icon: Sparkles,      label: 'Summaries' },
  { href: '/memory',     icon: Brain,         label: 'Memory' },
  { href: '/debate',     icon: Swords,        label: 'Debate' },
]

export function Sidebar({ children, className }: SidebarProps) {
  const pathname = usePathname()
  const { urgentCount, userStats } = useNotifications()

  return (
    <aside
      className={cn('flex flex-col h-full border-r', className)}
      style={{ background: 'rgba(10, 26, 53, 0.98)', borderColor: 'rgba(30,58,110,0.9)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b" style={{ borderColor: 'rgba(30,58,110,0.7)' }}>
        <div className="relative flex-shrink-0">
          <div
            className="absolute inset-[-4px] rounded-full animate-pulse-cyan pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(41,194,230,0.2) 0%, transparent 70%)' }}
          />
          <div className="relative w-10 h-10">
            <Image
              src="/img/skippyENHANCED3D-removebg.png"
              alt="Skippy"
              fill
              className="object-contain drop-shadow-[0_0_10px_rgba(41,194,230,0.7)]"
            />
          </div>
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent border-2 border-background animate-blink" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-display font-black text-lg text-foreground tracking-tight">Skippy</span>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-accent/70 animate-blink" />
              <span className="text-[10px] text-muted/60 uppercase tracking-wider">Online</span>
            </div>
            {/* XP level badge */}
            {userStats && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-yellow-400/70">
                <Trophy className="w-2.5 h-2.5" />
                Lv.{userStats.level}
              </span>
            )}
            {userStats && userStats.currentStreak > 1 && (
              <span className="flex items-center gap-0.5 text-[10px] text-orange-400/70">
                <Flame className="w-2.5 h-2.5" />
                {userStats.currentStreak}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-3 border-b space-y-0.5" style={{ borderColor: 'rgba(30,58,110,0.7)' }}>
        <Link href="/about" className="block">
          <button className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
            pathname === '/about'
              ? 'text-accent border'
              : 'text-muted hover:text-foreground border border-transparent'
          )}
          style={pathname === '/about' ? {
            background: 'rgba(41,194,230,0.1)',
            borderColor: 'rgba(41,194,230,0.25)',
          } : {}}
          onMouseEnter={e => {
            if (pathname !== '/about') (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,39,89,0.6)'
          }}
          onMouseLeave={e => {
            if (pathname !== '/about') (e.currentTarget as HTMLButtonElement).style.background = ''
          }}
          >
            <Info className="w-4 h-4" />About
          </button>
        </Link>
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href)
          return (
            <Link key={href} href={href} className="block">
              <button className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border',
                active
                  ? 'text-accent'
                  : 'text-muted hover:text-foreground border-transparent'
              )}
              style={active ? {
                background: 'rgba(41,194,230,0.1)',
                borderColor: 'rgba(41,194,230,0.25)',
              } : {}}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,39,89,0.6)'
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.background = ''
              }}
              >
                <Icon className="w-4 h-4" />
                {label}
                {/* Debate badge */}
                {label === 'Debate' && (
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                    style={{ background: 'rgba(41,194,230,0.15)', color: '#29c2e6' }}>New</span>
                )}
                {/* Memory urgent badge */}
                {label === 'Memory' && urgentCount > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center badge-pulse">
                    {urgentCount > 9 ? '9+' : urgentCount}
                  </span>
                )}
              </button>
            </Link>
          )
        })}
      </nav>

      <div className="flex-1 overflow-hidden">{children}</div>

      <div className="p-3 border-t" style={{ borderColor: 'rgba(30,58,110,0.7)' }}>
        <Link href="/settings" className="block">
          <button className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border',
            pathname === '/settings'
              ? 'text-accent'
              : 'text-muted hover:text-foreground border-transparent'
          )}
          style={pathname === '/settings' ? {
            background: 'rgba(41,194,230,0.1)',
            borderColor: 'rgba(41,194,230,0.25)',
          } : {}}
          onMouseEnter={e => {
            if (pathname !== '/settings') (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,39,89,0.6)'
          }}
          onMouseLeave={e => {
            if (pathname !== '/settings') (e.currentTarget as HTMLButtonElement).style.background = ''
          }}
          >
            <Settings className="w-4 h-4" />Settings
          </button>
        </Link>
      </div>
    </aside>
  )
}
