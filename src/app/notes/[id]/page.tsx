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
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Pin, Trash2, Tag, Plus, X, Save,
  Bold, Italic, List, ListOrdered, Code, Quote, Heading1, Heading2,
  CheckSquare, Loader2, Swords, Link2, FileText, Brain,
  ExternalLink, ChevronRight, Unlink, Download, PanelRight,
  Send, CornerDownLeft, Sparkles, MessageSquare,
} from 'lucide-react'
import { cn, formatDate, formatRelativeTime } from '@/lib/utils'
import NextLink from 'next/link'

const NOTE_COLORS = ['#29c2e6', '#2d6ae0', '#10b981', '#f97316', '#ec4899', '#a78bfa', '#7ee8fa', '#d4a028']

interface Note {
  id: string; title: string; content: string; tags: string[]; color: string
  pinned: boolean; linkedNoteIds: string[]; linkedDebateId?: string | null
  createdAt: string; updatedAt: string
}
interface NoteStub { id: string; title: string; color: string; tags: string[]; updatedAt: string }
interface Memory { id: string; category: string; content: string; importance: number }
interface ChatMessage { role: 'user' | 'assistant'; content: string }

const QUICK_PROMPTS = [
  { label: 'Analyse this note', prompt: 'Analyse this note. Give me insights, patterns you notice, and 3 concrete next steps I should take.' },
  { label: 'What do I know?', prompt: 'Based on my memories and past notes, what do I already know about the topic of this note? Make connections I might have missed.' },
  { label: 'Expand ideas', prompt: 'Take the main ideas in this note and expand them into detailed explanations. What am I missing? What should I explore further?' },
  { label: 'Action plan', prompt: 'Based on this note, create a concrete, prioritised action plan with specific measurable steps.' },
  { label: 'Summary for export', prompt: 'Write a polished, comprehensive summary of this note. Include key insights, conclusions, and any open questions. Format it cleanly so I can export and share it.' },
  { label: "Today's context", prompt: "Summarise what I've talked about today and how it connects to this note. Pull from my memories and recent conversations." },
]

export default function NoteEditorPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [note, setNote] = useState<Note | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [newTag, setNewTag] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [allNotes, setAllNotes] = useState<NoteStub[]>([])
  const [linkedNotes, setLinkedNotes] = useState<NoteStub[]>([])
  const [memories, setMemories] = useState<Memory[]>([])
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')
  const [showPanel, setShowPanel] = useState(true)
  const [activeTab, setActiveTab] = useState<'context' | 'chat'>('context')

  // Skippy inline chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatStreaming, setChatStreaming] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)

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
      fetch('/api/memories').then((r) => r.ok ? r.json() : { memories: [] }),
    ]).then(([noteData, notesData, memData]) => {
      if (!noteData) { router.push('/notes'); return }
      setNote(noteData)
      setTitle(noteData.title)
      setAllNotes(notesData.filter((n: NoteStub) => n.id !== noteData.id))
      const mems: Memory[] = ((memData as { memories: Memory[] })?.memories || []).slice(0, 5)
      setMemories(mems)
      if (editor && noteData.content) editor.commands.setContent(noteData.content)
    }).catch((err) => { console.error(err); router.push('/notes') })
    .finally(() => setLoading(false))
  }, [params.id, router, editor]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (note && editor && !loading) editor.commands.setContent(note.content || '')
  }, [note?.id, editor, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!note?.linkedNoteIds?.length) { setLinkedNotes([]); return }
    const linked = allNotes.filter((n) => note.linkedNoteIds.includes(n.id))
    setLinkedNotes(linked)
  }, [note?.linkedNoteIds, allNotes])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatStreaming])

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

  const handleExport = (format: 'txt' | 'md' | 'json') => {
    if (!note) return
    window.open(`/api/export?type=note&id=${note.id}&format=${format}`, '_blank')
    setShowExportMenu(false)
  }

  // Skippy inline chat
  const sendChatMessage = useCallback(async (userText: string) => {
    if (!note || !userText.trim() || chatStreaming) return
    const userMsg: ChatMessage = { role: 'user', content: userText.trim() }
    const nextMessages = [...chatMessages, userMsg]
    setChatMessages(nextMessages)
    setChatInput('')
    setChatStreaming(true)

    // Placeholder for streaming assistant message
    setChatMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      const res = await fetch(`/api/notes/${note.id}/assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      })
      if (!res.ok || !res.body) throw new Error('Failed')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setChatMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: accumulated }
          return updated
        })
      }
    } catch {
      setChatMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: 'Something went wrong. Try again.' }
        return updated
      })
    } finally {
      setChatStreaming(false)
    }
  }, [note, chatMessages, chatStreaming])

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendChatMessage(chatInput)
    }
  }

  const handleInsertIntoNote = (content: string) => {
    if (!editor) return
    // Insert a divider then the content as a blockquote from Skippy
    editor.chain().focus().insertContent(
      `<hr><p><strong>Skippy:</strong></p><p>${content.replace(/\n/g, '<br>')}</p>`
    ).run()
  }

  const handleQuickPrompt = (prompt: string) => {
    setActiveTab('chat')
    setShowPanel(true)
    sendChatMessage(prompt)
  }

  const filteredLinkable = allNotes.filter((n) =>
    !note?.linkedNoteIds?.includes(n.id) &&
    (n.title.toLowerCase().includes(linkSearch.toLowerCase()) || linkSearch === '')
  )

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: '#060d1a' }}>
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center animate-pulse-cyan overflow-hidden"
            style={{ background: 'rgba(10,26,53,0.9)', border: '1px solid rgba(41,194,230,0.4)' }}>
            <div className="relative w-12 h-12">
              <Image src="/img/skippyENHANCED3D-removebg.png" alt="Skippy" fill className="object-contain drop-shadow-[0_0_10px_rgba(41,194,230,0.7)]" />
            </div>
          </div>
        </div>
      </div>
    )
  }
  if (!note) return null

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#060d1a' }}>
      {/* Top toolbar */}
      <div
        className="sticky top-0 z-20 backdrop-blur-md border-b"
        style={{ background: 'rgba(6,13,26,0.92)', borderColor: `${note.color}28` }}
      >
        <div className="px-6 py-3 flex items-center gap-4">
          {/* Left group */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <NextLink href="/notes" className="p-2 rounded-xl text-muted hover:text-foreground transition-colors"
              style={{ background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,39,89,0.6)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <ArrowLeft className="w-4 h-4" />
            </NextLink>

            {/* Color dot */}
            <div className="relative">
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{ backgroundColor: note.color, borderColor: `${note.color}60` }}
              />
              <AnimatePresence>
                {showColorPicker && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -4 }}
                    className="absolute top-full left-0 mt-2 p-3 rounded-xl z-30"
                    style={{ background: 'rgba(10,26,53,0.98)', border: '1px solid rgba(30,58,110,0.9)' }}
                  >
                    <div className="grid grid-cols-4 gap-2">
                      {NOTE_COLORS.map((color) => (
                        <button key={color} onClick={() => handleColorChange(color)}
                          className={cn('w-6 h-6 rounded-full transition-transform hover:scale-110',
                            note.color === color && 'ring-2 ring-white ring-offset-1 ring-offset-[#060d1a]')}
                          style={{ backgroundColor: color }} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Save indicator */}
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(77,112,153,0.5)' }}>
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
                    isActive ? 'text-accent' : 'text-muted hover:text-foreground')}
                  style={isActive ? { background: 'rgba(41,194,230,0.12)' } : {}}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,39,89,0.6)' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = '' }}>
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          )}

          {/* Right actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Ask Skippy → opens chat panel */}
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => { setActiveTab('chat'); setShowPanel(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl btn-cyan text-xs font-semibold relative"
            >
              <Sparkles className="w-3.5 h-3.5 relative z-10" />
              <span className="relative z-10">Ask Skippy</span>
            </motion.button>

            <NextLink
              href={`/debate?topic=${encodeURIComponent(note.title)}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-muted hover:text-foreground transition-all"
              style={{ background: 'rgba(15,39,89,0.4)', border: '1px solid rgba(30,58,110,0.8)' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(41,194,230,0.3)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(30,58,110,0.8)')}
            >
              <Swords className="w-3.5 h-3.5" />
              <span>Debate</span>
            </NextLink>

            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-muted hover:text-foreground transition-all"
                style={{ background: 'rgba(15,39,89,0.4)', border: '1px solid rgba(30,58,110,0.8)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(41,194,230,0.3)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(30,58,110,0.8)')}
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
                    className="absolute right-0 top-full mt-2 rounded-xl z-30 overflow-hidden min-w-[130px]"
                    style={{ background: 'rgba(10,26,53,0.98)', border: '1px solid rgba(30,58,110,0.9)' }}
                  >
                    {([['txt', 'Plain text'], ['md', 'Markdown'], ['json', 'JSON']] as const).map(([fmt, label]) => (
                      <button key={fmt} onClick={() => handleExport(fmt)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-muted hover:text-foreground transition-colors text-left"
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,39,89,0.6)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <Download className="w-3 h-3" />.{fmt} — {label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button onClick={handlePin}
              className={cn('p-2 rounded-xl transition-colors border', note.pinned ? 'text-accent' : 'text-muted hover:text-foreground')}
              style={note.pinned
                ? { background: 'rgba(41,194,230,0.1)', borderColor: 'rgba(41,194,230,0.25)' }
                : { background: 'transparent', borderColor: 'transparent' }}>
              <Pin className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowPanel((p) => !p)}
              className={cn('p-2 rounded-xl transition-colors border', showPanel ? 'text-accent' : 'text-muted hover:text-foreground')}
              style={showPanel
                ? { background: 'rgba(41,194,230,0.1)', borderColor: 'rgba(41,194,230,0.25)' }
                : { background: 'transparent', borderColor: 'transparent' }}>
              <PanelRight className="w-4 h-4" />
            </button>

            <button onClick={handleDelete}
              className="p-2 rounded-xl text-muted hover:text-red-400 border border-transparent hover:border-red-400/20 hover:bg-red-400/10 transition-colors">
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
                  className="w-24 text-xs rounded-full px-2.5 py-1 text-foreground placeholder:text-muted outline-none"
                  style={{ background: 'rgba(15,39,89,0.6)', border: '1px solid rgba(30,58,110,0.8)' }} />
                <button onClick={handleAddTag} className="p-1 rounded-full text-muted hover:text-foreground"><Plus className="w-3 h-3" /></button>
                <button onClick={() => { setShowTagInput(false); setNewTag('') }} className="p-1 rounded-full text-muted hover:text-foreground"><X className="w-3 h-3" /></button>
              </div>
            ) : (
              <button onClick={() => setShowTagInput(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-muted border border-dashed transition-colors"
                style={{ borderColor: 'rgba(30,58,110,0.8)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(41,194,230,0.4)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(30,58,110,0.8)')}>
                <Tag className="w-3 h-3" />Add tag
              </button>
            )}
          </div>

          {/* Editor */}
          <EditorContent editor={editor} className="min-h-[300px] text-foreground/90" />

          {/* Quick prompts — shown below editor as inspiration when note is empty */}
          {editor && editor.getText().trim().length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-10 pt-8 border-t"
              style={{ borderColor: 'rgba(30,58,110,0.4)' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="relative w-5 h-5 flex-shrink-0">
                  <Image src="/img/skippyENHANCED3D-removebg.png" alt="Skippy" fill className="object-contain" />
                </div>
                <span className="text-xs font-semibold" style={{ color: 'rgba(41,194,230,0.7)' }}>
                  Let Skippy help you start
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.slice(0, 3).map((qp) => (
                  <button
                    key={qp.label}
                    onClick={() => handleQuickPrompt(qp.prompt)}
                    className="text-xs px-3 py-2 rounded-xl transition-all"
                    style={{
                      background: 'rgba(41,194,230,0.05)',
                      border: '1px solid rgba(41,194,230,0.2)',
                      color: 'rgba(41,194,230,0.8)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(41,194,230,0.12)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(41,194,230,0.05)')}
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Right panel */}
        <aside className={cn(
          'flex-shrink-0 border-l overflow-hidden transition-all duration-300',
          showPanel ? 'w-72' : 'w-0 border-l-0'
        )}
          style={{ borderColor: 'rgba(30,58,110,0.6)', background: 'rgba(10,26,53,0.4)' }}>
          {showPanel && (
            <div className="w-72 flex flex-col h-full">
              {/* Tabs */}
              <div className="flex border-b flex-shrink-0" style={{ borderColor: 'rgba(30,58,110,0.6)' }}>
                <button
                  onClick={() => setActiveTab('context')}
                  className={cn('flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-semibold transition-colors')}
                  style={activeTab === 'context'
                    ? { color: '#29c2e6', borderBottom: '2px solid #29c2e6' }
                    : { color: 'rgba(77,112,153,0.7)', borderBottom: '2px solid transparent' }}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Context
                </button>
                <button
                  onClick={() => setActiveTab('chat')}
                  className={cn('flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-semibold transition-colors relative')}
                  style={activeTab === 'chat'
                    ? { color: '#29c2e6', borderBottom: '2px solid #29c2e6' }
                    : { color: 'rgba(77,112,153,0.7)', borderBottom: '2px solid transparent' }}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Ask Skippy
                  {chatMessages.length > 0 && (
                    <span className="absolute top-2 right-3 w-1.5 h-1.5 rounded-full bg-accent animate-blink" />
                  )}
                </button>
              </div>

              {/* Context tab */}
              {activeTab === 'context' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  {/* Linked notes */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5" style={{ color: 'rgba(41,194,230,0.7)' }} />
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(77,112,153,0.6)' }}>Linked Notes</span>
                      </div>
                      <button
                        onClick={() => setShowLinkPicker((p) => !p)}
                        className="p-1 rounded-lg text-muted hover:text-accent transition-colors"
                        style={{ background: 'transparent' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(41,194,230,0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

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
                            className="w-full px-3 py-2 rounded-xl text-xs text-foreground placeholder:text-muted/40 outline-none mb-2"
                            style={{ background: 'rgba(15,39,89,0.6)', border: '1px solid rgba(30,58,110,0.8)' }}
                          />
                          <div className="space-y-1 max-h-36 overflow-y-auto">
                            {filteredLinkable.slice(0, 8).map((n) => (
                              <button key={n.id} onClick={() => handleLinkNote(n.id)}
                                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors group"
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,39,89,0.6)')}
                                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: n.color }} />
                                <span className="text-xs text-foreground/80 truncate flex-1">{n.title || 'Untitled'}</span>
                                <Plus className="w-3 h-3 text-muted/40 group-hover:text-accent flex-shrink-0 transition-colors" />
                              </button>
                            ))}
                            {filteredLinkable.length === 0 && (
                              <p className="text-xs text-center py-2" style={{ color: 'rgba(77,112,153,0.4)' }}>No notes found</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {linkedNotes.length > 0 ? (
                      <div className="space-y-2">
                        {linkedNotes.map((n) => (
                          <div key={n.id}
                            className="group flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all"
                            style={{ background: 'rgba(15,39,89,0.3)', border: '1px solid rgba(30,58,110,0.6)' }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(41,194,230,0.25)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(30,58,110,0.6)')}
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
                        <Link2 className="w-5 h-5 mx-auto mb-1.5" style={{ color: 'rgba(41,194,230,0.15)' }} />
                        <p className="text-[11px] leading-tight" style={{ color: 'rgba(77,112,153,0.4)' }}>Link related notes to build your knowledge web</p>
                      </div>
                    )}
                  </div>

                  {/* Linked debate */}
                  {note.linkedDebateId && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-3">
                        <Swords className="w-3.5 h-3.5" style={{ color: 'rgba(41,194,230,0.7)' }} />
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(77,112,153,0.6)' }}>From Debate</span>
                      </div>
                      <NextLink href={`/debate/${note.linkedDebateId}`}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all group"
                        style={{ background: 'rgba(41,194,230,0.05)', border: '1px solid rgba(41,194,230,0.2)' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(41,194,230,0.4)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(41,194,230,0.2)')}>
                        <Swords className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(41,194,230,0.7)' }} />
                        <span className="text-xs text-foreground/80 flex-1">View debate</span>
                        <ChevronRight className="w-3 h-3 text-muted/40 group-hover:text-accent transition-colors" />
                      </NextLink>
                    </div>
                  )}

                  {/* Related memories */}
                  {memories.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-3">
                        <Brain className="w-3.5 h-3.5" style={{ color: 'rgba(41,194,230,0.7)' }} />
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(77,112,153,0.6)' }}>From Memory</span>
                      </div>
                      <div className="space-y-2">
                        {memories.slice(0, 4).map((mem) => (
                          <div key={mem.id} className="px-3 py-2.5 rounded-xl border"
                            style={{ background: 'rgba(15,39,89,0.3)', border: '1px solid rgba(30,58,110,0.6)' }}>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                                style={{ background: 'rgba(41,194,230,0.1)', color: 'rgba(41,194,230,0.7)' }}>
                                {mem.category}
                              </span>
                            </div>
                            <p className="text-[11px] leading-snug" style={{ color: 'rgba(77,112,153,0.7)' }}>{mem.content}</p>
                          </div>
                        ))}
                        <NextLink href="/memory"
                          className="flex items-center justify-center gap-1 text-[11px] py-1 transition-colors"
                          style={{ color: 'rgba(77,112,153,0.4)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#29c2e6')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(77,112,153,0.4)')}>
                          <span>View all memories</span>
                          <ChevronRight className="w-3 h-3" />
                        </NextLink>
                      </div>
                    </div>
                  )}

                  {/* Quick actions */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-3">
                      <FileText className="w-3.5 h-3.5" style={{ color: 'rgba(41,194,230,0.7)' }} />
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(77,112,153,0.6)' }}>Quick Actions</span>
                    </div>
                    <div className="space-y-2">
                      <NextLink
                        href={`/debate?topic=${encodeURIComponent(note.title)}`}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all group"
                        style={{ background: 'rgba(15,39,89,0.3)', border: '1px solid rgba(30,58,110,0.6)' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(41,194,230,0.3)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(30,58,110,0.6)')}
                      >
                        <Swords className="w-3.5 h-3.5 text-muted/50 group-hover:text-accent transition-colors" />
                        <div>
                          <p className="text-xs font-medium text-foreground/80">Debate this note</p>
                          <p className="text-[10px]" style={{ color: 'rgba(77,112,153,0.4)' }}>Challenge your assumptions</p>
                        </div>
                      </NextLink>
                      <button
                        onClick={() => { setActiveTab('chat'); sendChatMessage(QUICK_PROMPTS[4].prompt) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all group"
                        style={{ background: 'rgba(15,39,89,0.3)', border: '1px solid rgba(30,58,110,0.6)' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(41,194,230,0.3)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(30,58,110,0.6)')}
                      >
                        <Download className="w-3.5 h-3.5 text-muted/50 group-hover:text-accent transition-colors" />
                        <div>
                          <p className="text-xs font-medium text-foreground/80">Generate export summary</p>
                          <p className="text-[10px]" style={{ color: 'rgba(77,112,153,0.4)' }}>Skippy writes a polished version</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="pt-2 border-t space-y-1.5" style={{ borderColor: 'rgba(30,58,110,0.4)' }}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span style={{ color: 'rgba(77,112,153,0.4)' }}>Created</span>
                      <span style={{ color: 'rgba(77,112,153,0.6)' }}>{formatRelativeTime(note.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span style={{ color: 'rgba(77,112,153,0.4)' }}>Updated</span>
                      <span style={{ color: 'rgba(77,112,153,0.6)' }}>{formatRelativeTime(note.updatedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span style={{ color: 'rgba(77,112,153,0.4)' }}>Links</span>
                      <span style={{ color: 'rgba(77,112,153,0.6)' }}>{note.linkedNoteIds?.length || 0} notes</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Chat tab */}
              {activeTab === 'chat' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Quick prompts */}
                  <div className="p-3 border-b flex-shrink-0" style={{ borderColor: 'rgba(30,58,110,0.4)' }}>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_PROMPTS.map((qp) => (
                        <button
                          key={qp.label}
                          onClick={() => sendChatMessage(qp.prompt)}
                          disabled={chatStreaming}
                          className="text-[10px] px-2 py-1 rounded-lg transition-all disabled:opacity-40"
                          style={{
                            background: 'rgba(41,194,230,0.06)',
                            border: '1px solid rgba(41,194,230,0.18)',
                            color: 'rgba(41,194,230,0.75)',
                          }}
                          onMouseEnter={e => { if (!chatStreaming) (e.currentTarget.style.background = 'rgba(41,194,230,0.14)') }}
                          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(41,194,230,0.06)')}
                        >
                          {qp.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {chatMessages.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                        <div className="relative w-10 h-10 mb-3 opacity-60">
                          <Image src="/img/skippyENHANCED3D-removebg.png" alt="Skippy" fill className="object-contain drop-shadow-[0_0_8px_rgba(41,194,230,0.5)]" />
                        </div>
                        <p className="text-xs font-semibold" style={{ color: '#29c2e6' }}>Skippy is ready</p>
                        <p className="text-[10px] mt-1 leading-relaxed" style={{ color: 'rgba(77,112,153,0.5)' }}>
                          Ask anything about this note, or use a quick prompt above.
                        </p>
                      </div>
                    )}

                    {chatMessages.map((msg, i) => (
                      <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                        {msg.role === 'assistant' && (
                          <div className="flex-shrink-0 w-6 h-6 rounded-lg overflow-hidden relative mt-0.5"
                            style={{ background: 'rgba(10,26,53,0.9)', border: '1px solid rgba(41,194,230,0.3)' }}>
                            <Image src="/img/skippyENHANCED3D-removebg.png" alt="Skippy" fill className="object-contain p-0.5" />
                          </div>
                        )}
                        <div className={cn('flex-1 min-w-0', msg.role === 'user' ? 'flex flex-col items-end' : '')}>
                          <div
                            className="rounded-xl px-3 py-2 text-xs leading-relaxed max-w-[95%]"
                            style={msg.role === 'user'
                              ? { background: 'linear-gradient(135deg, #0a1a35, #0f2759)', border: '1px solid rgba(41,194,230,0.2)', color: 'rgba(216,232,248,0.9)' }
                              : { background: 'rgba(10,26,53,0.6)', border: '1px solid rgba(30,58,110,0.7)', color: 'rgba(216,232,248,0.85)' }
                            }
                          >
                            {msg.content === '' && chatStreaming && i === chatMessages.length - 1 ? (
                              <span className="flex gap-1">
                                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                              </span>
                            ) : (
                              <span className="whitespace-pre-wrap">{msg.content}</span>
                            )}
                            {chatStreaming && i === chatMessages.length - 1 && msg.content.length > 0 && (
                              <span className="inline-block w-0.5 h-3 bg-accent animate-blink ml-0.5 align-middle" />
                            )}
                          </div>
                          {/* Insert into note button */}
                          {msg.role === 'assistant' && msg.content.length > 10 && !chatStreaming && (
                            <button
                              onClick={() => handleInsertIntoNote(msg.content)}
                              className="mt-1 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md transition-all"
                              style={{ color: 'rgba(41,194,230,0.6)', background: 'transparent' }}
                              onMouseEnter={e => {
                                e.currentTarget.style.color = '#29c2e6'
                                e.currentTarget.style.background = 'rgba(41,194,230,0.08)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.color = 'rgba(41,194,230,0.6)'
                                e.currentTarget.style.background = 'transparent'
                              }}
                              title="Insert Skippy's response into the note"
                            >
                              <CornerDownLeft className="w-2.5 h-2.5" />
                              Insert into note
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Chat input */}
                  <div className="p-3 border-t flex-shrink-0" style={{ borderColor: 'rgba(30,58,110,0.4)' }}>
                    <div className="flex items-end gap-2 rounded-xl px-3 py-2"
                      style={{ background: 'rgba(10,26,53,0.9)', border: '1px solid rgba(30,58,110,0.8)' }}>
                      <textarea
                        ref={chatInputRef}
                        value={chatInput}
                        onChange={(e) => { if (e.target.value.length <= 2000) setChatInput(e.target.value) }}
                        onKeyDown={handleChatKeyDown}
                        placeholder="Ask Skippy about this note…"
                        disabled={chatStreaming}
                        rows={1}
                        className="flex-1 bg-transparent text-xs leading-5 resize-none outline-none text-foreground placeholder:text-muted/40 disabled:opacity-50 py-0.5 max-h-24 overflow-y-auto"
                        style={{ scrollbarWidth: 'none' }}
                      />
                      <button
                        onClick={() => sendChatMessage(chatInput)}
                        disabled={!chatInput.trim() || chatStreaming}
                        className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                        style={chatInput.trim() && !chatStreaming
                          ? { background: 'linear-gradient(135deg, #29c2e6, #1fb0d4)', color: '#0f2759' }
                          : { background: 'rgba(15,39,89,0.5)', color: 'rgba(77,112,153,0.5)' }}
                      >
                        {chatStreaming
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Send className="w-3 h-3" />}
                      </button>
                    </div>
                    <p className="text-[9px] text-center mt-1.5" style={{ color: 'rgba(77,112,153,0.3)' }}>
                      Enter to send · Shift+Enter for newline
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
