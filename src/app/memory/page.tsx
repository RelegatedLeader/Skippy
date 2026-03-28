'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Trash2, Star, ArrowLeft, Bot, RefreshCw, Search } from 'lucide-react'
import { cn, getCategoryColor, getCategoryIcon } from '@/lib/utils'
import { Sidebar } from '@/components/layout/Sidebar'

interface Memory { id: string; category: string; content: string; importance: number; tags: string[]; createdAt: string; updatedAt: string }
interface MemoryData { memories: Memory[]; grouped: Record<string, Memory[]>; total: number }

const CATEGORIES = ['all', 'fact', 'preference', 'goal', 'mood', 'skill', 'context']

export default function MemoryPage() {
  const [data, setData] = useState<MemoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchMemories = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/memories')
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchMemories() }, [fetchMemories])

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      await fetch(`/api/memories?id=${id}`, { method: 'DELETE' })
      setData((prev) => {
        if (!prev) return prev
        const memories = prev.memories.filter((m) => m.id !== id)
        const grouped = memories.reduce((acc, m) => { if (!acc[m.category]) acc[m.category] = []; acc[m.category].push(m); return acc }, {} as Record<string, Memory[]>)
        return { memories, grouped, total: memories.length }
      })
    } finally { setDeleting(null) }
  }

  const filtered = (data?.memories || []).filter((m) => {
    const matchCat = selectedCategory === 'all' || m.category === selectedCategory
    const matchSearch = !searchQuery || m.content.toLowerCase().includes(searchQuery.toLowerCase())
    return matchCat && matchSearch
  })

  const catCounts = (data?.memories || []).reduce((acc, m) => { acc[m.category] = (acc[m.category] || 0) + 1; return acc }, {} as Record<string, number>)

  return (
    <div className="h-screen flex bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative">
        <div className="fixed inset-0 pointer-events-none circuit-grid opacity-20" />

        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-md border-b border-border px-8 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/chat" className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div>
                <h1 className="font-display text-xl font-black text-foreground flex items-center gap-2.5 tracking-tight">
                  <Brain className="w-5 h-5 text-accent" />
                  Skippy&apos;s Memory
                </h1>
                <p className="text-xs text-muted mt-0.5">{data?.total || 0} memories stored</p>
              </div>
            </div>
            <button onClick={fetchMemories} disabled={loading}
              className="p-2 rounded-xl text-muted hover:text-accent hover:bg-accent/10 transition-colors">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </button>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-8 py-8 relative z-10">
          {/* Stats grid */}
          {data && data.total > 0 && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
              {Object.entries(catCounts).map(([cat, count]) => {
                const color = getCategoryColor(cat)
                return (
                  <motion.div key={cat} whileHover={{ y: -2 }}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn('p-3 rounded-xl cursor-pointer transition-all text-center border',
                      selectedCategory === cat ? 'border-accent/40 bg-accent/8' : 'bg-surface border-border hover:border-accent/25'
                    )}>
                    <div className="text-xl mb-1">{getCategoryIcon(cat)}</div>
                    <div className="text-lg font-black" style={{ color }}>{count}</div>
                    <div className="text-[10px] text-muted capitalize">{cat}</div>
                  </motion.div>
                )
              })}
            </motion.div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/50" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search memories…"
                className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent/40 focus:shadow-[0_0_0_3px_rgba(232,184,75,0.07)] transition-all"
              />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto">
              {CATEGORIES.map((cat) => (
                <button key={cat} onClick={() => setSelectedCategory(cat)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
                    selectedCategory === cat ? 'bg-accent text-background font-bold' : 'bg-surface border border-border text-muted hover:text-foreground hover:border-accent/30'
                  )}>
                  {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                  {cat !== 'all' && catCounts[cat] ? <span className="ml-1.5 opacity-60">{catCounts[cat]}</span> : null}
                </button>
              ))}
            </div>
          </div>

          {/* Cards */}
          {loading ? (
            <div className="flex items-center justify-center py-24 gap-3 text-muted">
              <Bot className="w-5 h-5 text-accent animate-pulse" strokeWidth={1.5} />
              <span className="text-sm">Loading memories…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-24">
              <div className="w-14 h-14 rounded-2xl bg-surface border border-accent/20 flex items-center justify-center mx-auto mb-4 shadow-glow-gold-sm animate-pulse-gold">
                <Brain className="w-7 h-7 text-accent/60" />
              </div>
              <h3 className="font-display text-xl font-bold text-foreground mb-2">
                {data?.total === 0 ? 'No memories yet' : 'No match'}
              </h3>
              <p className="text-muted text-sm max-w-sm mx-auto leading-relaxed">
                {data?.total === 0
                  ? 'Start chatting with Skippy. After each conversation, key facts, preferences, and insights are automatically stored here.'
                  : 'Try adjusting your search or filter.'}
              </p>
              {data?.total === 0 && (
                <Link href="/chat" className="btn-gold inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl text-sm relative">
                  <Bot className="w-4 h-4 relative z-10" strokeWidth={1.5} />
                  <span className="relative z-10">Start a conversation</span>
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence mode="popLayout">
                {filtered.map((mem) => (
                  <MemoryCard key={mem.id} memory={mem} onDelete={handleDelete} isDeleting={deleting === mem.id} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function MemoryCard({ memory, onDelete, isDeleting }: { memory: Memory; onDelete: (id: string) => void; isDeleting: boolean }) {
  const color = getCategoryColor(memory.category)
  const icon = getCategoryIcon(memory.category)
  return (
    <motion.div layout
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      className="group relative p-4 rounded-xl bg-surface border transition-all duration-200 overflow-hidden"
      style={{ borderColor: `${color}20` }}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full" style={{ backgroundColor: color }} />
      {/* Subtle bg tint */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `radial-gradient(circle at 0% 50%, ${color}06, transparent 60%)` }} />

      <div className="relative z-10 pl-3">
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-base">{icon}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
              style={{ backgroundColor: `${color}15`, color }}>
              {memory.category}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Importance */}
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={cn('w-3 h-3', i < Math.round(memory.importance / 2) ? 'fill-accent text-accent' : 'text-muted/20')} />
              ))}
            </div>
            <button onClick={() => onDelete(memory.id)} disabled={isDeleting}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-all">
              {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <p className="text-sm text-foreground/90 leading-relaxed mb-2.5">{memory.content}</p>

        {memory.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {memory.tags.map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-muted/60 border border-border">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
