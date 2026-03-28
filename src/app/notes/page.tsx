'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Pin, Trash2, FileText, Clock, Tag, Bot } from 'lucide-react'
import { cn, formatRelativeTime, truncate } from '@/lib/utils'
import { Sidebar } from '@/components/layout/Sidebar'

interface Note { id: string; title: string; content: string; tags: string[]; color: string; pinned: boolean; createdAt: string; updatedAt: string }

const NOTE_COLORS = ['#e8b84b', '#2d6ae0', '#10b981', '#f97316', '#ec4899', '#06b6d4', '#a78bfa', '#d4a028']

function getPreview(content: string) {
  return truncate(content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(), 120)
}

export default function NotesPage() {
  const router = useRouter()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [creating, setCreating] = useState(false)

  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags))).slice(0, 20)

  const fetchNotes = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (selectedTag) params.set('tag', selectedTag)
      const res = await fetch(`/api/notes?${params}`)
      if (res.ok) setNotes(await res.json())
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [searchQuery, selectedTag])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  const createNote = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled', content: '', color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)] }),
      })
      if (res.ok) router.push(`/notes/${(await res.json()).id}`)
    } finally { setCreating(false) }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    setNotes((p) => p.filter((n) => n.id !== id))
  }

  const handlePin = async (e: React.MouseEvent, note: Note) => {
    e.stopPropagation()
    const res = await fetch(`/api/notes/${note.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: !note.pinned }) })
    if (res.ok) { const updated = await res.json(); setNotes((p) => p.map((n) => (n.id === note.id ? updated : n))) }
  }

  const pinned = notes.filter((n) => n.pinned)
  const unpinned = notes.filter((n) => !n.pinned)

  return (
    <div className="h-screen flex bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative">
        {/* Subtle bg */}
        <div className="fixed inset-0 pointer-events-none circuit-grid opacity-25" />

        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-md border-b border-border px-8 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="font-display text-xl font-black text-foreground flex items-center gap-2.5 tracking-tight">
                <FileText className="w-5 h-5 text-accent" />
                Notes
              </h1>
              <p className="text-xs text-muted mt-0.5">{notes.length} note{notes.length !== 1 ? 's' : ''}</p>
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={createNote} disabled={creating}
              className="btn-gold flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm relative"
            >
              {creating ? <Bot className="w-4 h-4 animate-pulse relative z-10" /> : <Plus className="w-4 h-4 relative z-10" />}
              <span className="relative z-10">New Note</span>
            </motion.button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-8 py-6 relative z-10">
          {/* Search + filter */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/50" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes…"
                className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent/40 focus:shadow-[0_0_0_3px_rgba(232,184,75,0.07)] transition-all"
              />
            </div>
            {allTags.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <Tag className="w-3.5 h-3.5 text-muted/50 flex-shrink-0" />
                {['', ...allTags].map((tag) => (
                  <button key={tag || 'all'}
                    onClick={() => setSelectedTag(tag)}
                    className={cn('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
                      selectedTag === tag ? 'bg-accent text-background font-bold' : 'bg-surface border border-border text-muted hover:text-foreground hover:border-accent/30'
                    )}>
                    {tag ? `#${tag}` : 'All'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 gap-3 text-muted">
              <Bot className="w-5 h-5 text-accent animate-pulse" strokeWidth={1.5} />
              <span className="text-sm">Loading notes…</span>
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-24">
              <div className="w-14 h-14 rounded-2xl bg-surface border border-accent/20 flex items-center justify-center mx-auto mb-4 shadow-glow-gold-sm animate-pulse-gold">
                <FileText className="w-7 h-7 text-accent/60" />
              </div>
              <h3 className="font-display text-xl font-bold text-foreground mb-2">No notes yet</h3>
              <p className="text-muted text-sm max-w-sm mx-auto mb-6 leading-relaxed">Create your first note and start organising your thoughts.</p>
              <button onClick={createNote} className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm relative">
                <Plus className="w-4 h-4 relative z-10" /><span className="relative z-10">Create first note</span>
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {pinned.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Pin className="w-3.5 h-3.5 text-accent/60" />
                    <span className="text-[10px] font-bold text-muted/50 uppercase tracking-widest">Pinned</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    <AnimatePresence mode="popLayout">
                      {pinned.map((note) => <NoteCard key={note.id} note={note} onDelete={handleDelete} onPin={handlePin} onClick={() => router.push(`/notes/${note.id}`)} />)}
                    </AnimatePresence>
                  </div>
                </div>
              )}
              {unpinned.length > 0 && (
                <div>
                  {pinned.length > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="w-3.5 h-3.5 text-muted/40" />
                      <span className="text-[10px] font-bold text-muted/50 uppercase tracking-widest">All Notes</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    <AnimatePresence mode="popLayout">
                      {unpinned.map((note) => <NoteCard key={note.id} note={note} onDelete={handleDelete} onPin={handlePin} onClick={() => router.push(`/notes/${note.id}`)} />)}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function NoteCard({ note, onDelete, onPin, onClick }: { note: Note; onDelete: (e: React.MouseEvent, id: string) => void; onPin: (e: React.MouseEvent, note: Note) => void; onClick: () => void }) {
  const preview = getPreview(note.content)
  return (
    <motion.div layout
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      onClick={onClick}
      className="group relative p-4 rounded-xl bg-surface border border-border hover:border-accent/25 cursor-pointer transition-all duration-200 overflow-hidden"
    >
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl opacity-70" style={{ backgroundColor: note.color }} />
      {/* Hover glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"
        style={{ boxShadow: `inset 0 0 30px ${note.color}08` }} />

      {/* Action buttons */}
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={(e) => onPin(e, note)}
          className={cn('p-1.5 rounded-lg transition-colors', note.pinned ? 'text-accent bg-accent/10' : 'text-muted hover:text-foreground hover:bg-surface-2')}>
          <Pin className="w-3 h-3" />
        </button>
        <button onClick={(e) => onDelete(e, note.id)}
          className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <h3 className="font-display font-bold text-foreground text-sm mb-2 pr-14 leading-tight">
        {note.title || 'Untitled'}
      </h3>
      {preview && <p className="text-xs text-muted leading-relaxed mb-3 line-clamp-3">{preview}</p>}

      <div className="flex items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-1 text-[10px] text-muted/40">
          <Clock className="w-3 h-3" />{formatRelativeTime(note.updatedAt)}
        </div>
        {note.tags.length > 0 && (
          <div className="flex items-center gap-1 overflow-hidden">
            {note.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                style={{ backgroundColor: `${note.color}18`, color: note.color }}>
                #{tag}
              </span>
            ))}
            {note.tags.length > 2 && <span className="text-[10px] text-muted/40">+{note.tags.length - 2}</span>}
          </div>
        )}
      </div>
    </motion.div>
  )
}
