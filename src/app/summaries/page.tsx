'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Loader2, Trash2, Download, Calendar, FileText,
  ChevronDown, Bot, RefreshCw, Clock, BookOpen,
} from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import { Sidebar } from '@/components/layout/Sidebar'

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/\[x\]|\[ \]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split('\n')
  const result: React.ReactNode[] = []
  let listItems: React.ReactNode[] = []
  let listKey = 0

  function flushList() {
    if (listItems.length > 0) {
      result.push(
        <ul key={`ul-${listKey++}`} className="space-y-1 my-1 ml-3 list-none">
          {listItems}
        </ul>
      )
      listItems = []
    }
  }

  function renderInline(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
      if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
      return part
    })
  }

  lines.forEach((line, i) => {
    if (line.startsWith('### ')) {
      flushList()
      result.push(<h3 key={i} className="font-bold text-accent text-sm mt-3 mb-0.5">{renderInline(line.slice(4))}</h3>)
    } else if (line.startsWith('## ')) {
      flushList()
      result.push(<h2 key={i} className="font-bold text-foreground mt-3 mb-0.5">{renderInline(line.slice(3))}</h2>)
    } else if (line.startsWith('# ')) {
      flushList()
      result.push(<h1 key={i} className="font-bold text-foreground text-base mt-3 mb-1">{renderInline(line.slice(2))}</h1>)
    } else if (/^[-*]\s/.test(line)) {
      listItems.push(<li key={i} className="text-sm text-foreground/90 leading-relaxed flex gap-1.5"><span className="text-accent/60 flex-shrink-0">•</span><span>{renderInline(line.replace(/^[-*]\s+/, ''))}</span></li>)
    } else if (line.trim() === '') {
      flushList()
      result.push(<div key={i} className="h-1.5" />)
    } else {
      flushList()
      result.push(<p key={i} className="text-sm text-foreground/90 leading-relaxed">{renderInline(line)}</p>)
    }
  })
  flushList()

  return <div className="space-y-0.5">{result}</div>
}

interface Summary {
  id: string
  period: string
  title: string
  content: string
  noteCount: number
  debateCount?: number
  categories: string[]
  startDate: string
  endDate: string
  createdAt: string
}

const PERIODS = [
  { key: 'daily',   label: 'Today',      icon: '☀️' },
  { key: 'weekly',  label: 'This Week',  icon: '📅' },
  { key: 'monthly', label: 'This Month', icon: '🗓️' },
  { key: 'yearly',  label: 'This Year',  icon: '📆' },
  { key: 'all',     label: 'All Time',   icon: '∞' },
]

const PERIOD_COLORS: Record<string, string> = {
  daily: '#e8b84b', weekly: '#2d6ae0', monthly: '#10b981', yearly: '#f97316', all: '#a78bfa',
}

export default function SummariesPage() {
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState('weekly')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [exportFormat, setExportFormat] = useState<'txt' | 'md' | 'json'>('md')
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchSummaries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/summaries')
      if (res.ok) setSummaries(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSummaries() }, [fetchSummaries])

  const generate = async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: selectedPeriod }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Generation failed'); return }
      setSummaries((prev) => [data, ...prev])
      setExpandedId(data.id)
    } catch {
      setError('Failed to reach the server.')
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      await fetch(`/api/summaries/${id}`, { method: 'DELETE' })
      setSummaries((prev) => prev.filter((s) => s.id !== id))
      if (expandedId === id) setExpandedId(null)
    } finally {
      setDeleting(null) }
  }

  const handleExportAll = () => {
    window.open(`/api/export?type=summaries&format=${exportFormat}`, '_blank')
  }

  const handleExportNote = (id: string) => {
    window.open(`/api/export?type=note&id=${id}&format=${exportFormat}`, '_blank')
  }

  const handleExportSummaryText = (summary: Summary) => {
    const safeTitle = summary.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const a = document.createElement('a')

    if (exportFormat === 'json') {
      a.href = URL.createObjectURL(new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' }))
      a.download = `${safeTitle}.json`
    } else if (exportFormat === 'md') {
      const md = `# ${summary.title}\n\n${summary.content}\n\n---\n*${summary.noteCount} notes · ${new Date(summary.createdAt).toLocaleDateString()}*`
      a.href = URL.createObjectURL(new Blob([md], { type: 'text/plain' }))
      a.download = `${safeTitle}.md`
    } else {
      const plain = `${summary.title}\n${'='.repeat(summary.title.length)}\n\n${stripMarkdown(summary.content)}\n\nNotes: ${summary.noteCount} | Date: ${new Date(summary.createdAt).toLocaleDateString()}`
      a.href = URL.createObjectURL(new Blob([plain], { type: 'text/plain' }))
      a.download = `${safeTitle}.txt`
    }

    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="h-screen flex bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative">
        <div className="fixed inset-0 pointer-events-none circuit-grid opacity-20" />

        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-md border-b border-border px-8 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="font-display text-xl font-black text-foreground flex items-center gap-2.5 tracking-tight">
                <Sparkles className="w-5 h-5 text-accent" />
                AI Summaries
              </h1>
              <p className="text-xs text-muted mt-0.5">
                {summaries.length} summar{summaries.length !== 1 ? 'ies' : 'y'} generated
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Export format */}
              <div className="relative">
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as 'txt' | 'md' | 'json')}
                  className="appearance-none bg-surface border border-border text-muted text-xs rounded-lg px-3 py-2 pr-7 focus:outline-none focus:border-accent/40 cursor-pointer hover:text-foreground transition-colors"
                >
                  <option value="txt">.txt</option>
                  <option value="md">.md</option>
                  <option value="json">.json</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
              </div>
              {summaries.length > 0 && (
                <button
                  onClick={handleExportAll}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-muted hover:text-accent hover:bg-accent/10 border border-border hover:border-accent/30 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export All
                </button>
              )}
              <button onClick={fetchSummaries} disabled={loading}
                className="p-2 rounded-xl text-muted hover:text-accent hover:bg-accent/10 transition-colors">
                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-8 py-8 relative z-10 space-y-8">

          {/* Generator */}
          <div className="glass-gold rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Bot className="w-4 h-4 text-accent" strokeWidth={1.5} />
              <span className="text-sm font-bold text-foreground">Generate New Summary</span>
            </div>
            <p className="text-xs text-muted leading-relaxed -mt-2">
              Skippy reads your notes for the chosen period and extracts key themes, insights, and action items.
            </p>

            <div className="flex flex-wrap gap-2">
              {PERIODS.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setSelectedPeriod(key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-200',
                    selectedPeriod === key
                      ? 'border-transparent text-background'
                      : 'bg-surface-2 border-border text-muted hover:text-foreground hover:border-accent/30'
                  )}
                  style={selectedPeriod === key ? { backgroundColor: PERIOD_COLORS[key], boxShadow: `0 0 20px ${PERIOD_COLORS[key]}40` } : {}}
                >
                  <span>{icon}</span>{label}
                </button>
              ))}
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={generate} disabled={generating}
              className="btn-gold relative flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin relative z-10" />
                  <span className="relative z-10">Skippy is thinking…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">Generate Summary</span>
                </>
              )}
            </motion.button>
          </div>

          {/* Summary List */}
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-muted">
              <Bot className="w-5 h-5 text-accent animate-pulse" strokeWidth={1.5} />
              <span className="text-sm">Loading summaries…</span>
            </div>
          ) : summaries.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-surface border border-accent/20 flex items-center justify-center mx-auto mb-4 shadow-glow-gold-sm animate-pulse-gold">
                <BookOpen className="w-7 h-7 text-accent/60" />
              </div>
              <h3 className="font-display text-lg font-bold text-foreground mb-2">No summaries yet</h3>
              <p className="text-muted text-sm max-w-xs mx-auto leading-relaxed">
                Generate your first summary above to see Skippy&apos;s insights on your notes.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-3.5 h-3.5 text-muted/40" />
                <span className="text-[10px] font-bold text-muted/50 uppercase tracking-widest">Past Summaries</span>
              </div>
              <AnimatePresence mode="popLayout">
                {summaries.map((summary) => (
                  <SummaryCard
                    key={summary.id}
                    summary={summary}
                    expanded={expandedId === summary.id}
                    onToggle={() => setExpandedId(expandedId === summary.id ? null : summary.id)}
                    onDelete={() => handleDelete(summary.id)}
                    onExport={() => handleExportSummaryText(summary)}
                    deleting={deleting === summary.id}
                    exportFormat={exportFormat}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function SummaryCard({
  summary, expanded, onToggle, onDelete, onExport, deleting, exportFormat,
}: {
  summary: Summary
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onExport: () => void
  deleting: boolean
  exportFormat: string
}) {
  const color = PERIOD_COLORS[summary.period] || '#e8b84b'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="group bg-surface border border-border rounded-2xl overflow-hidden hover:border-accent/20 transition-all duration-200"
    >
      {/* Top accent line */}
      <div className="h-[2px]" style={{ backgroundColor: color }} />

      {/* Card header — clickable to expand */}
      <div
        className="flex items-start justify-between gap-4 p-5 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${color}20`, color }}
            >
              {summary.period}
            </span>
            <span className="text-[10px] text-muted/40 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(summary.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
              {new Date(summary.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <h3 className="font-display font-bold text-sm text-foreground leading-tight">{summary.title}</h3>
          <p className="text-[11px] text-muted mt-1 flex items-center gap-2 flex-wrap">
            <FileText className="w-3 h-3" />{summary.noteCount} note{summary.noteCount !== 1 ? 's' : ''}
            {(summary.debateCount ?? 0) > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                style={{ background: 'rgba(232,184,75,0.12)', color: '#e8b84b', border: '1px solid rgba(232,184,75,0.25)' }}>
                ⚔ {summary.debateCount} debate{summary.debateCount !== 1 ? 's' : ''}
              </span>
            )}
            <Clock className="w-3 h-3 ml-1" />{formatRelativeTime(summary.createdAt)}
          </p>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-muted/40 flex-shrink-0 mt-1 transition-transform duration-200', expanded && 'rotate-180')} />
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-border pt-4 space-y-4">
              <div className="text-sm font-sans leading-relaxed">
                {renderMarkdown(summary.content)}
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onExport() }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted hover:text-accent hover:bg-accent/10 border border-border hover:border-accent/30 transition-all"
                >
                  <Download className="w-3 h-3" />
                  Export as .{exportFormat}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete() }}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted hover:text-red-400 hover:bg-red-400/10 border border-border hover:border-red-400/30 transition-all"
                >
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Delete
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
