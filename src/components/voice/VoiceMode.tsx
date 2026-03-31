'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic, X, Loader2, Volume2, VolumeX, Send, CheckSquare,
  Square, Zap, Calendar, FileText, CheckCircle, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'listening' | 'processing' | 'speaking'

interface VoiceModeProps {
  onTranscript: (text: string, onChunk?: (chunk: string) => void, forceModel?: string) => Promise<string>
  chatBusy?: boolean
  autoActivate?: boolean
  className?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Real-time data detection — routes to Grok
// ─────────────────────────────────────────────────────────────────────────────

const LIVE_DATA_PATTERNS = [
  /\b(news|headline|headlines|breaking)\b/i,
  /\b(weather|forecast|temperature|rain|snow|sunny|storm)\b/i,
  /\b(stock|price|market|crypto|bitcoin|ethereum|nft)\b/i,
  /\b(score|scores|game|match|result|playoff|standings|nba|nfl|nhl|mlb|soccer|football)\b/i,
  /\b(today|tonight|this week|this month|right now|at the moment|currently)\b.*\b(happen|going|news|do|event)\b/i,
  /what.{0,30}(happening|going on|latest|new|trending)/i,
  /\b(recent|just happened|breaking|live|latest|update|updates)\b/i,
  /\b(who (is|won|won|leads|ahead))\b/i,
]

function needsLiveData(text: string): boolean {
  return LIVE_DATA_PATTERNS.some((p) => p.test(text))
}

// ─────────────────────────────────────────────────────────────────────────────
// Data intent detection — fetches todos/notes/reminders for visual display
// ─────────────────────────────────────────────────────────────────────────────

type DataIntent = 'todos' | 'notes' | 'reminders' | null

function detectDataIntent(text: string): DataIntent {
  if (/\b(todo|todos|task|tasks|to.do|my list|checklist|what.*(do|done|left))\b/i.test(text)) return 'todos'
  if (/\b(reminder|reminders|remind me|upcoming|scheduled)\b/i.test(text)) return 'reminders'
  if (/\b(note|notes|my notes|wrote|remember|saved)\b/i.test(text)) return 'notes'
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice selection (Web Speech API fallback)
// ─────────────────────────────────────────────────────────────────────────────

function pickMaleVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const FEMALE =
    /\b(samantha|karen|tessa|nicky|moira|victoria|zira|hazel|fiona|alice|kate|siri|allison|zoe|heather|claire|emma|joanna|kendra|kimberly|salli|amy|bella|olivia|aria|jenny|ana|michelle|monica|nora|susan|serena|google us english)\b/i
  const PRIORITIES: RegExp[] = [
    /\btom\b/i,
    /\baaron\b/i,
    /\bdaniel\b/i,
    /\bliam\b/i,
    /\breed\b/i,
    /\bzac\b/i,
    /google uk english male/i,
    /microsoft (mark|david|james|ryan)/i,
    /\b(mark|david|james|oliver|ryan|bruce|fred|matthew|arthur|alex)\b/i,
  ]
  for (const pat of PRIORITIES) {
    const v = voices.find((v) => pat.test(v.name) && v.lang.startsWith('en'))
    if (v) return v
  }
  return (
    voices.find((v) => /\bmale\b/i.test(v.name) && v.lang.startsWith('en')) ??
    voices.find((v) => v.lang === 'en-US' && !FEMALE.test(v.name)) ??
    voices.find((v) => v.lang.startsWith('en') && !FEMALE.test(v.name)) ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Greeting
// ─────────────────────────────────────────────────────────────────────────────

function makeGreeting(): string {
  const h = new Date().getHours()
  if (h < 5) return "Still up? What's on your mind?"
  if (h < 12) return 'Good morning! What can I help you with?'
  if (h < 17) return 'Hey! What can I do for you?'
  if (h < 21) return 'Good evening! What do you need?'
  return "Hey, what's up?"
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio chimes
// ─────────────────────────────────────────────────────────────────────────────

function chime(type: 'start' | 'done' | 'error') {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    if (type === 'start') {
      osc.frequency.setValueAtTime(440, ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(660, ctx.currentTime + 0.12)
      gain.gain.setValueAtTime(0.07, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28)
      osc.start(); osc.stop(ctx.currentTime + 0.28)
    } else if (type === 'done') {
      osc.frequency.setValueAtTime(660, ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.12)
      gain.gain.setValueAtTime(0.06, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
      osc.start(); osc.stop(ctx.currentTime + 0.25)
    } else {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(220, ctx.currentTime)
      gain.gain.setValueAtTime(0.05, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22)
      osc.start(); osc.stop(ctx.currentTime + 0.22)
    }
    setTimeout(() => ctx.close(), 800)
  } catch { /* blocked */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentence splitter for streaming TTS
// ─────────────────────────────────────────────────────────────────────────────

function pullSentences(buf: string): { sentences: string[]; rest: string } {
  const re = /[^.!?\n]*[.!?\n]+\s*/g
  const sentences: string[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(buf)) !== null) {
    const s = m[0].trim()
    if (s.length > 3) sentences.push(s)
    last = re.lastIndex
  }
  if (sentences.length === 0) {
    if (buf.length > 50) {
      const ci = buf.lastIndexOf(',')
      if (ci > 25) return { sentences: [buf.slice(0, ci + 1).trim()], rest: buf.slice(ci + 1) }
    }
    if (buf.length > 40) {
      const si = buf.lastIndexOf(' ', 40)
      if (si > 20) return { sentences: [buf.slice(0, si).trim()], rest: buf.slice(si + 1) }
    }
  }
  return { sentences, rest: buf.slice(last) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rich content parser
// ─────────────────────────────────────────────────────────────────────────────

type ParsedChunk =
  | { type: 'text'; value: string }
  | { type: 'todo'; items: { text: string; done: boolean }[] }
  | { type: 'list'; items: string[] }
  | { type: 'numbered'; items: string[] }

function parseContent(text: string): ParsedChunk[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const result: ParsedChunk[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^\[[ x]\]/i.test(line)) {
      const items: { text: string; done: boolean }[] = []
      while (i < lines.length && /^\[[ x]\]/i.test(lines[i])) {
        items.push({ done: /^\[x\]/i.test(lines[i]), text: lines[i].replace(/^\[[ x]\]\s*/i, '') })
        i++
      }
      result.push({ type: 'todo', items })
      continue
    }
    if (/^[-*\u2022]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*\u2022]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*\u2022]\s+/, ''))
        i++
      }
      result.push({ type: 'list', items })
      continue
    }
    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+[.)]\s+/, ''))
        i++
      }
      result.push({ type: 'numbered', items })
      continue
    }
    let block = line
    i++
    while (i < lines.length && !/^[-*\u2022\d\[]/.test(lines[i])) {
      block += ' ' + lines[i]
      i++
    }
    result.push({ type: 'text', value: block })
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme
// ─────────────────────────────────────────────────────────────────────────────

const BG: Record<Phase, string> = {
  idle:       'radial-gradient(ellipse at 50% 45%, rgba(8,16,42,0.99) 0%,  rgba(3,6,14,1)  100%)',
  listening:  'radial-gradient(ellipse at 50% 40%, rgba(8,22,60,0.99) 0%,  rgba(3,6,14,1)  100%)',
  processing: 'radial-gradient(ellipse at 50% 45%, rgba(16,6,40,0.99)  0%, rgba(4,4,18,1)  100%)',
  speaking:   'radial-gradient(ellipse at 50% 45%, rgba(3,20,16,0.99)  0%, rgba(3,9,12,1)  100%)',
}

const GLOW: Record<Phase, string> = {
  idle:       'rgba(41,194,230,0.18)',
  listening:  'rgba(41,194,230,0.6)',
  processing: 'rgba(124,58,237,0.6)',
  speaking:   'rgba(16,185,129,0.6)',
}

const RING_COLOR: Record<Phase, string> = {
  idle:       'rgba(41,194,230,0.08)',
  listening:  'rgba(41,194,230,0.5)',
  processing: 'rgba(124,58,237,0.4)',
  speaking:   'rgba(16,185,129,0.45)',
}

const ROBOT_FILTER: Record<Phase, string> = {
  idle:       'drop-shadow(0 0 10px rgba(41,194,230,0.15)) brightness(0.88)',
  listening:  'drop-shadow(0 0 28px rgba(41,194,230,0.9))  brightness(1.1)',
  processing: 'drop-shadow(0 0 28px rgba(124,58,237,0.8))  brightness(1.06)',
  speaking:   'drop-shadow(0 0 32px rgba(16,185,129,0.8))  brightness(1.1)',
}

// ─────────────────────────────────────────────────────────────────────────────
// WordHighlight — syncs rendered text to audio word-by-word
// ─────────────────────────────────────────────────────────────────────────────

function WordHighlight({ text, charIndex, charLength }: { text: string; charIndex: number; charLength: number }) {
  if (!text) return null
  const before = text.slice(0, charIndex)
  const word   = text.slice(charIndex, charIndex + charLength)
  const after  = text.slice(charIndex + charLength)
  return (
    <span>
      <span style={{ color: 'rgba(110,231,183,0.55)' }}>{before}</span>
      <motion.span
        key={charIndex}
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 1 }}
        style={{ color: '#6ee7b7', fontWeight: 700, background: 'rgba(16,185,129,0.18)', borderRadius: 3, padding: '0 2px' }}
      >
        {word}
      </motion.span>
      <span style={{ color: 'rgba(110,231,183,0.55)' }}>{after}</span>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RichMessage — todos / lists / numbered with stagger animations
// ─────────────────────────────────────────────────────────────────────────────

function RichMessage({ text, isNew }: { text: string; isNew?: boolean }) {
  const chunks = parseContent(text)
  const hasStructure = chunks.some((c) => c.type !== 'text')
  if (!hasStructure) {
    return <span>{text.slice(0, 320)}{text.length > 320 ? '\u2026' : ''}</span>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {chunks.map((chunk, ci) => {
        if (chunk.type === 'text') return <p key={ci} style={{ margin: 0, lineHeight: 1.5 }}>{chunk.value}</p>
        if (chunk.type === 'todo') return (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(16,185,129,0.5)', marginBottom: 2 }}>To-do</div>
            {chunk.items.map((item, ii) => (
              <motion.div key={ii}
                initial={isNew ? { opacity: 0, x: -8 } : { opacity: 1, x: 0 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: ii * 0.06 }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}
              >
                <span style={{ flexShrink: 0, marginTop: 1 }}>
                  {item.done
                    ? <CheckSquare style={{ width: 13, height: 13, color: '#10b981' }} />
                    : <Square style={{ width: 13, height: 13, color: 'rgba(41,194,230,0.5)' }} />}
                </span>
                <span style={{ color: item.done ? 'rgba(110,231,183,0.45)' : 'rgba(216,232,248,0.88)', textDecoration: item.done ? 'line-through' : 'none' }}>{item.text}</span>
              </motion.div>
            ))}
          </div>
        )
        if (chunk.type === 'list' || chunk.type === 'numbered') return (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {chunk.items.map((item, ii) => (
              <motion.div key={ii}
                initial={isNew ? { opacity: 0, x: -8 } : { opacity: 1, x: 0 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: ii * 0.05 }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}
              >
                {chunk.type === 'numbered'
                  ? <span style={{ flexShrink: 0, width: 18, color: 'rgba(41,194,230,0.7)', fontSize: 11, fontWeight: 700 }}>{ii + 1}.</span>
                  : <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: '50%', background: 'rgba(41,194,230,0.6)', marginTop: 6 }} />}
                <span style={{ color: 'rgba(216,232,248,0.88)', lineHeight: 1.45 }}>{item}</span>
              </motion.div>
            ))}
          </div>
        )
        return null
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DataPanel — beautiful animated panel for todos / notes / reminders
// ─────────────────────────────────────────────────────────────────────────────

interface TodoItem { id: string; text: string; completed: boolean; priority?: string }
interface NoteItem  { id: string; title?: string; content: string; updatedAt?: string }
interface ReminderItem { id: string; title: string; dueDate?: string; completed?: boolean }

interface FetchedData {
  type: 'todos' | 'notes' | 'reminders'
  todos?: TodoItem[]
  notes?: NoteItem[]
  reminders?: ReminderItem[]
}

async function fetchDataForIntent(intent: DataIntent): Promise<FetchedData | null> {
  if (!intent) return null
  try {
    if (intent === 'todos') {
      const res = await fetch('/api/todos')
      if (!res.ok) return null
      const todos = await res.json() as TodoItem[]
      return { type: 'todos', todos }
    }
    if (intent === 'notes') {
      const res = await fetch('/api/notes')
      if (!res.ok) return null
      const notes = await res.json() as NoteItem[]
      return { type: 'notes', notes: notes.slice(0, 6) }
    }
    if (intent === 'reminders') {
      const res = await fetch('/api/reminders')
      if (!res.ok) return null
      const reminders = await res.json() as ReminderItem[]
      return { type: 'reminders', reminders }
    }
    return null
  } catch { return null }
}

function DataPanel({ data, onClose }: { data: FetchedData; onClose: () => void }) {
  const accentColor = data.type === 'todos'
    ? 'rgba(41,194,230,0.8)'
    : data.type === 'reminders'
    ? 'rgba(251,191,36,0.8)'
    : 'rgba(167,139,250,0.8)'

  const borderColor = data.type === 'todos'
    ? 'rgba(41,194,230,0.2)'
    : data.type === 'reminders'
    ? 'rgba(251,191,36,0.2)'
    : 'rgba(167,139,250,0.2)'

  const Icon = data.type === 'todos' ? CheckCircle : data.type === 'reminders' ? Calendar : FileText

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.97 }}
      transition={{ type: 'spring', damping: 22, stiffness: 300 }}
      style={{
        position: 'relative', zIndex: 10,
        width: '100%', maxWidth: 480, alignSelf: 'center',
        padding: '0 16px 6px', flexShrink: 0,
      }}
    >
      <div style={{
        background: 'rgba(8,16,40,0.92)',
        border: `1px solid ${borderColor}`,
        borderRadius: 16,
        backdropFilter: 'blur(20px)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px 8px',
          borderBottom: `1px solid ${borderColor}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon style={{ width: 14, height: 14, color: accentColor, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: accentColor }}>
              {data.type === 'todos' ? 'Your To-Do List' : data.type === 'reminders' ? 'Your Reminders' : 'Recent Notes'}
            </span>
          </div>
          <button onClick={onClose} style={{ color: 'rgba(148,163,184,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <X style={{ width: 13, height: 13 }} />
          </button>
        </div>

        {/* Items */}
        <div style={{ padding: '8px 14px 12px', display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto', scrollbarWidth: 'none' }}>
          {data.type === 'todos' && data.todos && data.todos.length === 0 && (
            <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)', fontStyle: 'italic', margin: 0 }}>No tasks yet — all clear!</p>
          )}
          {data.type === 'todos' && data.todos?.map((todo, i) => (
            <motion.div key={todo.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}
            >
              <span style={{ flexShrink: 0, marginTop: 1 }}>
                {todo.completed
                  ? <CheckSquare style={{ width: 14, height: 14, color: 'rgba(16,185,129,0.7)' }} />
                  : <Square style={{ width: 14, height: 14, color: 'rgba(41,194,230,0.4)' }} />}
              </span>
              <span style={{
                fontSize: 13, lineHeight: 1.4,
                color: todo.completed ? 'rgba(148,163,184,0.4)' : 'rgba(216,232,248,0.9)',
                textDecoration: todo.completed ? 'line-through' : 'none',
              }}>
                {todo.text}
              </span>
              {todo.priority === 'high' && (
                <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: 'rgba(239,68,68,0.7)', flexShrink: 0, marginTop: 2 }}>HIGH</span>
              )}
            </motion.div>
          ))}

          {data.type === 'reminders' && data.reminders?.map((r, i) => (
            <motion.div key={r.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}
            >
              <Calendar style={{ width: 13, height: 13, color: 'rgba(251,191,36,0.6)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ margin: 0, fontSize: 13, color: 'rgba(216,232,248,0.9)', lineHeight: 1.4 }}>{r.title}</p>
                {r.dueDate && (
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: 'rgba(251,191,36,0.55)' }}>
                    {new Date(r.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </motion.div>
          ))}

          {data.type === 'notes' && data.notes?.map((note, i) => (
            <motion.div key={note.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{
                padding: '6px 10px', borderRadius: 8,
                background: 'rgba(167,139,250,0.06)',
                border: '1px solid rgba(167,139,250,0.12)',
              }}
            >
              {note.title && <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: 'rgba(167,139,250,0.8)' }}>{note.title}</p>}
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(216,232,248,0.7)', lineHeight: 1.4 }}>
                {note.content.slice(0, 120)}{note.content.length > 120 ? '\u2026' : ''}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Footer link */}
        <div style={{ borderTop: `1px solid ${borderColor}`, padding: '7px 14px', display: 'flex', justifyContent: 'flex-end' }}>
          <a
            href={`/${data.type}`}
            style={{ fontSize: 10, color: accentColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 3 }}
          >
            Open {data.type} <ChevronRight style={{ width: 10, height: 10 }} />
          </a>
        </div>
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function VoiceMode({ onTranscript, chatBusy, autoActivate, className }: VoiceModeProps) {
  const [mounted, setMounted]         = useState(false)
  const [open, setOpen]               = useState(false)
  const [phase, setPhase]             = useState<Phase>('idle')
  const [transcript, setTranscript]   = useState('')
  const [muted, setMuted]             = useState(false)
  const [micAllowed, setMicAllowed]   = useState(true)
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [tick, setTick]               = useState(0)
  const [typeInput, setTypeInput]     = useState('')
  const [log, setLog]                 = useState<Array<{ id: string; role: 'user' | 'skippy'; text: string; isNew?: boolean; usedGrok?: boolean }>>([])
  const [speakingText, setSpeakingText]   = useState('')
  const [wordBoundary, setWordBoundary]   = useState<{ charIndex: number; charLength: number } | null>(null)
  const [holding, setHolding]             = useState(false)
  const [isNeuralVoice, setIsNeuralVoice] = useState(false)
  const [fetchedData, setFetchedData]     = useState<FetchedData | null>(null)
  const [grokRouted, setGrokRouted]       = useState(false)

  // ── Refs ────────────────────────────────────────────────────────────────────

  const openRef        = useRef(false)
  const phaseRef       = useRef<Phase>('idle')
  const mutedRef       = useRef(false)
  const typingRef      = useRef(false)
  const dismissRef     = useRef(false)
  const generationRef  = useRef(0)
  const holdingRef     = useRef(false)

  const recogRef       = useRef<SpeechRecognition | null>(null)
  const utteranceRef   = useRef<SpeechSynthesisUtterance | null>(null)
  const audioNodeRef   = useRef<AudioBufferSourceNode | null>(null)
  const audioCtxRef    = useRef<AudioContext | null>(null)
  const streamRef      = useRef<MediaStream | null>(null)
  const animFrameRef   = useRef<number | null>(null)
  const loopTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wordTimersRef  = useRef<ReturnType<typeof setTimeout>[]>([])

  const onTranscriptRef  = useRef(onTranscript)
  const startRef         = useRef<() => void>(() => {})
  const processRef       = useRef<(t: string) => void>(() => {})
  const orbTapRef        = useRef<() => void>(() => {})
  const greetingRef      = useRef(makeGreeting())
  const logRef           = useRef<HTMLDivElement>(null)

  useEffect(() => { openRef.current = open }, [open])
  useEffect(() => { mutedRef.current = muted }, [muted])
  useEffect(() => { onTranscriptRef.current = onTranscript }, [onTranscript])

  const setPhaseSync = useCallback((p: Phase) => { phaseRef.current = p; setPhase(p) }, [])

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 80)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  // ── Volume analyser ──────────────────────────────────────────────────────────

  const stopVolume = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    setVolumeLevel(0)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startVolume = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      const frame = () => {
        if (phaseRef.current !== 'listening') return
        const d = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(d)
        setVolumeLevel(Math.min(1, d.reduce((a, b) => a + b, 0) / d.length / 60))
        animFrameRef.current = requestAnimationFrame(frame)
      }
      animFrameRef.current = requestAnimationFrame(frame)
    } catch { /* optional */ }
  }, [])

  // ── Clear word timers ────────────────────────────────────────────────────────

  const clearWordTimers = useCallback(() => {
    wordTimersRef.current.forEach((t) => clearTimeout(t))
    wordTimersRef.current = []
  }, [])

  // ── Neural TTS via /api/tts, Web Speech API fallback ────────────────────────
  //
  // Tries /api/tts (kokoro-js, high-quality am_puck voice) first.
  // If the API is cold/slow/unavailable, falls back to Web Speech API.
  // Word-boundary sync works for both paths.

  const speak = useCallback(
    (text: string, onEnd: () => void): void => {
      const clean = text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/#{1,6}\s/g, '')
        .replace(/\n+/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim()
        .slice(0, 600)

      if (!clean) { onEnd(); return }

      setSpeakingText(clean)
      setWordBoundary(null)
      clearWordTimers()

      // ── Neural TTS (en-US-GuyNeural via msedge-tts) — no fallback ─────────
      const doNeuralTTS = async () => {
        try {
          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: clean }),
            signal: AbortSignal.timeout(8_000),
          })
          if (!res.ok) {
            console.warn('[VoiceMode] TTS returned', res.status)
            onEnd()
            return
          }

          const arrayBuffer = await res.arrayBuffer()
          if (!arrayBuffer.byteLength) { onEnd(); return }

          const ctx = new AudioContext()
          audioCtxRef.current = ctx
          const audioBuf = await ctx.decodeAudioData(arrayBuffer)

          // Word-boundary sync: distribute words evenly across audio duration
          const words = clean.split(/\s+/)
          const totalMs = audioBuf.duration * 1000
          const msPerWord = totalMs / Math.max(words.length, 1)
          let charPos = 0
          const timers: ReturnType<typeof setTimeout>[] = []
          for (let i = 0; i < words.length; i++) {
            const ci = charPos
            const cl = words[i].length
            timers.push(setTimeout(() => setWordBoundary({ charIndex: ci, charLength: cl }), i * msPerWord))
            charPos += words[i].length + 1
          }
          wordTimersRef.current = timers

          const source = ctx.createBufferSource()
          source.buffer = audioBuf
          source.connect(ctx.destination)
          audioNodeRef.current = source

          source.onended = () => {
            clearWordTimers()
            setSpeakingText('')
            setWordBoundary(null)
            audioNodeRef.current = null
            audioCtxRef.current?.close().catch(() => {})
            audioCtxRef.current = null
            setIsNeuralVoice(false)
            onEnd()
          }
          source.start()
          setIsNeuralVoice(true)
        } catch (err) {
          console.error('[VoiceMode] TTS error:', err)
          onEnd()
        }
      }

      doNeuralTTS()
    },
    [clearWordTimers],
  )

  const stopSpeaking = useCallback(() => {
    clearWordTimers()
    // Stop neural audio
    audioNodeRef.current?.stop()
    audioNodeRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    // Stop Web Speech
    window.speechSynthesis?.cancel()
    utteranceRef.current = null
    setSpeakingText('')
    setWordBoundary(null)
    setIsNeuralVoice(false)
  }, [clearWordTimers])

  // ── Process text → AI (Grok auto-routed if live data) → streaming TTS ───────

  const processText = useCallback(
    async (text: string) => {
      if (!text.trim() || dismissRef.current || !openRef.current) return

      const gen = ++generationRef.current
      setPhaseSync('processing')
      setSpeakingText('')
      setWordBoundary(null)
      setFetchedData(null)

      // ── Detect if this query needs Grok (live/real-time data) ──────────────
      const useGrok = needsLiveData(text)
      setGrokRouted(useGrok)

      // ── Detect if we should pre-fetch user data for visual display ─────────
      const intent = detectDataIntent(text)

      // Kick off data fetch in parallel (don't await)
      if (intent) {
        fetchDataForIntent(intent).then((data) => {
          if (data && gen === generationRef.current) setFetchedData(data)
        })
      }

      let ttsBuffer = ''
      const ttsQueue: string[] = []
      let ttsActive = false
      let streamDone = false
      let anySpeech = false

      const finishUp = () => {
        if (gen !== generationRef.current) return
        setSpeakingText('')
        setWordBoundary(null)
        if (dismissRef.current || !openRef.current) return
        setPhaseSync('idle')
        chime('done')
      }

      const drive = () => {
        if (gen !== generationRef.current) return
        if (ttsActive || ttsQueue.length === 0 || mutedRef.current || !openRef.current) return
        ttsActive = true
        anySpeech = true
        const sentence = ttsQueue.shift()!
        setPhaseSync('speaking')
        speak(sentence, () => {
          ttsActive = false
          if (gen !== generationRef.current) return
          if (ttsQueue.length > 0) drive()
          else if (streamDone) finishUp()
        })
      }

      const onChunk = (chunk: string) => {
        if (gen !== generationRef.current) return
        ttsBuffer += chunk
        const { sentences, rest } = pullSentences(ttsBuffer)
        ttsBuffer = rest
        if (sentences.length > 0) { ttsQueue.push(...sentences); drive() }
      }

      setLog((prev) => [...prev, { id: 'u' + Date.now(), role: 'user', text }])

      try {
        const fullResp = await onTranscriptRef.current(text, onChunk, useGrok ? 'grok' : undefined)
        if (gen !== generationRef.current) return
        streamDone = true

        if (fullResp) {
          setLog((prev) => [...prev, {
            id: 's' + Date.now(), role: 'skippy', text: fullResp, isNew: true, usedGrok: useGrok,
          }])
          setTimeout(() => setLog((prev) => prev.map((e) => e.isNew ? { ...e, isNew: false } : e)), 2500)
        }

        const leftover = ttsBuffer.trim()
        if (leftover.length > 4) ttsQueue.push(leftover)
        ttsBuffer = ''

        if (mutedRef.current || !fullResp) {
          finishUp()
        } else if (anySpeech) {
          if (!ttsActive && ttsQueue.length === 0) finishUp()
          else if (!ttsActive && ttsQueue.length > 0) drive()
        } else {
          setPhaseSync('speaking')
          speak(fullResp, finishUp)
        }
      } catch {
        if (gen !== generationRef.current) return
        setSpeakingText('')
        setWordBoundary(null)
        setPhaseSync('idle')
        chime('error')
      }
    },
    [speak, setPhaseSync],
  )

  useEffect(() => { processRef.current = processText }, [processText])

  // ── Stop listening ───────────────────────────────────────────────────────────

  const stopListening = useCallback(() => {
    stopVolume()
    if (loopTimerRef.current) { clearTimeout(loopTimerRef.current); loopTimerRef.current = null }
    if (recogRef.current) {
      recogRef.current.onend    = null
      recogRef.current.onresult = null
      recogRef.current.onerror  = null
      try { recogRef.current.stop() } catch {}
      recogRef.current = null
    }
  }, [stopVolume])

  // ── Start listening ──────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    const SR =
      (window as unknown as Record<string, typeof SpeechRecognition>).SpeechRecognition ??
      (window as unknown as Record<string, typeof SpeechRecognition>).webkitSpeechRecognition
    if (!SR) { setMicAllowed(false); return }
    if (dismissRef.current || !openRef.current) return
    if (typingRef.current) return
    if (phaseRef.current === 'processing') return

    stopVolume()
    if (recogRef.current) {
      recogRef.current.onend    = null
      recogRef.current.onresult = null
      recogRef.current.onerror  = null
      try { recogRef.current.stop() } catch {}
      recogRef.current = null
    }

    setPhaseSync('listening')
    setTranscript('')
    chime('start')

    const r = new SR()
    r.continuous      = false
    r.interimResults  = true
    r.lang            = 'en-US'
    r.maxAlternatives = 3
    let finalText     = ''

    r.onresult = (e) => {
      let final = '', interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final  += ' ' + e.results[i][0].transcript
        else                       interim += e.results[i][0].transcript
      }
      if (final) finalText += final
      setTranscript((finalText + (interim ? ' ' + interim : '')).trim())
    }

    r.onend = () => {
      stopVolume()
      recogRef.current = null
      const text = finalText.trim()
      if (!text || !openRef.current || dismissRef.current) {
        if (openRef.current && !dismissRef.current) setPhaseSync('idle')
        setHolding(false); holdingRef.current = false
        return
      }
      setHolding(false); holdingRef.current = false
      setTranscript(text)
      processRef.current(text)
    }

    r.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed') { setMicAllowed(false); setPhaseSync('idle') }
    }

    recogRef.current = r
    navigator.mediaDevices?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((s) => { streamRef.current = s; startVolume(s) })
      .catch(() => {})
    try { r.start() } catch (err) { console.warn('SR start failed:', err) }
  }, [stopVolume, startVolume, setPhaseSync])

  useEffect(() => { startRef.current = startListening }, [startListening])

  // ── PTT ──────────────────────────────────────────────────────────────────────

  const pttRelease = useCallback(() => {
    if (!holdingRef.current) return
    setHolding(false); holdingRef.current = false
    if (recogRef.current) try { recogRef.current.stop() } catch {}
  }, [])

  const pttPress = useCallback(() => {
    if (phaseRef.current === 'speaking') { stopSpeaking(); ++generationRef.current }
    if (phaseRef.current === 'processing') return
    setHolding(true); holdingRef.current = true
    startRef.current()
  }, [stopSpeaking])

  // ── Orb tap ──────────────────────────────────────────────────────────────────

  const orbTap = useCallback(() => {
    const p = phaseRef.current
    if (p === 'idle')     { pttPress() }
    else if (p === 'listening') { pttRelease() }
    else if (p === 'speaking')  { stopSpeaking(); ++generationRef.current; setSpeakingText(''); setWordBoundary(null) }
  }, [pttPress, pttRelease, stopSpeaking])

  useEffect(() => { orbTapRef.current = orbTap }, [orbTap])

  // ── Space bar PTT ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      e.preventDefault()
      if (!holdingRef.current) pttPress()
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return; e.preventDefault(); pttRelease()
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [open, pttPress, pttRelease])

  // ── Type-to-speak ────────────────────────────────────────────────────────────

  const submitTyped = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    const text = typeInput.trim()
    if (!text || dismissRef.current) return
    stopListening(); stopSpeaking()
    ++generationRef.current
    setSpeakingText(''); setWordBoundary(null)
    setTranscript(text); setTypeInput('')
    processRef.current(text)
  }, [typeInput, stopListening, stopSpeaking])

  // ── Greeting ─────────────────────────────────────────────────────────────────

  const speakGreeting = useCallback(() => {
    if (mutedRef.current) return
    setPhaseSync('speaking')
    speak(greetingRef.current, () => {
      if (dismissRef.current || !openRef.current) return
      setPhaseSync('idle')
    })
  }, [speak, setPhaseSync])

  // ── Dismiss ──────────────────────────────────────────────────────────────────

  const dismiss = useCallback(() => {
    dismissRef.current = true
    ++generationRef.current
    stopListening(); stopSpeaking()
    setOpen(false); setPhaseSync('idle')
    setTranscript(''); setSpeakingText(''); setWordBoundary(null)
    setTypeInput(''); setLog([]); setFetchedData(null); setGrokRouted(false)
    setHolding(false); holdingRef.current = false
    setTimeout(() => { dismissRef.current = false }, 1200)
  }, [stopListening, stopSpeaking, setPhaseSync])

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    return () => {
      dismissRef.current = true; ++generationRef.current
      try { recogRef.current?.abort() } catch {}
      stopSpeaking(); stopVolume()
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current)
    }
  }, [])

  // ── Auto-activate ────────────────────────────────────────────────────────────

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!autoActivate) return
    const t = setTimeout(() => { if (!dismissRef.current) { setOpen(true); setTimeout(() => speakGreeting(), 200) } }, 700)
    return () => clearTimeout(t)
  }, [autoActivate])

  // ── Open manually ────────────────────────────────────────────────────────────

  const manualActivate = useCallback(() => {
    if (chatBusy) return
    if (open) { dismiss(); return }
    setOpen(true); speakGreeting()
  }, [chatBusy, open, dismiss, speakGreeting])

  // ── Waveform ─────────────────────────────────────────────────────────────────

  const isAnimated = phase === 'listening' || phase === 'speaking'
  const bars = Array.from({ length: 11 }, (_, i) => {
    const p = (tick * 0.4 + i * 0.72) % (Math.PI * 2)
    if (phase === 'listening') return Math.max(3, 5 + Math.sin(p) * volumeLevel * 22 + volumeLevel * 14)
    if (phase === 'speaking')  return Math.max(4, 7 + Math.sin(p) * 9 + Math.sin(p * 1.8 + i * 0.5) * 5)
    return 2
  })

  // ── Overlay JSX ──────────────────────────────────────────────────────────────

  const overlay = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="skippy-voice"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.18 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 2147483647,
            background: BG[phase],
            display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden',
          }}
        >
          {/* Dot grid */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle, rgba(41,194,230,0.05) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
            maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 72%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 72%)',
          }} />

          {/* ── Header ── */}
          <div style={{
            position: 'relative', zIndex: 10, width: '100%',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            padding: '0 20px', paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)', flexShrink: 0,
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(41,194,230,0.4)', margin: 0 }}>
                  {phase === 'listening' ? 'Listening\u2026' : phase === 'speaking' ? 'Speaking' : phase === 'processing' ? 'Thinking\u2026' : 'Voice Mode'}
                </p>
                {/* Neural voice indicator */}
                {isNeuralVoice && phase === 'speaking' && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{
                      fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em',
                      padding: '1px 5px', borderRadius: 4,
                      background: 'rgba(16,185,129,0.15)', color: 'rgba(16,185,129,0.8)', border: '1px solid rgba(16,185,129,0.25)',
                    }}
                  >Neural</motion.span>
                )}
                {/* Grok indicator */}
                {grokRouted && phase !== 'idle' && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{
                      fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em',
                      padding: '1px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3,
                      background: 'rgba(41,194,230,0.12)', color: 'rgba(41,194,230,0.8)', border: '1px solid rgba(41,194,230,0.25)',
                    }}
                  >
                    <Zap style={{ width: 8, height: 8 }} /> Live
                  </motion.span>
                )}
              </div>
              <p style={{ fontWeight: 900, fontSize: 22, color: 'rgba(216,232,248,0.92)', margin: '3px 0 0', letterSpacing: '-0.02em' }}>Skippy</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => setMuted((m) => !m)}
                title={muted ? 'Unmute' : 'Mute'}
                style={{
                  padding: 9, borderRadius: '50%', cursor: 'pointer',
                  background: muted ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${muted ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
                  color: muted ? '#fca5a5' : 'rgba(148,163,184,0.6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {muted ? <VolumeX style={{ width: 15, height: 15 }} /> : <Volume2 style={{ width: 15, height: 15 }} />}
              </button>
              <button onClick={dismiss} style={{ padding: 9, borderRadius: '50%', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(148,163,184,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X style={{ width: 15, height: 15 }} />
              </button>
            </div>
          </div>

          {/* ── Robot + rings ── */}
          <div style={{
            flex: 1, position: 'relative', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', width: '100%', gap: 14, minHeight: 0,
          }}>
            {/* Ambient glow */}
            <motion.div
              style={{ position: 'absolute', width: 230, height: 230, borderRadius: '50%', background: GLOW[phase], filter: 'blur(65px)', pointerEvents: 'none' }}
              animate={{ scale: [1, 1.2, 1], opacity: [0.65, 1, 0.65] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Pulsing rings */}
            <AnimatePresence>
              {(phase === 'listening' || phase === 'speaking') && [0, 1, 2].map((i) => (
                <motion.div key={i}
                  style={{ position: 'absolute', width: 165 + i * 44, height: 165 + i * 44, borderRadius: '50%', border: `1.5px solid ${RING_COLOR[phase]}`, pointerEvents: 'none' }}
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: phase === 'listening' ? [1, 1 + volumeLevel * 0.2 + 0.07 + i * 0.05, 1] : [1, 1.09 + i * 0.05, 1], opacity: [0.18, 0.48, 0.18] }}
                  exit={{ scale: 0.7, opacity: 0, transition: { duration: 0.22 } }}
                  transition={{ duration: 1.8 + i * 0.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
                />
              ))}
            </AnimatePresence>

            {/* Skippy robot */}
            <motion.div
              onClick={() => orbTapRef.current()}
              style={{ position: 'relative', zIndex: 10, width: 148, height: 148, flexShrink: 0, cursor: 'pointer' }}
              animate={
                phase === 'speaking'   ? { y: [0, -8, 2, -5, 0] }
                : phase === 'listening'  ? { scale: [1, 1 + volumeLevel * 0.06 + 0.04, 1] }
                : phase === 'processing' ? { scale: [1, 1.04, 1], rotate: [0, -3, 3, -3, 0] }
                : { y: [0, -5, 0] }
              }
              transition={
                phase === 'speaking'   ? { duration: 0.48, repeat: Infinity, ease: 'easeInOut' }
                : phase === 'listening'  ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
                : phase === 'processing' ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 3.0, repeat: Infinity, ease: 'easeInOut' }
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/img/skippyENHANCED3D-removebg.png"
                alt="Skippy"
                draggable={false}
                style={{ width: 148, height: 148, objectFit: 'contain', userSelect: 'none', display: 'block', filter: ROBOT_FILTER[phase], transition: 'filter 0.35s ease' }}
              />
            </motion.div>

            {/* Waveform */}
            <AnimatePresence>
              {isAnimated && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                  style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 44, zIndex: 10, flexShrink: 0 }}
                >
                  {bars.map((h, idx) => (
                    <div key={idx} style={{
                      width: 4, height: Math.max(4, h), borderRadius: 9999, alignSelf: 'flex-end',
                      background: phase === 'listening' ? `rgba(41,194,230,${0.5 + volumeLevel * 0.5})` : 'rgba(16,185,129,0.85)',
                      transition: 'height 80ms ease',
                    }} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Status label */}
            <AnimatePresence mode="wait">
              <motion.div key={phase}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }} style={{ textAlign: 'center', pointerEvents: 'none', zIndex: 10, flexShrink: 0 }}
              >
                <p style={{ fontSize: 18, fontWeight: 800, color: 'rgba(216,232,248,0.88)', margin: 0, letterSpacing: '-0.01em' }}>
                  {phase === 'idle'      ? 'Hold to speak'
                  : phase === 'listening'  ? "I'm listening\u2026"
                  : phase === 'processing' ? 'Thinking\u2026'
                  :                          'Skippy'}
                </p>
                <p style={{ fontSize: 11, color: 'rgba(148,163,184,0.45)', margin: '5px 0 0' }}>
                  {phase === 'idle'      ? 'Hold mic \u00b7 Space \u00b7 or type below'
                  : phase === 'listening'  ? 'Release to send \u00b7 or type \u2192 Enter'
                  : phase === 'processing' ? grokRouted ? '\u26a1 Fetching live data via Grok\u2026' : 'Working on it\u2026'
                  :                          'Hold mic or Space to interrupt'}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Live word-by-word text display ── */}
          <AnimatePresence>
            {speakingText && (
              <motion.div key="speaking-text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 480, padding: '0 16px 6px', flexShrink: 0 }}
              >
                <div style={{ padding: '10px 16px', borderRadius: '14px 14px 14px 4px', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)', backdropFilter: 'blur(14px)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <motion.span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', flexShrink: 0, display: 'block' }}
                      animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }} transition={{ duration: 0.8, repeat: Infinity }}
                    />
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(16,185,129,0.6)' }}>Skippy</span>
                    {isNeuralVoice && <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(16,185,129,0.4)' }}>\u2022 Neural</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
                    {wordBoundary
                      ? <WordHighlight text={speakingText} charIndex={wordBoundary.charIndex} charLength={wordBoundary.charLength} />
                      : <span style={{ color: 'rgba(110,231,183,0.7)' }}>{speakingText}</span>}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Live transcript ── */}
          <AnimatePresence>
            {phase === 'listening' && transcript && (
              <motion.div key="live-tr" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 480, padding: '0 16px 6px', flexShrink: 0 }}
              >
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ maxWidth: '86%', padding: '8px 14px', borderRadius: '14px 14px 4px 14px', fontSize: 14, lineHeight: 1.5, color: 'rgba(41,194,230,0.85)', background: 'rgba(12,28,70,0.6)', border: '1px dashed rgba(41,194,230,0.3)', backdropFilter: 'blur(12px)' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 4, color: 'rgba(41,194,230,0.45)' }}>You</div>
                    {transcript}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Data panel for fetched todos/notes/reminders ── */}
          <AnimatePresence>
            {fetchedData && (
              <DataPanel key="data-panel" data={fetchedData} onClose={() => setFetchedData(null)} />
            )}
          </AnimatePresence>

          {/* ── Conversation log ── */}
          <div ref={logRef} style={{
            position: 'relative', zIndex: 10, width: '100%', maxWidth: 480,
            padding: '0 16px 4px', maxHeight: 180, minHeight: 0, overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, scrollbarWidth: 'none',
          }}>
            <AnimatePresence mode="popLayout" initial={false}>
              {log.map((entry) => (
                <motion.div key={entry.id}
                  initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.22 }}
                  style={{ display: 'flex', justifyContent: entry.role === 'user' ? 'flex-end' : 'flex-start' }}
                >
                  <div style={{
                    maxWidth: entry.role === 'skippy' ? '92%' : '84%',
                    padding: '8px 13px',
                    borderRadius: entry.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    fontSize: 13, lineHeight: 1.5, color: 'rgba(216,232,248,0.9)',
                    background: entry.role === 'user' ? 'rgba(12,28,70,0.85)' : 'rgba(4,22,18,0.85)',
                    border: entry.role === 'user' ? '1px solid rgba(41,194,230,0.18)' : '1px solid rgba(16,185,129,0.18)',
                    backdropFilter: 'blur(12px)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 4, color: entry.role === 'user' ? 'rgba(41,194,230,0.5)' : 'rgba(16,185,129,0.55)' }}>
                      {entry.role === 'user' ? 'You' : 'Skippy'}
                      {entry.usedGrok && <span style={{ color: 'rgba(41,194,230,0.4)', display: 'flex', alignItems: 'center', gap: 2 }}><Zap style={{ width: 8, height: 8 }} />live</span>}
                    </div>
                    {entry.role === 'skippy'
                      ? <RichMessage text={entry.text} isNew={entry.isNew} />
                      : <span>{entry.text.slice(0, 200)}{entry.text.length > 200 ? '\u2026' : ''}</span>}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* ── Type-to-speak ── */}
          <form onSubmit={submitTyped} style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 460, padding: '0 20px 10px', flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={typeInput}
              onChange={(e) => setTypeInput(e.target.value)}
              onFocus={() => { typingRef.current = true; stopListening() }}
              onBlur={() => { typingRef.current = false }}
              placeholder="Type to Skippy\u2026"
              disabled={phase === 'processing'}
              style={{ flex: 1, padding: '10px 16px', borderRadius: 9999, fontSize: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.11)', color: 'rgba(216,232,248,0.9)', outline: 'none', WebkitAppearance: 'none', appearance: 'none' as never }}
            />
            <button type="submit" disabled={!typeInput.trim() || phase === 'processing'}
              style={{ padding: 10, borderRadius: '50%', flexShrink: 0, cursor: typeInput.trim() ? 'pointer' : 'default', background: typeInput.trim() ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${typeInput.trim() ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.08)'}`, color: typeInput.trim() ? '#6ee7b7' : 'rgba(148,163,184,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.18s' }}
            >
              <Send style={{ width: 16, height: 16 }} />
            </button>
          </form>

          {/* ── PTT mic button ── */}
          <div style={{
            position: 'relative', zIndex: 10, width: '100%', flexShrink: 0,
            padding: '8px 20px', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 22px)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            {phase === 'processing' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: grokRouted ? 'rgba(41,194,230,0.8)' : 'rgba(167,139,250,0.8)', fontSize: 13, padding: '10px 0' }}>
                <Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} />
                {grokRouted ? <><Zap style={{ width: 12, height: 12 }} /> Getting live data&hellip;</> : 'Thinking&hellip;'}
              </div>
            ) : (
              <motion.button
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pttPress() }}
                onPointerUp={() => pttRelease()}
                onPointerCancel={() => pttRelease()}
                whileTap={{ scale: 0.93 }}
                style={{
                  width: 64, height: 64, borderRadius: '50%', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${phase === 'listening' ? 'rgba(41,194,230,0.9)' : phase === 'speaking' ? 'rgba(16,185,129,0.6)' : 'rgba(41,194,230,0.35)'}`,
                  background: phase === 'listening' ? 'rgba(41,194,230,0.18)' : phase === 'speaking' ? 'rgba(16,185,129,0.1)' : 'rgba(41,194,230,0.07)',
                  boxShadow: phase === 'listening' ? `0 0 ${18 + volumeLevel * 28}px rgba(41,194,230,${0.4 + volumeLevel * 0.5})` : phase === 'speaking' ? '0 0 16px rgba(16,185,129,0.35)' : 'none',
                  transition: 'background 0.2s, border-color 0.2s', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none',
                }}
              >
                {phase === 'listening'
                  ? <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>
                      <Mic style={{ width: 26, height: 26, color: 'rgba(41,194,230,0.95)' }} />
                    </motion.span>
                  : <Mic style={{ width: 22, height: 22, color: phase === 'speaking' ? 'rgba(16,185,129,0.5)' : 'rgba(41,194,230,0.55)' }} />}
              </motion.button>
            )}
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.13em', color: phase === 'listening' ? 'rgba(41,194,230,0.7)' : 'rgba(148,163,184,0.3)', margin: 0 }}>
              {phase === 'listening' ? 'Release to send' : phase === 'speaking' ? 'Hold to interrupt' : 'Hold to speak'}
            </p>
            {!micAllowed && (
              <p style={{ fontSize: 11, color: 'rgba(239,68,68,0.75)', textAlign: 'center', margin: 0 }}>
                Microphone blocked &mdash; allow in browser settings.
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // ── Trigger button ────────────────────────────────────────────────────────────

  return (
    <>
      <button
        onClick={manualActivate}
        disabled={!!chatBusy}
        title={open ? 'Exit Voice Mode' : 'Enter Voice Mode'}
        className={cn(
          'relative flex items-center gap-1.5 px-3 py-2 rounded-full transition-all duration-200 group border',
          chatBusy ? 'opacity-30 cursor-not-allowed border-border'
          : open ? 'border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/15 active:scale-95 cursor-pointer'
          : 'border-accent/35 bg-accent/5 hover:border-accent/70 hover:bg-accent/10 active:scale-95 cursor-pointer',
          className,
        )}
        style={phase === 'listening' && open ? {
          boxShadow: `0 0 ${10 + volumeLevel * 18}px rgba(41,194,230,${0.3 + volumeLevel * 0.45})`,
          borderColor: `rgba(41,194,230,${0.5 + volumeLevel * 0.35})`,
        } : {}}
      >
        {phase === 'processing' && open ? <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin flex-shrink-0" />
        : phase === 'speaking' && open    ? <Volume2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
        : phase === 'listening' && open   ? <Mic className="w-3.5 h-3.5 text-accent animate-pulse flex-shrink-0" />
        : <Mic className="w-3.5 h-3.5 text-muted group-hover:text-accent transition-colors flex-shrink-0" />}
        <span className={cn(
          'text-xs font-semibold transition-colors',
          open && phase === 'speaking'   ? 'text-emerald-400'
          : open && phase === 'listening'  ? 'text-accent'
          : open && phase === 'processing' ? 'text-purple-400'
          : open ? 'text-emerald-300/80'
          : 'text-muted/70 group-hover:text-accent',
        )}>
          {open ? (phase === 'listening' ? 'Listening' : phase === 'processing' ? 'Thinking' : phase === 'speaking' ? 'Speaking' : 'Ready') : 'Listen'}
        </span>
        {log.filter((e) => e.role === 'user').length > 0 && open && (
          <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1, padding: '1px 5px', borderRadius: 9999, background: 'rgba(16,185,129,0.2)', color: 'rgba(110,231,183,0.8)', border: '1px solid rgba(16,185,129,0.3)' }}>
            {log.filter((e) => e.role === 'user').length}
          </span>
        )}
      </button>

      {mounted && createPortal(overlay, document.body)}
    </>
  )
}
