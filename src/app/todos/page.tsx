'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckSquare, Plus, Trash2, Zap, Flame, Trophy, X, ArrowLeft, RefreshCw, Circle, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Menu } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Sidebar } from '@/components/layout/Sidebar'
import { useSidebar } from '@/components/layout/SidebarContext'
import { useNotifications } from '@/components/notifications/NotificationProvider'

interface Todo {
  id: string
  content: string
  isDone: boolean
  priority: string
  dueDate: string | null
  completedAt: string | null
  tags: string[]
  xpReward: number
  createdAt: string
}

const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: '🔴' },
  high:   { label: 'High',   color: '#f97316', bg: 'rgba(249,115,22,0.12)', icon: '🟠' },
  normal: { label: 'Normal', color: '#29c2e6', bg: 'rgba(41,194,230,0.10)', icon: '🔵' },
  low:    { label: 'Low',    color: '#64748b', bg: 'rgba(100,116,139,0.10)', icon: '⚪' },
}

function formatDue(dueDate: string): { text: string; urgent: boolean } {
  const due = new Date(dueDate)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000)
  const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0
  const timeStr = hasTime ? ` ${due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''
  if (diffDays < 0) return { text: `Overdue${timeStr}`, urgent: true }
  if (diffDays === 0) return { text: `Today${timeStr}`, urgent: true }
  if (diffDays === 1) return { text: `Tomorrow${timeStr}`, urgent: false }
  return { text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + timeStr, urgent: false }
}

type Filter = 'all' | 'today' | 'upcoming' | 'anytime' | 'done'

export default function TodosPage() {
  const { toggle } = useSidebar()
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [showDone, setShowDone] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [completing, setCompleting] = useState<string | null>(null)
  const [xpPops, setXpPops] = useState<Record<string, number>>({})
  const { userStats, awardXP, refreshStats } = useNotifications()

  const fetchTodos = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/todos')
      if (res.ok) {
        const data = await res.json()
        setTodos(data.map((t: Todo & { tags: string }) => ({
          ...t,
          tags: typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags,
        })))
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchTodos() }, [fetchTodos])

  const handleComplete = async (todo: Todo) => {
    setCompleting(todo.id)
    await fetch(`/api/todos/${todo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone: true }),
    })
    const earned = await awardXP(todo.xpReward, 'todo')
    setXpPops(prev => ({ ...prev, [todo.id]: earned }))
    setTimeout(() => {
      setXpPops(prev => { const n = { ...prev }; delete n[todo.id]; return n })
    }, 1800)
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, isDone: true, completedAt: new Date().toISOString() } : t))
    setCompleting(null)
    refreshStats()
  }

  const handleUncomplete = async (id: string) => {
    await fetch(`/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone: false }),
    })
    setTodos(prev => prev.map(t => t.id === id ? { ...t, isDone: false, completedAt: null } : t))
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/todos/${id}`, { method: 'DELETE' })
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  const handleAdd = async (content: string, priority: string, dueDate: string) => {
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, priority, dueDate: dueDate || undefined }),
    })
    if (res.ok) {
      const created = await res.json()
      setTodos(prev => [{ ...created, tags: [] }, ...prev])
      setShowAddForm(false)
    }
  }

  const pending = todos.filter(t => !t.isDone)
  const done = todos.filter(t => t.isDone)
  const now = new Date()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const tomorrow = new Date(todayEnd.getTime() + 86_400_000)

  const filtered = pending.filter(t => {
    if (filter === 'all') return true
    if (filter === 'today') return t.dueDate && new Date(t.dueDate) <= todayEnd
    if (filter === 'upcoming') return t.dueDate && new Date(t.dueDate) > todayEnd
    if (filter === 'anytime') return !t.dueDate
    return false
  })

  // Sort: urgent > high > normal > low, then by dueDate
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
  const sorted = [...filtered].sort((a, b) => {
    const pd = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (pd !== 0) return pd
    if (!a.dueDate && !b.dueDate) return 0
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  })

  const urgentTodayCount = pending.filter(t => t.dueDate && new Date(t.dueDate) <= tomorrow).length
  const xpPercent = userStats
    ? Math.round(((userStats.totalXP - userStats.currentXP) / Math.max(1, userStats.nextXP - userStats.currentXP)) * 100)
    : 0

  const FILTERS: { key: Filter; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: pending.length },
    { key: 'today', label: 'Today', count: pending.filter(t => t.dueDate && new Date(t.dueDate) <= todayEnd).length },
    { key: 'upcoming', label: 'Upcoming', count: pending.filter(t => t.dueDate && new Date(t.dueDate) > todayEnd).length },
    { key: 'anytime', label: 'Anytime', count: pending.filter(t => !t.dueDate).length },
  ]

  return (
    <div className="h-screen flex bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative pb-20 md:pb-0">
        <div className="fixed inset-0 pointer-events-none circuit-grid opacity-20" />

        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-md border-b border-border px-4 md:px-8 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button onClick={toggle} className="md:hidden p-2 -ml-1 rounded-xl text-muted active:bg-surface" aria-label="Open menu"><Menu className="w-5 h-5" /></button>
                <Link href="/chat" className="hidden md:block p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </Link>
                <div>
                  <h1 className="font-display text-xl font-black text-foreground flex items-center gap-2.5 tracking-tight">
                    <CheckSquare className="w-5 h-5 text-accent" />
                    Todos
                  </h1>
                  <p className="text-xs text-muted mt-0.5">
                    {pending.length} pending{urgentTodayCount > 0 && <span className="text-red-400"> · {urgentTodayCount} due soon</span>}
                  </p>
                </div>
              </div>
              <button onClick={fetchTodos} disabled={loading}
                className="p-2 rounded-xl text-muted hover:text-accent hover:bg-accent/10 transition-colors">
                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              </button>
            </div>

            {/* XP / Level bar */}
            {userStats && (
              <div className="mb-4 p-3 rounded-xl border" style={{ background: 'rgba(15,39,89,0.4)', borderColor: 'rgba(30,58,110,0.8)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Trophy className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm font-bold text-yellow-400">Lv.{userStats.level} {userStats.name}</span>
                    </div>
                    {userStats.currentStreak > 0 && (
                      <div className="flex items-center gap-1 text-orange-400">
                        <Flame className="w-4 h-4" />
                        <span className="text-sm font-bold">{userStats.currentStreak} day streak</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-foreground/70">{userStats.totalXP} XP</span>
                    {userStats.level < 6 && (
                      <span className="text-xs text-muted/50 ml-1">/ {userStats.nextXP}</span>
                    )}
                  </div>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${xpPercent}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 relative"
                  >
                    <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/30 rounded-full blur-sm" />
                  </motion.div>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted/40">
                  <span>{userStats.todosCompleted} todos done</span>
                  <span>·</span>
                  <span>{userStats.remindersCompleted} reminders done</span>
                  <span>·</span>
                  <span>Best streak: {userStats.longestStreak}d</span>
                </div>
              </div>
            )}

            {/* Filter chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5',
                    filter === f.key ? 'bg-accent text-background font-bold' : 'bg-surface border border-border text-muted hover:text-foreground'
                  )}>
                  {f.label}
                  {f.count !== undefined && f.count > 0 && (
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                      filter === f.key ? 'bg-background/20' : 'bg-accent/15 text-accent')}>
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 relative z-10 space-y-4">
          {/* Add form */}
          {!showAddForm ? (
            <button onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-4 py-3 w-full rounded-xl border border-dashed border-accent/25 text-sm text-muted/50 hover:text-accent hover:border-accent/50 transition-all group">
              <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
              Add a todo…
            </button>
          ) : (
            <AddTodoForm onAdd={handleAdd} onClose={() => setShowAddForm(false)} />
          )}

          {/* Todos */}
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-3 text-muted">
              <CheckSquare className="w-5 h-5 text-accent animate-pulse" />
              <span className="text-sm">Loading todos…</span>
            </div>
          ) : (
            <>
              <AnimatePresence mode="popLayout">
                {sorted.map(todo => (
                  <TodoCard
                    key={todo.id}
                    todo={todo}
                    onComplete={handleComplete}
                    onDelete={handleDelete}
                    isCompleting={completing === todo.id}
                    xpPop={xpPops[todo.id]}
                  />
                ))}
              </AnimatePresence>

              {sorted.length === 0 && !showAddForm && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
                  <div className="text-4xl mb-4">
                    {filter === 'today' ? '✅' : filter === 'upcoming' ? '📅' : '🎯'}
                  </div>
                  <h3 className="font-display text-lg font-bold text-foreground mb-2">
                    {filter === 'all' ? 'No pending todos' : `Nothing ${filter}`}
                  </h3>
                  <p className="text-muted text-sm">
                    {filter === 'all' ? 'Add something to get started.' : 'Try a different filter or add a new todo.'}
                  </p>
                </motion.div>
              )}

              {/* Done section */}
              {done.length > 0 && (
                <div className="pt-2">
                  <button onClick={() => setShowDone(v => !v)}
                    className="flex items-center gap-2 text-xs text-muted/50 hover:text-muted transition-colors mb-3">
                    {showDone ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {done.length} completed
                  </button>
                  {showDone && (
                    <div className="space-y-2">
                      {done.slice(0, 20).map(todo => (
                        <DoneCard key={todo.id} todo={todo} onUncomplete={handleUncomplete} onDelete={handleDelete} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function TodoCard({ todo, onComplete, onDelete, isCompleting, xpPop }: {
  todo: Todo
  onComplete: (t: Todo) => void
  onDelete: (id: string) => void
  isCompleting: boolean
  xpPop?: number
}) {
  const p = PRIORITY_CONFIG[todo.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.normal
  const dueInfo = todo.dueDate ? formatDue(todo.dueDate) : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="group relative flex items-start gap-3 p-4 rounded-xl border transition-all"
      style={{ background: p.bg, borderColor: `${p.color}25` }}
    >
      {/* XP pop */}
      <AnimatePresence>
        {xpPop && (
          <motion.div
            initial={{ y: 0, opacity: 1 }}
            animate={{ y: -30, opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="absolute top-2 right-10 text-sm font-black text-yellow-400 pointer-events-none"
            style={{ textShadow: '0 0 8px rgba(250,204,21,0.8)' }}
          >
            +{xpPop} XP ✨
          </motion.div>
        )}
      </AnimatePresence>

      {/* Complete button */}
      <button
        onClick={() => onComplete(todo)}
        disabled={isCompleting}
        className="mt-0.5 shrink-0 transition-colors"
        style={{ color: p.color }}
      >
        {isCompleting
          ? <CheckCircle2 className="w-5 h-5 animate-pulse" />
          : <Circle className="w-5 h-5 hover:scale-110 transition-transform" />
        }
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground/90 leading-relaxed">{todo.content}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{ backgroundColor: `${p.color}20`, color: p.color }}>
            {p.icon} {p.label}
          </span>
          {dueInfo && (
            <span className={cn(
              'text-[10px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1',
              dueInfo.urgent
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : 'border-border text-muted/60'
            )}>
              {dueInfo.urgent && <AlertCircle className="w-2.5 h-2.5" />}
              {dueInfo.text}
            </span>
          )}
          <span className="flex items-center gap-0.5 text-[10px] text-yellow-400/60 ml-auto">
            <Zap className="w-2.5 h-2.5" />
            +{todo.xpReward} XP
          </span>
        </div>
      </div>

      {/* Delete */}
      <button onClick={() => onDelete(todo.id)}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  )
}

function DoneCard({ todo, onUncomplete, onDelete }: {
  todo: Todo
  onUncomplete: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="group flex items-start gap-3 px-4 py-2.5 rounded-xl border border-border/40 bg-surface/50 opacity-60">
      <button onClick={() => onUncomplete(todo.id)} className="mt-0.5 shrink-0 text-accent">
        <CheckCircle2 className="w-4 h-4" />
      </button>
      <p className="flex-1 text-xs text-muted line-through leading-relaxed">{todo.content}</p>
      <button onClick={() => onDelete(todo.id)}
        className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted hover:text-red-400 transition-all">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}

function AddTodoForm({ onAdd, onClose }: { onAdd: (c: string, p: string, d: string) => Promise<void>; onClose: () => void }) {
  const [content, setContent] = useState('')
  const [priority, setPriority] = useState('normal')
  const [dueDate, setDueDate] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setLoading(true)
    await onAdd(content.trim(), priority, dueDate)
    setLoading(false)
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit}
      className="p-4 bg-surface border border-accent/25 rounded-xl space-y-3"
    >
      <input
        autoFocus
        type="text" value={content} onChange={e => setContent(e.target.value)}
        placeholder="What needs to be done?"
        className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent/40 transition-all"
      />
      <div className="flex items-center gap-2 flex-wrap">
        {/* Priority chips */}
        <div className="flex gap-1">
          {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
            <button key={key} type="button" onClick={() => setPriority(key)}
              className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition-all', priority === key ? 'ring-1' : 'opacity-50 hover:opacity-80')}
              style={{ background: priority === key ? cfg.bg : undefined, color: cfg.color }}>
              {cfg.icon} {cfg.label}
            </button>
          ))}
        </div>
        <input
          type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)}
          className="flex-1 min-w-0 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-accent/40 transition-all"
        />
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={loading || !content.trim()}
          className="btn-gold px-4 py-2 rounded-lg text-sm relative disabled:opacity-40 flex items-center gap-1.5">
          <span className="relative z-10">{loading ? 'Adding…' : 'Add Todo'}</span>
          <Zap className="w-3 h-3 relative z-10 text-background/70" />
        </button>
        <button type="button" onClick={onClose}
          className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-2 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.form>
  )
}

