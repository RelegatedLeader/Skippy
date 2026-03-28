'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X, CheckCircle2, Circle, ArrowRight, Zap, Flame, Trophy } from 'lucide-react'
import Link from 'next/link'
import { useNotifications } from './NotificationProvider'
import { cn } from '@/lib/utils'

function formatDue(dueDate: string): { text: string; urgent: boolean } {
  const due = new Date(dueDate)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000)
  const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0
  const timeStr = hasTime ? ` · ${due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''

  if (diffDays < 0) return { text: `Overdue${timeStr}`, urgent: true }
  if (diffDays === 0) return { text: `Today${timeStr}`, urgent: true }
  if (diffDays === 1) return { text: `Tomorrow${timeStr}`, urgent: false }
  if (diffDays <= 7) return { text: `In ${diffDays} days${timeStr}`, urgent: false }
  return { text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + timeStr, urgent: false }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [completing, setCompleting] = useState<string | null>(null)
  const [xpPop, setXpPop] = useState<{ id: string; amount: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { urgentCount, pendingReminders, userStats, refreshReminders, awardXP } = useNotifications()

  const pendingCount = pendingReminders.filter(r => !r.isDone).length

  // Sort: overdue first, then today, then upcoming
  const sorted = [...pendingReminders]
    .filter(r => !r.isDone)
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })
    .slice(0, 6)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleComplete = async (id: string, xpReward: number) => {
    setCompleting(id)
    await fetch(`/api/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone: true }),
    })
    const earned = await awardXP(xpReward, 'reminder')
    setXpPop({ id, amount: earned })
    setTimeout(() => setXpPop(null), 1800)
    refreshReminders()
    setCompleting(null)
  }

  const xpPercent = userStats
    ? Math.round(((userStats.totalXP - userStats.currentXP) / Math.max(1, userStats.nextXP - userStats.currentXP)) * 100)
    : 0

  return (
    <div ref={panelRef} className="fixed bottom-[4.5rem] md:bottom-6 right-4 z-[200]">
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Notifications"
        className={cn(
          'relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300',
          urgentCount > 0
            ? 'radar-pulse'
            : '',
          open && 'scale-95',
        )}
        style={{
          background: urgentCount > 0
            ? 'linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(41,194,230,0.15) 100%)'
            : 'rgba(10,26,53,0.95)',
          border: urgentCount > 0
            ? '1.5px solid rgba(239,68,68,0.5)'
            : pendingCount > 0
              ? '1.5px solid rgba(41,194,230,0.4)'
              : '1.5px solid rgba(30,58,110,0.9)',
          boxShadow: urgentCount > 0
            ? '0 0 20px rgba(239,68,68,0.35), 0 0 40px rgba(239,68,68,0.15), inset 0 1px 0 rgba(255,255,255,0.05)'
            : pendingCount > 0
              ? '0 0 16px rgba(41,194,230,0.3), 0 0 30px rgba(41,194,230,0.1), inset 0 1px 0 rgba(255,255,255,0.05)'
              : '0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        {/* Bell icon in wrapper so transform-origin works */}
        <span className={cn(urgentCount > 0 && 'bell-ring-wrapper')}>
          <Bell
            className="w-5 h-5 transition-colors"
            style={{
              color: urgentCount > 0 ? '#ef4444' : pendingCount > 0 ? '#29c2e6' : 'rgba(148,163,184,0.5)',
            }}
            strokeWidth={urgentCount > 0 || pendingCount > 0 ? 2.5 : 1.5}
          />
        </span>

        {/* Count badge — shows for ANY pending, red for urgent */}
        <AnimatePresence>
          {pendingCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className={cn(
                'absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full text-white text-[10px] font-black flex items-center justify-center shadow-lg',
                urgentCount > 0 ? 'badge-pulse' : '',
              )}
              style={{
                background: urgentCount > 0 ? '#ef4444' : '#29c2e6',
                boxShadow: urgentCount > 0
                  ? '0 0 10px rgba(239,68,68,0.7)'
                  : '0 0 10px rgba(41,194,230,0.6)',
              }}
            >
              {pendingCount > 9 ? '9+' : pendingCount}
            </motion.span>
          )}
        </AnimatePresence>

        {/* XP float pop */}
        <AnimatePresence>
          {xpPop && (
            <motion.div
              key="xppop"
              initial={{ y: 0, opacity: 1, scale: 1 }}
              animate={{ y: -44, opacity: 0, scale: 1.3 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className="absolute -top-2 -right-2 text-xs font-black pointer-events-none whitespace-nowrap"
              style={{ color: '#facc15', textShadow: '0 0 10px rgba(250,204,21,0.9)' }}
            >
              +{xpPop.amount} XP ✨
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.94 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute bottom-[58px] right-0 w-[min(320px,calc(100vw-1.5rem))] rounded-2xl border overflow-hidden shadow-2xl"
            style={{
              background: 'rgba(8,20,45,0.99)',
              borderColor: 'rgba(41,194,230,0.2)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(41,194,230,0.08)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(30,58,110,0.8)' }}>
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-accent" />
                <span className="text-sm font-bold text-foreground">Reminders</span>
                {urgentCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                    {urgentCount} urgent
                  </span>
                )}
                {pendingCount > 0 && urgentCount === 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent/10 text-accent/80 border border-accent/20">
                    {pendingCount} pending
                  </span>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg text-muted/50 hover:text-muted transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* XP bar */}
            {userStats && (
              <div className="px-4 py-2.5 border-b" style={{ borderColor: 'rgba(30,58,110,0.5)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Trophy className="w-3 h-3 text-yellow-400" />
                    <span className="text-[10px] font-bold text-yellow-400/90 uppercase tracking-wider">
                      Lv.{userStats.level} {userStats.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {userStats.currentStreak > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-orange-400/80">
                        <Flame className="w-3 h-3" />
                        {userStats.currentStreak}d
                      </span>
                    )}
                    <span className="text-[10px] text-muted/50">{userStats.totalXP} XP</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${xpPercent}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-purple-500"
                    style={{ boxShadow: '0 0 8px rgba(41,194,230,0.4)' }}
                  />
                </div>
              </div>
            )}

            {/* Reminder list */}
            <div className="overflow-y-auto" style={{ maxHeight: 'min(288px, calc(100dvh - 220px))' }}>
              {sorted.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="text-2xl mb-2">🎉</div>
                  <p className="text-xs text-muted/50">All caught up!</p>
                  <p className="text-[10px] text-muted/30 mt-1">Ask Skippy to set a reminder</p>
                </div>
              ) : (
                sorted.map(r => {
                  const dueInfo = r.dueDate ? formatDue(r.dueDate) : null
                  const isCompleting = completing === r.id

                  return (
                    <div
                      key={r.id}
                      className="flex items-start gap-2.5 px-4 py-3 border-b transition-all hover:bg-white/[0.02]"
                      style={{
                        borderColor: 'rgba(30,58,110,0.4)',
                        background: dueInfo?.urgent ? 'rgba(239,68,68,0.04)' : undefined,
                      }}
                    >
                      <button
                        onClick={() => handleComplete(r.id, r.xpReward)}
                        disabled={isCompleting}
                        className="mt-0.5 shrink-0 text-muted/40 hover:text-accent transition-colors"
                      >
                        {isCompleting
                          ? <CheckCircle2 className="w-4 h-4 text-accent animate-pulse" />
                          : <Circle className="w-4 h-4" style={{ color: dueInfo?.urgent ? '#ef4444' : '#29c2e6' }} />
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground/90 leading-relaxed line-clamp-2">{r.content}</p>
                        {dueInfo && (
                          <span className={cn(
                            'text-[10px] font-medium mt-0.5 block',
                            dueInfo.urgent ? 'text-red-400' : 'text-muted/50'
                          )}>
                            {dueInfo.urgent && '⚠ '}{dueInfo.text}
                          </span>
                        )}
                        {!r.dueDate && r.timeframeLabel && (
                          <span className="text-[10px] text-muted/40 mt-0.5 block">{r.timeframeLabel}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Zap className="w-2.5 h-2.5 text-yellow-400/60" />
                        <span className="text-[9px] text-yellow-400/60 font-bold">+{r.xpReward}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 flex items-center justify-between border-t" style={{ borderColor: 'rgba(30,58,110,0.4)' }}>
              <Link
                href="/memory"
                onClick={() => setOpen(false)}
                className="text-xs text-muted/50 hover:text-accent transition-colors flex items-center gap-1"
              >
                All reminders <ArrowRight className="w-3 h-3" />
              </Link>
              <Link
                href="/todos"
                onClick={() => setOpen(false)}
                className="text-xs text-muted/50 hover:text-accent transition-colors flex items-center gap-1"
              >
                Todos <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
