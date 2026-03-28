'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Pin, Trash2, Tag, Plus, X, Sparkles, Save,
  Bold, Italic, List, ListOrdered, Code, Quote, Heading1, Heading2,
  CheckSquare, Loader2, Swords, Link2, Bot, FileText, Brain,
  ExternalLink, ChevronRight, Unlink, Download, PanelRight,
} from 'lucide-react'
import { cn, formatDate, formatRelativeTime } from '@/lib/utils'
import NextLink from 'next/link'

const NOTE_COLORS = ['#e8b84b', '#2d6ae0', '#10b981', '#f97316', '#ec4899', '#06b6d4', '#a78bfa', '#d4a028']

interface Note {
  id: string; title: string; content: string; tags: string[]; color: string
  pinned: boolean; linkedNoteIds: string[]; linkedDebateId?: string | null
  createdAt: string; updatedAt: string
}
interface NoteStub { id: string; title: string; color: string; tags: string[]; updatedAt: string }
interface Memory { id: string; category: string; content: string; importance: number }

export default function NoteEditorPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [note, setNote] = useState<Note | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [newTag, setNewTag] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResponse, setAiResponse] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [allNotes, setAllNotes] = useState<NoteStub[]>([])
  const [linkedNotes, setLinkedNotes] = useState<NoteStub[]>([])
  const [memories, setMemories] = useState<Memory[]>([])
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')
  const [showPanel, setShowPanel] = useState(true)
  const saveTimeoutRef = useRef<NodeJS.Timeout>()
  const titleRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing… (# for heading, ** for bold)' }),
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
    ],
    content: '',
    editorProps: { attributes: { class: 'tiptap-editor outline-none' } },
    onUpdate: ({ editor }) => {
      if (!note) return
      debouncedSave({ content: editor.getHTML() })
    },
  })

  const debouncedSave = useCallback((updates: Partial<Note>) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      if (!note) return
      setSaving(true)
      try {
        const res = await fetch(`/api/notes/${note.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
        if (res.ok) setNote(await res.json())
      } catch (err) { console.error('Failed to save note:', err) }
      finally { setSaving(false) }
    }, 800)
  }, [note])

  useEffect(() => {
    Promise.all([
      fetch(`/api/notes/${params.id}`).then((r) => r.ok ? r.json() : null),
      fetch('/api/notes').then((r) => r.ok ? r.json() : []),
      fetch('/api/memories').then((r) => r.ok ? r.json() : []),
    ]).then(([noteData, notesData, memData]) => {
      if (!noteData) { router.push('/notes'); return }
      setNote(noteData)
      setTitle(noteData.title)
      setAllNotes(notesData.filter((n: NoteStub) => n.id !== noteData.id))
      setMemories((memData || []).slice(0, 5))
      if (editor && noteData.content) editor.commands.setContent(noteData.content)
    }).catch((err) => { console.error(err); router.push('/notes') })
    .finally(() => setLoading(false))
  }, [params.id, router, editor]) // eslint-disable-line react-hooks/exhaustive-deps

  // Set editor content when it initializes
  useEffect(() => {
    if (note && editor && !loading) editor.commands.setContent(note.content || '')
  }, [note?.id, editor, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve linked notes
  useEffect(() => {
    if (!note?.linkedNoteIds?.length) { setLinkedNotes([]); return }
    const linked = allNotes.filter((n) => note.linkedNoteIds.includes(n.id))
    setLinkedNotes(linked)
  }, [note?.linkedNoteIds, allNotes])

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
    debouncedSave({ title: e.target.value })
  }

  const handleAddTag = async () => {
    if (!newTag.trim() || !note) return
    const tag = newTag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (!tag || note.tags.includes(tag)) { setNewTag(''); return }
    const newTags = [...note.tags, tag]
    const res = await fetch(`/api/notes/${note.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags: newTags }) })
    if (res.ok) setNote(await res.json())
    setNewTag(''); setShowTagInput(false)
  }

  const handleRemoveTag = async (tag: string) => {
    if (!note) return
    const res = await fetch(`/api/notes/${note.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags: note.tags.filter((t) => t !== tag) }) })
    if (res.ok) setNote(await res.json())
  }

  const handleColorChange = async (color: string) => {
    if (!note) return
    const res = await fetch(`/api/notes/${note.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ color }) })
    if (res.ok) setNote(await res.json())
    setShowColorPicker(false)
  }

  const handlePin = async () => {
    if (!note) return
    const res = await fetch(`/api/notes/${note.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: !note.pinned }) })
    if (res.ok) setNote(await res.json())
  }

  const handleDelete = async () => {
    if (!note || !confirm('Delete this note permanently?')) return
    await fetch(`/api/notes/${note.id}`, { method: 'DELETE' })
    router.push('/notes')
  }

  const handleLinkNote = async (targetId: string) => {
    if (!note) return
    const current = note.linkedNoteIds || []
    if (current.includes(targetId)) return
    const newLinked = [...current, targetId]
    const res = await fetch(`/api/notes/${note.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linkedNoteIds: newLinked }) })
    if (res.ok) setNote(await res.json())
    setShowLinkPicker(false); setLinkSearch('')
  }

  const handleUnlinkNote = async (targetId: string) => {
    if (!note) return
    const res = await fetch(`/api/notes/${note.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linkedNoteIds: note.linkedNoteIds.filter((id) => id !== targetId) }) })
    if (res.ok) setNote(await res.json())
  }

  const handleAiAssist = async () => {
    if (!note || !editor) return
    const content = editor.getText()
    if (!content.trim()) return
    setAiLoading(true); setAiResponse('')
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `I'm reviewing my note titled "${note.title}":\n\n${content}\n\nGive me concise insights, patterns you notice, and 2-3 actionable suggestions based on what you know about me.` }],
          conversationId: null,
        }),
      })
      if (!res.ok || !res.body) throw new Error('Failed')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setAiResponse(accumulated)
      }
    } catch (err) {
      console.error('AI assist error:', err)
      setAiResponse('Failed to get AI assistance.')
    } finally { setAiLoading(false) }
  }

  const handleExport = (format: 'txt' | 'md' | 'json') => {
    if (!note) return
    window.open(`/api/export?type=note&id=${note.id}&format=${format}`, '_blank')
    setShowExportMenu(false)
  }

  const filteredLinkable = allNotes.filter((n) =>
    !note?.linkedNoteIds?.includes(n.id) &&
    (n.title.toLowerCase().includes(linkSearch.toLowerCase()) || linkSearch === '')
  )

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-surface border-2 border-accent/40 flex items-center justify-center shadow-glow-gold animate-pulse-gold">
            <Bot className="w-8 h-8 text-accent" strokeWidth={1.5} />
          </div>
        </div>
      </div>
    )
  }
  if (!note) return null

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top toolbar */}
      <div
        className="sticky top-0 z-20 bg-background/92 backdrop-blur-md border-b"
        style={{ borderColor: `${note.color}28` }}
      >
        <div className="px-6 py-3 flex items-center gap-4">
          {/* Left group */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <NextLink href="/notes" className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </NextLink>

            {/* Color dot */}
            <div className="relative">
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="w-5 h-5 rounded-full border-2 border-border transition-transform hover:scale-110"
                style={{ backgroundColor: note.color }}
              />
              <AnimatePresence>
                {showColorPicker && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -4 }}
                    className="absolute top-full left-0 mt-2 p-3 rounded-xl bg-surface border border-border shadow-card z-30"
                  >
                    <div className="grid grid-cols-4 gap-2">
                      {NOTE_COLORS.map((color) => (
                        <button key={color} onClick={() => handleColorChange(color)}
                          className={cn('w-6 h-6 rounded-full transition-transform hover:scale-110',
                            note.color === color && 'ring-2 ring-white ring-offset-1 ring-offset-surface')}
                          style={{ backgroundColor: color }} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Save indicator */}
            <div className="flex items-center gap-1.5 text-xs text-muted/40">
              {saving ? (
                <><Loader2 className="w-3 h-3 animate-spin" />Saving…</>
              ) : (
                <><Save className="w-3 h-3" />{note.updatedAt && formatDate(note.updatedAt)}</>
              )}
            </div>
          </div>

          {/* Center: editor toolbar */}
          {editor && (
            <div className="flex items-center gap-0.5 overflow-x-auto flex-1 justify-center">
              {[
                { icon: Bold,        action: () => editor.chain().focus().toggleBold().run(),               isActive: editor.isActive('bold'),                   title: 'Bold' },
                { icon: Italic,      action: () => editor.chain().focus().toggleItalic().run(),             isActive: editor.isActive('italic'),                 title: 'Italic' },
                { icon: Heading1,    action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), isActive: editor.isActive('heading', { level: 1 }), title: 'H1' },
                { icon: Heading2,    action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), isActive: editor.isActive('heading', { level: 2 }), title: 'H2' },
                { icon: List,        action: () => editor.chain().focus().toggleBulletList().run(),          isActive: editor.isActive('bulletList'),             title: 'Bullet' },
                { icon: ListOrdered, action: () => editor.chain().focus().toggleOrderedList().run(),         isActive: editor.isActive('orderedList'),            title: 'Ordered' },
                { icon: CheckSquare, action: () => editor.chain().focus().toggleTaskList().run(),            isActive: editor.isActive('taskList'),               title: 'Tasks' },
                { icon: Code,        action: () => editor.chain().focus().toggleCode().run(),               isActive: editor.isActive('code'),                   title: 'Code' },
                { icon: Quote,       action: () => editor.chain().focus().toggleBlockquote().run(),          isActive: editor.isActive('blockquote'),             title: 'Quote' },
              ].map(({ icon: Icon, action, isActive, title }) => (
                <button key={title} onClick={action} title={title}
                  className={cn('p-1.5 rounded-md transition-colors',
                    isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:text-foreground hover:bg-surface-2')}>
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          )}

          {/* Right actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={handleAiAssist} disabled={aiLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl btn-gold text-xs font-semibold relative"
            >
              {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin relative z-10" /> : <Sparkles className="w-3.5 h-3.5 relative z-10" />}
              <span className="relative z-10">Ask Skippy</span>
            </motion.button>

            <NextLink
              href={`/debate?topic=${encodeURIComponent(note.title)}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border text-xs font-medium text-muted hover:text-foreground hover:border-accent/30 transition-all"
              title="Debate this note"
            >
              <Swords className="w-3.5 h-3.5" />
              <span>Debate</span>
            </NextLink>

            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border text-xs font-medium text-muted hover:text-foreground hover:border-accent/30 transition-all"
                title="Export note"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
              </button>
              <AnimatePresence>
                {showExportMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: -4 }}
                    className="absolute right-0 top-full mt-2 bg-surface border border-border rounded-xl shadow-card z-30 overflow-hidden min-w-[120px]"
                  >
                    {([['txt', 'Plain text'], ['md', 'Markdown'], ['json', 'JSON']] as const).map(([fmt, label]) => (
                      <button
                        key={fmt}
                        onClick={() => handleExport(fmt)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-muted hover:text-foreground hover:bg-surface-2 transition-colors text-left"
                      >
                        <Download className="w-3 h-3" />.{fmt} — {label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button onClick={handlePin}
              className={cn('p-2 rounded-xl transition-colors', note.pinned ? 'text-accent bg-accent/10 border border-accent/25' : 'text-muted hover:text-foreground hover:bg-surface border border-transparent')}>
              <Pin className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowPanel((p) => !p)}
              title={showPanel ? 'Hide context panel' : 'Show context panel'}
              className={cn('p-2 rounded-xl transition-colors border', showPanel ? 'text-accent bg-accent/10 border-accent/25' : 'text-muted hover:text-foreground hover:bg-surface border-transparent')}>
              <PanelRight className="w-4 h-4" />
            </button>

            <button onClick={handleDelete}
              className="p-2 rounded-xl text-muted hover:text-red-400 hover:bg-red-400/10 border border-transparent transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor area */}
        <div className="flex-1 overflow-y-auto px-8 py-8 max-w-3xl mx-auto w-full">
          {/* Colored top bar */}
          <div className="h-[3px] w-16 rounded-full mb-8 opacity-70" style={{ backgroundColor: note.color }} />

          {/* Title */}
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled"
            className="w-full bg-transparent font-display text-4xl font-bold text-foreground placeholder:text-muted/25 outline-none mb-5 border-none"
          />

          {/* Tags */}
          <div className="flex flex-wrap items-center gap-2 mb-8">
            {note.tags.map((tag) => (
              <span key={tag}
                className="group flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium cursor-default"
                style={{ backgroundColor: `${note.color}18`, color: note.color }}>
                #{tag}
                <button onClick={() => handleRemoveTag(tag)} className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {showTagInput ? (
              <div className="flex items-center gap-1">
                <input autoFocus type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(); if (e.key === 'Escape') { setShowTagInput(false); setNewTag('') } }}
                  placeholder="tag name"
                  className="w-24 text-xs bg-surface border border-border rounded-full px-2.5 py-1 text-foreground placeholder:text-muted outline-none focus:border-accent/50" />
                <button onClick={handleAddTag} className="p-1 rounded-full text-muted hover:text-foreground"><Plus className="w-3 h-3" /></button>
                <button onClick={() => { setShowTagInput(false); setNewTag('') }} className="p-1 rounded-full text-muted hover:text-foreground"><X className="w-3 h-3" /></button>
              </div>
            ) : (
              <button onClick={() => setShowTagInput(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-muted border border-dashed border-border hover:border-accent/40 hover:text-foreground transition-colors">
                <Tag className="w-3 h-3" />Add tag
              </button>
            )}
          </div>

          {/* Editor */}
          <EditorContent editor={editor} className="min-h-[300px] text-foreground/90" />

          {/* AI Response panel */}
          <AnimatePresence>
            {(aiResponse || aiLoading) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="mt-8 rounded-2xl overflow-hidden"
                style={{ border: `1px solid ${note.color}30`, background: `linear-gradient(135deg, rgba(7,16,31,0.95), rgba(11,24,40,0.9))` }}
              >
                <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: `${note.color}20` }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-accent/15 border border-accent/25 flex items-center justify-center">
                      <Sparkles className="w-3.5 h-3.5 text-accent" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">Skippy&apos;s thoughts</span>
                  </div>
                  <button onClick={() => setAiResponse('')} className="text-muted/50 hover:text-muted transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-5">
                  {aiLoading && !aiResponse ? (
                    <div className="flex items-center gap-1.5 text-muted text-sm">
                      <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                    </div>
                  ) : (
                    <div className="prose-dark text-sm">
                      <p className="whitespace-pre-wrap text-foreground/80 leading-relaxed">{aiResponse}</p>
                      {aiLoading && <span className="inline-block w-0.5 h-4 bg-accent animate-blink ml-0.5" />}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right panel: connections */}
        <aside className={cn(
          'flex-shrink-0 border-l border-border bg-surface/40 overflow-y-auto overflow-x-hidden transition-all duration-300',
          showPanel ? 'w-72' : 'w-0 border-l-0'
        )}>
          {showPanel && (
          <div className="w-72 p-4 space-y-6">

            {/* Linked notes */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-accent/70" />
                  <span className="text-xs font-bold text-muted/60 uppercase tracking-wider">Linked Notes</span>
                </div>
                <button
                  onClick={() => setShowLinkPicker((p) => !p)}
                  className="p-1 rounded-lg text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                  title="Link a note"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Link picker */}
              <AnimatePresence>
                {showLinkPicker && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-3 overflow-hidden"
                  >
                    <input
                      autoFocus
                      type="text"
                      value={linkSearch}
                      onChange={(e) => setLinkSearch(e.target.value)}
                      placeholder="Search notes…"
                      className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-xs text-foreground placeholder:text-muted/40 outline-none focus:border-accent/40 mb-2"
                    />
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {filteredLinkable.slice(0, 8).map((n) => (
                        <button key={n.id} onClick={() => handleLinkNote(n.id)}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-2 text-left transition-colors group">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: n.color }} />
                          <span className="text-xs text-foreground/80 truncate flex-1">{n.title || 'Untitled'}</span>
                          <Plus className="w-3 h-3 text-muted/40 group-hover:text-accent flex-shrink-0 transition-colors" />
                        </button>
                      ))}
                      {filteredLinkable.length === 0 && (
                        <p className="text-xs text-muted/40 text-center py-2">No notes found</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {linkedNotes.length > 0 ? (
                <div className="space-y-2">
                  {linkedNotes.map((n) => (
                    <div key={n.id}
                      className="group flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface border border-border hover:border-accent/25 transition-all"
                    >
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: n.color }} />
                      <span className="text-xs text-foreground/80 flex-1 truncate">{n.title || 'Untitled'}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <NextLink href={`/notes/${n.id}`}
                          className="p-1 rounded-md text-muted hover:text-accent transition-colors">
                          <ExternalLink className="w-3 h-3" />
                        </NextLink>
                        <button onClick={() => handleUnlinkNote(n.id)}
                          className="p-1 rounded-md text-muted hover:text-red-400 transition-colors">
                          <Unlink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 px-2">
                  <Link2 className="w-5 h-5 text-muted/20 mx-auto mb-1.5" />
                  <p className="text-[11px] text-muted/40 leading-tight">Link related notes to build your knowledge web</p>
                </div>
              )}
            </div>

            {/* Linked debate */}
            {note.linkedDebateId && (
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <Swords className="w-3.5 h-3.5 text-accent/70" />
                  <span className="text-xs font-bold text-muted/60 uppercase tracking-wider">From Debate</span>
                </div>
                <NextLink href={`/debate/${note.linkedDebateId}`}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface border border-accent/20 hover:border-accent/40 transition-all group">
                  <Swords className="w-3.5 h-3.5 text-accent/70 flex-shrink-0" />
                  <span className="text-xs text-foreground/80 flex-1">View debate</span>
                  <ChevronRight className="w-3 h-3 text-muted/40 group-hover:text-accent transition-colors" />
                </NextLink>
              </div>
            )}

            {/* Related memories */}
            {memories.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <Brain className="w-3.5 h-3.5 text-accent/70" />
                  <span className="text-xs font-bold text-muted/60 uppercase tracking-wider">From Memory</span>
                </div>
                <div className="space-y-2">
                  {memories.slice(0, 4).map((mem) => (
                    <div key={mem.id} className="px-3 py-2.5 rounded-xl bg-surface border border-border">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent/10 text-accent/70">
                          {mem.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted/70 leading-snug">{mem.content}</p>
                    </div>
                  ))}
                  <NextLink href="/memory"
                    className="flex items-center justify-center gap-1 text-[11px] text-muted/40 hover:text-accent transition-colors py-1">
                    <span>View all memories</span>
                    <ChevronRight className="w-3 h-3" />
                  </NextLink>
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <FileText className="w-3.5 h-3.5 text-accent/70" />
                <span className="text-xs font-bold text-muted/60 uppercase tracking-wider">Quick Actions</span>
              </div>
              <div className="space-y-2">
                <NextLink
                  href={`/debate?topic=${encodeURIComponent(note.title)}`}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface border border-border hover:border-accent/30 transition-all group"
                >
                  <Swords className="w-3.5 h-3.5 text-muted/50 group-hover:text-accent transition-colors" />
                  <div>
                    <p className="text-xs font-medium text-foreground/80">Debate this note</p>
                    <p className="text-[10px] text-muted/40">Challenge your assumptions</p>
                  </div>
                </NextLink>
                <NextLink
                  href="/chat"
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface border border-border hover:border-accent/30 transition-all group"
                >
                  <Bot className="w-3.5 h-3.5 text-muted/50 group-hover:text-accent transition-colors" />
                  <div>
                    <p className="text-xs font-medium text-foreground/80">Chat about this</p>
                    <p className="text-[10px] text-muted/40">Open a conversation</p>
                  </div>
                </NextLink>
              </div>
            </div>

            {/* Metadata */}
            <div className="pt-2 border-t border-border space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted/40">Created</span>
                <span className="text-muted/60">{formatRelativeTime(note.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted/40">Updated</span>
                <span className="text-muted/60">{formatRelativeTime(note.updatedAt)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted/40">Links</span>
                <span className="text-muted/60">{note.linkedNoteIds?.length || 0} notes</span>
              </div>
            </div>
          </div>
          )}
        </aside>
      </div>
    </div>
  )
}
