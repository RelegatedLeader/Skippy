'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Brain, Trash2, Star, ArrowLeft, Bot, RefreshCw, Search,
  Bell, Sparkles, CheckCircle2, Circle, Plus, X, Calendar,
  ChevronDown, ChevronUp, Menu, ListTodo, Clock, Zap,
  Shield, TrendingUp, Filter,
} from 'lucide-react'
import { cn, getCategoryColor, getCategoryIcon, formatRelativeTime, ALL_MEMORY_CATEGORIES } from '@/lib/utils'
import { Sidebar } from '@/components/layout/Sidebar'
import { useSidebar } from '@/components/layout/SidebarContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Memory {
  id: string
  category: string
  content: string
  importance: number
  confidence: number
  accessCount: number
  lastAccessedAt: string | null
  decayScore: number
  emotionalValence: number | null
  tags: string[]
  sourceType: string | null
  sourceId: string | null
  sourceLabel: string | null
  createdAt: string
  updatedAt: string
}

interface Reminder {
  id: string
  content: string
  dueDate: string | null
  timeframeLabel: string | null
  isDone: boolean
  completedAt: string | null
  sourceType: string | null
  sourceId: string | null
  createdAt: string
}

interface Todo {
  id: string
  content: string
  isDone: boolean
  priority: string
  dueDate: string | null
  completedAt: string | null
  tags: string[]
  createdAt: string
}

interface CategoryStat {
  category: string
  count: number
  avgImportance: number
  avgConfidence: number
  mostRecent: string
}

interface MemoryData {
  memories: Memory[]
  grouped: Record<string, Memory[]>
  total: number
  categoryStats: CategoryStat[]
}

const SUGGEST_QUESTIONS = [
  'What have I asked you to remember?',
  'What are my main goals right now?',
  'Who are the important people in my life?',
  'What patterns have you noticed in me?',
  'What am I working on currently?',
  'What do you know about my health or routines?',
  'What did we talk about recently?',
  'What are my biggest beliefs or values?',
]

// ─── Reminder helpers ─────────────────────────────────────────────────────────

function getReminderGroup(reminder: Reminder): 'overdue' | 'today' | 'week' | 'later' | 'anytime' {
  if (!reminder.dueDate) return 'anytime'
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today.getTime() + 86_400_000)
  const nextWeek = new Date(today.getTime() + 7 * 86_400_000)
  const due = new Date(reminder.dueDate)
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  if (dueDay < today) return 'overdue'
  if (dueDay.getTime() === today.getTime()) return 'today'
  if (dueDay <= nextWeek) return 'week'
  return 'later'
}

function formatDueDate(dueDate: string): string {
  const due = new Date(dueDate)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000)
  if (diffDays < -1) return `overdue · ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  if (diffDays === -1) return 'overdue · yesterday'
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'tomorrow'
  if (diffDays <= 7) return `in ${diffDays} days`
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTodoDue(dueDate: string): string {
  const due = new Date(dueDate)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000)
  if (diffDays < 0) return `overdue`
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'tomorrow'
  if (diffDays <= 7) return `${diffDays}d`
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Memory strength score ────────────────────────────────────────────────────

function memoryStrength(mem: Memory): number {
  // 0-100 composite: importance (40%), confidence (35%), decay (25%)
  return Math.round(
    (mem.importance / 10) * 40 +
    mem.confidence * 35 +
    mem.decayScore * 25
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'memories' | 'todos' | 'reminders' | 'ask'

export default function MemoryPage() {
  const { toggle } = useSidebar()
  const [data, setData] = useState<MemoryData | null>(null)
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [remindersLoading, setRemindersLoading] = useState(true)
  const [todosLoading, setTodosLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('memories')

  const fetchMemories = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/memories')
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [])

  const fetchReminders = useCallback(async () => {
    setRemindersLoading(true)
    try {
      const res = await fetch('/api/reminders')
      if (res.ok) setReminders(await res.json())
    } finally { setRemindersLoading(false) }
  }, [])

  const fetchTodos = useCallback(async () => {
    setTodosLoading(true)
    try {
      const res = await fetch('/api/todos')
      if (res.ok) {
        const raw = await res.json()
        setTodos((raw as Array<Todo & { tags: string | string[] }>).map(t => ({
          ...t,
          tags: typeof t.tags === 'string' ? JSON.parse(t.tags || '[]') : t.tags,
        })))
      }
    } finally { setTodosLoading(false) }
  }, [])

  useEffect(() => {
    fetchMemories()
    fetchReminders()
    fetchTodos()
  }, [fetchMemories, fetchReminders, fetchTodos])

  const handleDeleteMemory = async (id: string) => {
    await fetch(`/api/memories?id=${id}`, { method: 'DELETE' })
    setData(prev => {
      if (!prev) return prev
      const memories = prev.memories.filter(m => m.id !== id)
      const grouped = memories.reduce((acc, m) => {
        if (!acc[m.category]) acc[m.category] = []
        acc[m.category].push(m)
        return acc
      }, {} as Record<string, Memory[]>)
      return { ...prev, memories, grouped, total: memories.length }
    })
  }

  const handleToggleReminder = async (id: string, isDone: boolean) => {
    const res = await fetch(`/api/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone }),
    })
    if (res.ok) {
      const updated: Reminder = await res.json()
      setReminders(prev => prev.map(r => r.id === id ? updated : r))
    }
  }

  const handleDeleteReminder = async (id: string) => {
    await fetch(`/api/reminders/${id}`, { method: 'DELETE' })
    setReminders(prev => prev.filter(r => r.id !== id))
  }

  const handleAddReminder = async (content: string, dueDate: string) => {
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, dueDate: dueDate || undefined }),
    })
    if (res.ok) {
      const created: Reminder = await res.json()
      setReminders(prev => [created, ...prev])
    } else {
      const err = await res.text().catch(() => '')
      alert(`Failed to save reminder (${res.status})${err ? ': ' + err : ''}`)
    }
  }

  const handleToggleTodo = async (id: string, isDone: boolean) => {
    const res = await fetch(`/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDone }),
    })
    if (res.ok) {
      const updated = await res.json()
      setTodos(prev => prev.map(t => t.id === id ? {
        ...updated,
        tags: typeof updated.tags === 'string' ? JSON.parse(updated.tags || '[]') : updated.tags,
      } : t))
    }
  }

  const pendingReminders = reminders.filter(r => !r.isDone).length
  const pendingTodos = todos.filter(t => !t.isDone).length
  const urgentTodos = todos.filter(t => !t.isDone && (t.priority === 'urgent' || t.priority === 'high')).length

  const TAB_CONFIG: { key: Tab; label: string; icon: React.ReactNode; badge?: number; badgeUrgent?: boolean }[] = [
    { key: 'memories', label: 'Memories', icon: <Brain className="w-3.5 h-3.5" />, badge: data?.total },
    { key: 'todos', label: 'Todos', icon: <ListTodo className="w-3.5 h-3.5" />, badge: pendingTodos || undefined, badgeUrgent: urgentTodos > 0 },
    { key: 'reminders', label: 'Reminders', icon: <Bell className="w-3.5 h-3.5" />, badge: pendingReminders || undefined },
    { key: 'ask', label: 'Ask Skippy', icon: <Sparkles className="w-3.5 h-3.5" /> },
  ]

  const totalTracked = (data?.total || 0) + todos.length + reminders.length

  return (
    <div className="h-screen flex bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative pb-20 md:pb-0">
        <div className="fixed inset-0 pointer-events-none circuit-grid opacity-20" />

        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-md border-b border-border px-4 md:px-8 py-4">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button onClick={toggle} className="md:hidden p-2 -ml-1 rounded-xl text-muted active:bg-surface" aria-label="Open menu"><Menu className="w-5 h-5" /></button>
                <Link href="/chat" className="hidden md:block p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </Link>
                <div>
                  <h1 className="font-display text-xl font-black text-foreground flex items-center gap-2.5 tracking-tight">
                    <Brain className="w-5 h-5 text-accent" />
                    Memory Vault
                  </h1>
                  <p className="text-xs text-muted mt-0.5">
                    {totalTracked} items tracked
                    {pendingReminders > 0 && <span className="text-amber-400"> · {pendingReminders} reminder{pendingReminders !== 1 ? 's' : ''}</span>}
                    {urgentTodos > 0 && <span className="text-red-400"> · {urgentTodos} urgent</span>}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { fetchMemories(); fetchReminders(); fetchTodos() }}
                disabled={loading && remindersLoading && todosLoading}
                className="p-2 rounded-xl text-muted hover:text-accent hover:bg-accent/10 transition-colors"
              >
                <RefreshCw className={cn('w-4 h-4', (loading || remindersLoading || todosLoading) && 'animate-spin')} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1">
              {TAB_CONFIG.map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-all',
                    activeTab === tab.key
                      ? 'bg-accent text-background font-bold'
                      : 'text-muted hover:text-foreground hover:bg-surface'
                  )}>
                  {tab.icon}
                  {tab.label}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                      activeTab === tab.key
                        ? 'bg-background/20'
                        : tab.badgeUrgent
                        ? 'bg-red-500/15 text-red-400'
                        : 'bg-accent/15 text-accent'
                    )}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 relative z-10">
          <AnimatePresence mode="wait">
            {activeTab === 'memories' && (
              <motion.div key="memories" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <MemoriesTab data={data} loading={loading} onDelete={handleDeleteMemory} />
              </motion.div>
            )}
            {activeTab === 'todos' && (
              <motion.div key="todos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <TodosTab todos={todos} loading={todosLoading} onToggle={handleToggleTodo} />
              </motion.div>
            )}
            {activeTab === 'reminders' && (
              <motion.div key="reminders" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <RemindersTab
                  reminders={reminders}
                  loading={remindersLoading}
                  onToggle={handleToggleReminder}
                  onDelete={handleDeleteReminder}
                  onAdd={handleAddReminder}
                />
              </motion.div>
            )}
            {activeTab === 'ask' && (
              <motion.div key="ask" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <AskTab />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}

// ─── Memories tab ─────────────────────────────────────────────────────────────

function MemoriesTab({
  data, loading, onDelete,
}: {
  data: MemoryData | null
  loading: boolean
  onDelete: (id: string) => Promise<void>
}) {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'importance' | 'recent' | 'strength'>('importance')

  const handleDelete = async (id: string) => {
    setDeleting(id)
    await onDelete(id)
    setDeleting(null)
  }

  const allMemories = data?.memories || []

  const filtered = allMemories.filter(m => {
    const matchCat = selectedCategory === 'all' || m.category === selectedCategory
    const q = searchQuery.toLowerCase()
    const matchSearch = !q ||
      m.content.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q) ||
      (m.sourceLabel?.toLowerCase().includes(q) ?? false) ||
      m.tags.some(t => t.toLowerCase().includes(q))
    return matchCat && matchSearch
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'importance') return b.importance - a.importance
    if (sortBy === 'recent') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    return memoryStrength(b) - memoryStrength(a)
  })

  // Only show categories that have memories
  const activeCats = ['all', ...ALL_MEMORY_CATEGORIES.filter(c => allMemories.some(m => m.category === c))]

  const catCounts = allMemories.reduce((acc, m) => {
    acc[m.category] = (acc[m.category] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Timeline: group by month
  const timelineGroups = sorted.reduce((acc, m) => {
    const month = new Date(m.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (!acc[month]) acc[month] = []
    acc[month].push(m)
    return acc
  }, {} as Record<string, Memory[]>)

  return (
    <>
      {/* Category overview grid */}
      {data && data.total > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2 mb-8">
          {(data.categoryStats || []).map(stat => {
            const color = getCategoryColor(stat.category)
            const icon = getCategoryIcon(stat.category)
            return (
              <motion.div key={stat.category} whileHover={{ y: -2 }}
                onClick={() => setSelectedCategory(prev => prev === stat.category ? 'all' : stat.category)}
                className={cn('p-2.5 rounded-xl cursor-pointer transition-all text-center border',
                  selectedCategory === stat.category ? 'border-accent/50 bg-accent/8 shadow-glow-gold-sm' : 'bg-surface border-border hover:border-accent/25'
                )}>
                <div className="text-base mb-1">{icon}</div>
                <div className="text-base font-black" style={{ color }}>{stat.count}</div>
                <div className="text-[9px] text-muted capitalize leading-tight mt-0.5">{stat.category}</div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/50" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search memories, tags, sources…"
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent/40 focus:shadow-[0_0_0_3px_rgba(232,184,75,0.07)] transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Sort */}
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
            {(['importance', 'strength', 'recent'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                className={cn('px-2.5 py-1 rounded-md text-[11px] font-medium transition-all capitalize',
                  sortBy === s ? 'bg-accent text-background' : 'text-muted hover:text-foreground'
                )}>
                {s === 'importance' ? '★' : s === 'strength' ? <Zap className="w-3 h-3 inline" /> : <Clock className="w-3 h-3 inline" />}
              </button>
            ))}
          </div>
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
            <button onClick={() => setViewMode('grid')}
              className={cn('px-2.5 py-1 rounded-md text-[11px] transition-all', viewMode === 'grid' ? 'bg-accent text-background' : 'text-muted hover:text-foreground')}>
              Grid
            </button>
            <button onClick={() => setViewMode('timeline')}
              className={cn('px-2.5 py-1 rounded-md text-[11px] transition-all', viewMode === 'timeline' ? 'bg-accent text-background' : 'text-muted hover:text-foreground')}>
              Timeline
            </button>
          </div>
        </div>
      </div>

      {/* Category filter pills */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-6">
        {activeCats.map(cat => (
          <button key={cat} onClick={() => setSelectedCategory(cat)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0',
              selectedCategory === cat ? 'bg-accent text-background font-bold' : 'bg-surface border border-border text-muted hover:text-foreground hover:border-accent/30'
            )}>
            {getCategoryIcon(cat !== 'all' ? cat : '')} {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            {cat !== 'all' && catCounts[cat] ? <span className="ml-1.5 opacity-60">{catCounts[cat]}</span> : null}
          </button>
        ))}
      </div>

      {/* Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-24 gap-3 text-muted">
          <Bot className="w-5 h-5 text-accent animate-pulse" strokeWidth={1.5} />
          <span className="text-sm">Loading memories…</span>
        </div>
      ) : sorted.length === 0 ? (
        <EmptyMemories hasAny={data?.total !== 0} />
      ) : viewMode === 'timeline' ? (
        <div className="space-y-8">
          {Object.entries(timelineGroups).map(([month, mems]) => (
            <div key={month}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-bold text-muted/60 uppercase tracking-wider px-2">{month}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-3 pl-4 border-l-2 border-border">
                {mems.map(mem => (
                  <MemoryCard key={mem.id} memory={mem} onDelete={handleDelete} isDeleting={deleting === mem.id} compact />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {sorted.map(mem => (
              <MemoryCard key={mem.id} memory={mem} onDelete={handleDelete} isDeleting={deleting === mem.id} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </>
  )
}

function EmptyMemories({ hasAny }: { hasAny?: boolean }) {
  return (
    <div className="text-center py-24">
      <div className="w-14 h-14 rounded-2xl bg-surface border border-accent/20 flex items-center justify-center mx-auto mb-4 shadow-glow-gold-sm animate-pulse-gold">
        <Brain className="w-7 h-7 text-accent/60" />
      </div>
      <h3 className="font-display text-xl font-bold text-foreground mb-2">
        {!hasAny ? 'No memories yet' : 'No match'}
      </h3>
      <p className="text-muted text-sm max-w-sm mx-auto leading-relaxed">
        {!hasAny
          ? 'Start chatting with Skippy. Every conversation automatically extracts facts, goals, patterns and relationships — 15 memory types in total.'
          : 'Try a different search or category.'}
      </p>
      {!hasAny && (
        <Link href="/chat" className="btn-gold inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl text-sm relative">
          <Bot className="w-4 h-4 relative z-10" strokeWidth={1.5} />
          <span className="relative z-10">Start a conversation</span>
        </Link>
      )}
    </div>
  )
}

function MemoryCard({ memory, onDelete, isDeleting, compact = false }: {
  memory: Memory
  onDelete: (id: string) => void
  isDeleting: boolean
  compact?: boolean
}) {
  const color = getCategoryColor(memory.category)
  const icon = getCategoryIcon(memory.category)
  const strength = memoryStrength(memory)

  const sourceIcon = memory.sourceType === 'debate' ? '⚔' : memory.sourceType === 'manual' ? '✏️' : memory.sourceType === 'note' ? '📝' : '💬'

  return (
    <motion.div layout
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      className={cn('group relative rounded-xl bg-surface border transition-all duration-200 overflow-hidden', compact ? 'p-3' : 'p-4')}
      style={{ borderColor: `${color}20` }}
    >
      <div className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full" style={{ backgroundColor: color }} />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `radial-gradient(circle at 0% 50%, ${color}06, transparent 60%)` }} />

      <div className={cn('relative z-10', compact ? 'pl-2.5' : 'pl-3')}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm">{icon}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
              style={{ backgroundColor: `${color}15`, color }}>
              {memory.category}
            </span>
            {memory.emotionalValence !== null && memory.emotionalValence !== undefined && (
              <span className={cn(
                'text-[9px] px-1.5 py-0.5 rounded-full font-medium',
                memory.emotionalValence > 0.3 ? 'bg-emerald-500/10 text-emerald-400' : memory.emotionalValence < -0.3 ? 'bg-red-500/10 text-red-400' : 'hidden'
              )}>
                {memory.emotionalValence > 0.3 ? '↑' : '↓'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Strength bar */}
            {!compact && (
              <div className="flex items-center gap-1" title={`Memory strength: ${strength}%`}>
                <Zap className="w-3 h-3 text-muted/40" />
                <div className="w-12 h-1 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${strength}%`, backgroundColor: color }} />
                </div>
              </div>
            )}
            <button onClick={() => onDelete(memory.id)} disabled={isDeleting}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-all">
              {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <p className={cn('text-foreground/90 leading-relaxed mb-2', compact ? 'text-xs' : 'text-sm')}>{memory.content}</p>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {/* Importance stars */}
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={cn('w-2.5 h-2.5', i < Math.round(memory.importance / 2) ? 'fill-accent text-accent' : 'text-muted/20')} />
              ))}
            </div>
            {/* Confidence */}
            {memory.confidence < 0.6 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">
                ~uncertain
              </span>
            )}
            {/* Tags */}
            {memory.tags.slice(0, 2).map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-2 text-muted/60 border border-border">
                #{tag}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {memory.accessCount > 5 && (
              <span className="text-[9px] text-accent/50 font-medium">×{memory.accessCount}</span>
            )}
            {memory.sourceLabel && (
              <span className="text-[10px] text-muted/50 italic flex items-center gap-1 shrink-0">
                <span>{sourceIcon}</span>
                <span className="truncate max-w-[120px]">{memory.sourceLabel}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Todos tab ────────────────────────────────────────────────────────────────

const TODO_PRIORITY_ORDER = ['urgent', 'high', 'normal', 'low'] as const
const TODO_PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', color: '#ef4444', icon: '🔴' },
  high: { label: 'High', color: '#f97316', icon: '🟠' },
  normal: { label: 'Normal', color: '#3b82f6', icon: '🔵' },
  low: { label: 'Low', color: '#64748b', icon: '⚪' },
}

function TodosTab({ todos, loading, onToggle }: {
  todos: Todo[]
  loading: boolean
  onToggle: (id: string, isDone: boolean) => Promise<void>
}) {
  const [showDone, setShowDone] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const pending = todos.filter(t => !t.isDone)
  const done = todos.filter(t => t.isDone)

  const grouped = pending.reduce((acc, t) => {
    const p = t.priority || 'normal'
    if (!acc[p]) acc[p] = []
    acc[p].push(t)
    return acc
  }, {} as Record<string, Todo[]>)

  const handleToggle = async (id: string, isDone: boolean) => {
    setToggling(id)
    await onToggle(id, isDone)
    setToggling(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-muted">
        <ListTodo className="w-5 h-5 text-accent animate-pulse" strokeWidth={1.5} />
        <span className="text-sm">Loading todos…</span>
      </div>
    )
  }

  if (todos.length === 0) {
    return (
      <div className="text-center py-24">
        <div className="w-14 h-14 rounded-2xl bg-surface border border-accent/20 flex items-center justify-center mx-auto mb-4">
          <ListTodo className="w-7 h-7 text-accent/40" />
        </div>
        <h3 className="font-display text-xl font-bold text-foreground mb-2">No todos yet</h3>
        <p className="text-muted text-sm max-w-sm mx-auto">
          Tell Skippy &quot;add X to my todo list&quot; or manage them on the <Link href="/todos" className="text-accent hover:underline">Todos page</Link>.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {TODO_PRIORITY_ORDER.map(p => {
          const conf = TODO_PRIORITY_CONFIG[p]
          const count = pending.filter(t => t.priority === p).length
          return (
            <div key={p} className="p-3 rounded-xl bg-surface border border-border text-center">
              <div className="text-sm mb-0.5">{conf.icon}</div>
              <div className="text-lg font-black" style={{ color: conf.color }}>{count}</div>
              <div className="text-[10px] text-muted">{conf.label}</div>
            </div>
          )
        })}
      </div>

      {/* Grouped by priority */}
      {TODO_PRIORITY_ORDER.filter(p => (grouped[p] || []).length > 0).map(p => {
        const conf = TODO_PRIORITY_CONFIG[p]
        return (
          <div key={p}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: conf.color }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: conf.color }}>{conf.label}</span>
              <span className="text-xs text-muted/50">({grouped[p].length})</span>
            </div>
            <div className="space-y-2">
              {grouped[p].map(t => (
                <motion.div key={t.id} layout
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  className="group flex items-start gap-3 p-3.5 rounded-xl bg-surface border border-border hover:border-accent/20 transition-all"
                >
                  <button
                    onClick={() => handleToggle(t.id, !t.isDone)}
                    disabled={toggling === t.id}
                    className="mt-0.5 shrink-0 text-muted hover:text-accent transition-colors"
                  >
                    {toggling === t.id
                      ? <RefreshCw className="w-4 h-4 animate-spin text-accent" />
                      : t.isDone
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      : <Circle className="w-4 h-4" style={{ color: conf.color }} />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-relaxed">{t.content}</p>
                    {t.dueDate && (
                      <span className={cn(
                        'inline-flex items-center gap-1 text-[10px] mt-1 px-2 py-0.5 rounded-full border font-medium',
                        new Date(t.dueDate) < new Date()
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'text-muted/60 border-border'
                      )}>
                        <Calendar className="w-2.5 h-2.5" />
                        {formatTodoDue(t.dueDate)}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Completed */}
      {done.length > 0 && (
        <div>
          <button onClick={() => setShowDone(v => !v)}
            className="flex items-center gap-2 text-xs text-muted/50 hover:text-muted transition-colors mb-2">
            {showDone ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {done.length} completed
          </button>
          {showDone && (
            <div className="space-y-2">
              {done.slice(0, 20).map(t => (
                <div key={t.id} className="flex items-start gap-3 p-3 rounded-xl bg-surface/50 border border-border/50 opacity-50">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-muted line-through leading-relaxed">{t.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted/40 text-center pt-2">
        Full todo management on the <Link href="/todos" className="text-accent/60 hover:text-accent">Todos page</Link>
      </p>
    </div>
  )
}

// ─── Reminders tab ────────────────────────────────────────────────────────────

const REMINDER_GROUPS: { key: string; label: string; color: string }[] = [
  { key: 'overdue', label: 'Overdue', color: '#ef4444' },
  { key: 'today', label: 'Today', color: '#f59e0b' },
  { key: 'week', label: 'This Week', color: '#10b981' },
  { key: 'later', label: 'Later', color: '#3b82f6' },
  { key: 'anytime', label: 'Anytime', color: '#8b5cf6' },
]

function RemindersTab({
  reminders, loading, onToggle, onDelete, onAdd,
}: {
  reminders: Reminder[]
  loading: boolean
  onToggle: (id: string, isDone: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAdd: (content: string, dueDate: string) => Promise<void>
}) {
  const [showDone, setShowDone] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  const pending = reminders.filter(r => !r.isDone)
  const done = reminders.filter(r => r.isDone)

  const grouped = pending.reduce((acc, r) => {
    const key = getReminderGroup(r)
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {} as Record<string, Reminder[]>)

  const activeGroups = REMINDER_GROUPS.filter(g => (grouped[g.key] || []).length > 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-3 text-muted">
        <Bell className="w-5 h-5 text-accent animate-pulse" strokeWidth={1.5} />
        <span className="text-sm">Loading reminders…</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Add reminder button / form */}
      <div>
        {!showAddForm ? (
          <button onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-border text-sm text-muted hover:text-accent hover:border-accent/40 transition-all">
            <Plus className="w-4 h-4" />
            Add reminder
          </button>
        ) : (
          <AddReminderForm onAdd={onAdd} onClose={() => setShowAddForm(false)} />
        )}
      </div>

      {/* Empty state */}
      {pending.length === 0 && !showAddForm && (
        <div className="text-center py-20">
          <div className="w-14 h-14 rounded-2xl bg-surface border border-accent/20 flex items-center justify-center mx-auto mb-4">
            <Bell className="w-7 h-7 text-accent/40" />
          </div>
          <h3 className="font-display text-xl font-bold text-foreground mb-2">No pending reminders</h3>
          <p className="text-muted text-sm max-w-sm mx-auto leading-relaxed">
            Tell Skippy &quot;remind me to X by Y&quot; in any chat and it&apos;ll appear here automatically. Or add one manually above.
          </p>
        </div>
      )}

      {/* Grouped reminders */}
      {activeGroups.map(({ key, label, color }) => (
        <div key={key}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
            <span className="text-xs text-muted/50">({(grouped[key] || []).length})</span>
          </div>
          <div className="space-y-2">
            {(grouped[key] || []).map(r => (
              <ReminderCard key={r.id} reminder={r} groupColor={color} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </div>
        </div>
      ))}

      {/* Completed */}
      {done.length > 0 && (
        <div>
          <button onClick={() => setShowDone(v => !v)}
            className="flex items-center gap-2 text-xs text-muted/50 hover:text-muted transition-colors mb-2">
            {showDone ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {done.length} completed
          </button>
          {showDone && (
            <div className="space-y-2">
              {done.map(r => (
                <ReminderCard key={r.id} reminder={r} groupColor="#64748b" onToggle={onToggle} onDelete={onDelete} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReminderCard({
  reminder, groupColor, onToggle, onDelete,
}: {
  reminder: Reminder
  groupColor: string
  onToggle: (id: string, isDone: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const duePart = reminder.dueDate
    ? formatDueDate(reminder.dueDate)
    : reminder.timeframeLabel || null

  const isOverdue = reminder.dueDate && getReminderGroup(reminder) === 'overdue'

  return (
    <motion.div layout
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
      className={cn(
        'group flex items-start gap-3 p-3.5 rounded-xl border transition-all',
        reminder.isDone ? 'bg-surface/50 border-border/50 opacity-50' : 'bg-surface border-border hover:border-accent/25'
      )}
    >
      <button
        onClick={async () => { setToggling(true); await onToggle(reminder.id, !reminder.isDone); setToggling(false) }}
        disabled={toggling}
        className="mt-0.5 shrink-0 text-muted hover:text-accent transition-colors"
      >
        {toggling
          ? <RefreshCw className="w-4 h-4 animate-spin text-accent" />
          : reminder.isDone
          ? <CheckCircle2 className="w-4 h-4 text-accent" />
          : <Circle className="w-4 h-4" style={{ color: groupColor }} />
        }
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm text-foreground leading-relaxed', reminder.isDone && 'line-through text-muted')}>
          {reminder.content}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {duePart && (
            <span className={cn(
              'text-[10px] font-medium px-2 py-0.5 rounded-full',
              isOverdue ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'border border-border text-muted/60'
            )}>
              <Calendar className="w-2.5 h-2.5 inline mr-1" />
              {duePart}
            </span>
          )}
          {reminder.sourceType === 'chat' && (
            <span className="text-[10px] text-muted/40">💬 from chat</span>
          )}
        </div>
      </div>
      <button
        onClick={async () => { setDeleting(true); await onDelete(reminder.id) }}
        disabled={deleting}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0"
      >
        {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </motion.div>
  )
}

function AddReminderForm({ onAdd, onClose }: { onAdd: (content: string, dueDate: string) => Promise<void>; onClose: () => void }) {
  const [content, setContent] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setLoading(true)
    await onAdd(content.trim(), dueDate)
    setLoading(false)
    onClose()
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit}
      className="p-4 bg-surface border border-accent/25 rounded-xl space-y-3"
    >
      <input
        type="text" value={content} onChange={e => setContent(e.target.value)}
        placeholder="What do you need to remember?"
        autoFocus
        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent/40 transition-all"
      />
      <div className="flex items-center gap-2">
        <input
          type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
          className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent/40 transition-all"
        />
        <button type="submit" disabled={loading || !content.trim()}
          className="btn-gold px-4 py-2 rounded-lg text-sm relative disabled:opacity-40">
          <span className="relative z-10">{loading ? 'Adding…' : 'Add'}</span>
        </button>
        <button type="button" onClick={onClose}
          className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-2 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.form>
  )
}

// ─── Ask tab ──────────────────────────────────────────────────────────────────

function AskTab() {
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<Memory[]>([])
  const [asking, setAsking] = useState(false)
  const [showSources, setShowSources] = useState(false)

  const handleAsk = async (q?: string) => {
    const question = (q || query).trim()
    if (!question || asking) return
    if (q) setQuery(q)
    setAsking(true)
    setAnswer('')
    setSources([])
    setShowSources(false)
    try {
      const res = await fetch('/api/memories/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      if (res.ok) {
        const data = await res.json()
        setAnswer(data.answer)
        setSources(data.sources || [])
      }
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent/60" />
          <input
            type="text" value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAsk() }}
            placeholder="Ask Skippy about what it knows about you…"
            className="w-full pl-10 pr-4 py-3 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent/40 focus:shadow-[0_0_0_3px_rgba(232,184,75,0.07)] transition-all"
          />
        </div>
        <button
          onClick={() => handleAsk()}
          disabled={!query.trim() || asking}
          className="btn-gold px-5 py-3 rounded-xl text-sm relative disabled:opacity-40"
        >
          <span className="relative z-10">{asking ? 'Thinking…' : 'Ask'}</span>
        </button>
      </div>

      {!answer && !asking && (
        <div>
          <p className="text-xs text-muted/50 mb-3 uppercase tracking-wider">Questions to try</p>
          <div className="flex flex-wrap gap-2">
            {SUGGEST_QUESTIONS.map(q => (
              <button key={q} onClick={() => handleAsk(q)}
                className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-muted hover:text-foreground hover:border-accent/30 transition-all text-left">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {asking && (
        <div className="flex items-center gap-3 text-muted py-8">
          <Bot className="w-5 h-5 text-accent animate-pulse" strokeWidth={1.5} />
          <span className="text-sm">Skippy is searching your memories…</span>
        </div>
      )}

      {answer && !asking && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="p-5 bg-surface border border-accent/20 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-accent" />
              <span className="text-xs font-bold text-accent uppercase tracking-wider">Skippy&apos;s Answer</span>
            </div>
            <div className="text-sm text-foreground/90 leading-relaxed prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
            </div>
          </div>

          {sources.length > 0 && (
            <div>
              <button onClick={() => setShowSources(v => !v)}
                className="flex items-center gap-2 text-xs text-muted/60 hover:text-muted transition-colors mb-2">
                {showSources ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {sources.length} related memor{sources.length !== 1 ? 'ies' : 'y'}
              </button>
              {showSources && (
                <div className="space-y-2">
                  {sources.map(m => {
                    const color = getCategoryColor(m.category)
                    return (
                      <div key={m.id} className="flex items-start gap-2.5 p-3 rounded-lg bg-surface border border-border">
                        <span className="text-sm mt-0.5">{getCategoryIcon(m.category)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground/80 leading-relaxed">{m.content}</p>
                          {m.sourceLabel && (
                            <p className="text-[10px] text-muted/50 mt-1 italic">
                              {m.sourceType === 'debate' ? '⚔' : '💬'} {m.sourceLabel}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ backgroundColor: `${color}15`, color }}>
                          {m.category}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <button onClick={() => { setAnswer(''); setSources([]); setQuery('') }}
            className="text-xs text-muted/50 hover:text-muted transition-colors flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            Ask something else
          </button>
        </motion.div>
      )}
    </div>
  )
}
