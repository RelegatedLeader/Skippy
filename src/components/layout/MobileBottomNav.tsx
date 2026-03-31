'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageSquare, FileText, CheckSquare, Brain, LayoutGrid } from 'lucide-react'
import { useNotifications } from '@/components/notifications/NotificationProvider'

const TABS = [
  { href: '/chat',    icon: MessageSquare, label: 'Chat'   },
  { href: '/notes',   icon: FileText,      label: 'Notes'  },
  { href: '/todos',   icon: CheckSquare,   label: 'Todos'  },
  { href: '/memory',  icon: Brain,         label: 'Memory' },
  { href: '/more',    icon: LayoutGrid,    label: 'More'   },
]

export function MobileBottomNav() {
  const pathname = usePathname()
  const { urgentCount, pendingTodos } = useNotifications()

  // Hide on login / setup
  if (!pathname || pathname.startsWith('/login') || pathname.startsWith('/setup')) return null

  const todoBadge = pendingTodos.length

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-[150] flex items-stretch border-t"
      style={{
        background: 'rgba(6,13,26,0.97)',
        borderColor: 'rgba(30,58,110,0.9)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {TABS.map(({ href, icon: Icon, label }) => {
        const active = pathname === href || (href !== '/more' && pathname.startsWith(href))
        const showMemoryBadge = label === 'Memory' && urgentCount > 0
        const showTodoBadge = label === 'Todos' && todoBadge > 0
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative min-h-[3.5rem]"
          >
            {active && (
              <span
                className="absolute top-0 inset-x-3 h-[2px] rounded-full"
                style={{ background: '#29c2e6', boxShadow: '0 0 8px rgba(41,194,230,0.8)' }}
              />
            )}
            <span className="relative">
              <Icon
                className="w-[22px] h-[22px] transition-colors"
                style={{ color: active ? '#29c2e6' : 'rgba(77,112,153,0.7)' }}
              />
              {showMemoryBadge && (
                <span
                  className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-white text-[8px] font-black flex items-center justify-center"
                >
                  {urgentCount > 9 ? '9+' : urgentCount}
                </span>
              )}
              {showTodoBadge && (
                <span
                  className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full text-white text-[8px] font-black flex items-center justify-center"
                  style={{ background: '#10b981' }}
                >
                  {todoBadge > 99 ? '99+' : todoBadge}
                </span>
              )}
            </span>
            <span
              className="text-[10px] font-medium leading-none transition-colors"
              style={{ color: active ? '#29c2e6' : 'rgba(77,112,153,0.6)' }}
            >
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
