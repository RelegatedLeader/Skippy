'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Swords, Bot, User, Trophy, Flag, Save, ArrowLeft,
  ChevronRight, Loader2, CheckCircle, AlertTriangle, Equal, Cpu, Menu,
  FlameKindling, Brain, TrendingDown, TrendingUp, Minus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sidebar } from '@/components/layout/Sidebar'
import { useSidebar } from '@/components/layout/SidebarContext'

interface DebateRound {
  id: string; roundNumber: number; userArgument: string; aiRebuttal: string; userScore: number; aiScore: number; usedModel?: string; emotionalBias?: 'none' | 'mild' | 'strong'
}
interface Debate {
  id: string; topic: string; userStance: string; aiStance: string
  status: 'active' | 'concluded'; winner?: 'user' | 'ai' | 'draw'
  conclusion?: string; noteId?: string; model?: string; rounds: DebateRound[]
}

const MAX_ROUNDS = 6

// Phase label based on round number
function getPhase(roundNumber: number): { label: string; color: string } {
  if (roundNumber <= 1) return { label: 'Opening', color: '#29c2e6' }
  if (roundNumber <= 3) return { label: 'Cross-Examination', color: '#e8b84b' }
  if (roundNumber <= 5) return { label: 'Rebuttal', color: '#f97316' }
  return { label: 'Final Round', color: '#ef4444' }
}

function parseEmotionalBias(raw: string): 'none' | 'mild' | 'strong' {
  const m = raw.match(/EMOTIONAL_BIAS:\s*(none|mild|strong)/i)
  return (m?.[1]?.toLowerCase() as 'none' | 'mild' | 'strong') || 'none'
}

export default function DebateSessionPage() {
  const { id } = useParams<{ id: string }>()
  const { toggle } = useSidebar()
  const router = useRouter()
  const [debate, setDebate] = useState<Debate | null>(null)
  const [loading, setLoading] = useState(true)
  const [argument, setArgument] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [streamingRebuttal, setStreamingRebuttal] = useState('')
  const [lastBias, setLastBias] = useState<'none' | 'mild' | 'strong'>('none')
  const [concluding, setConcluding] = useState(false)
  const [showConclusion, setShowConclusion] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const fetchDebate = useCallback(async () => {
    try {
      const res = await fetch(`/api/debates/${id}`)
      if (res.ok) {
        const d: Debate = await res.json()
        setDebate(d)
        if (d.status === 'concluded') setShowConclusion(true)
      }
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { fetchDebate() }, [fetchDebate])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [debate?.rounds, streamingRebuttal])

  // Current confidence scores
  const lastRound = debate?.rounds[debate.rounds.length - 1]
  const currentUserScore = lastRound?.userScore ?? 50
  const currentAiScore = lastRound?.aiScore ?? 50
  const userLeads = currentUserScore > currentAiScore
  const tied = currentUserScore === currentAiScore

  const submitArgument = useCallback(async () => {
    if (!argument.trim() || submitting || !debate || debate.status === 'concluded') return
    setSubmitting(true)
    setStreamingRebuttal('')
    const arg = argument.trim()
    setArgument('')

    try {
      const res = await fetch(`/api/debates/${id}/round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userArgument: arg }),
      })
      if (!res.ok || !res.body) throw new Error('Failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let raw = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        raw += decoder.decode(value, { stream: true })
        // Show only the REBUTTAL part while streaming
        const rebMatch = raw.match(/REBUTTAL:\s*([\s\S]*?)(?=USER_SCORE:|AI_SCORE:|EMOTIONAL_BIAS:|$)/)
        if (rebMatch) setStreamingRebuttal(rebMatch[1].trim())
        else setStreamingRebuttal(raw)
      }

      // Parse emotional bias from completed response
      setLastBias(parseEmotionalBias(raw))

      setStreamingRebuttal('')
      await fetchDebate()

      // Auto-conclude if max rounds reached
      if ((debate.rounds.length + 1) >= MAX_ROUNDS) {
        await conclude()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
      inputRef.current?.focus()
    }
  }, [argument, submitting, debate, id, fetchDebate]) // eslint-disable-line

  const conclude = useCallback(async (concededBy?: 'user' | 'ai', saveAsNote = true) => {
    if (!debate || concluding) return
    setConcluding(true)
    try {
      const res = await fetch(`/api/debates/${id}/conclude`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concededBy, saveAsNote }),
      })
      if (res.ok) {
        await fetchDebate()
        setShowConclusion(true)
      }
    } finally { setConcluding(false) }
  }, [debate, id, concluding, fetchDebate])

  if (loading) return (
    <div className="h-[calc(100dvh-3.5rem)] md:h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center gap-3 text-muted">
        <Bot className="w-5 h-5 text-accent animate-pulse" strokeWidth={1.5} />
        <span className="text-sm">Loading debate…</span>
      </div>
    </div>
  )

  if (!debate) return (
    <div className="h-[calc(100dvh-3.5rem)] md:h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-muted text-sm">Debate not found.</div>
    </div>
  )

  if (showConclusion && debate.status === 'concluded') {
    return <ConclusionScreen debate={debate} onViewNote={() => router.push(`/notes/${debate.noteId}`)} onBack={() => router.push('/debate')} />
  }

  const roundsLeft = MAX_ROUNDS - debate.rounds.length
  const isLastRound = debate.rounds.length >= MAX_ROUNDS - 1
  const devilsAdvocate = debate.model?.endsWith('-da') ?? false
  const currentPhase = getPhase(debate.rounds.length + 1)

  // Phases list
  const PHASES = [
    { label: 'Opening', rounds: [1], color: '#29c2e6' },
    { label: 'Cross-Ex', rounds: [2, 3], color: '#e8b84b' },
    { label: 'Rebuttal', rounds: [4, 5], color: '#f97316' },
    { label: 'Final', rounds: [6], color: '#ef4444' },
  ]

  return (
    <div className="h-[calc(100dvh-3.5rem)] md:h-screen flex bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Header ── */}
        <div className="flex-shrink-0 border-b border-border bg-background/90 backdrop-blur-md px-3 md:px-6 py-3">
          <div className="flex items-center gap-2 md:gap-4">
            <button onClick={toggle} className="md:hidden p-2 rounded-xl text-muted active:bg-surface" aria-label="Open menu"><Menu className="w-5 h-5" /></button>
            <button onClick={() => router.push('/debate')}
              className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Swords className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                <p className="text-sm font-bold text-foreground truncate">{debate.topic}</p>
                <span className={cn('flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
                  debate.status === 'active' ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-muted/60'
                )}>
                  {debate.status === 'active' ? '● Active' : '✓ Done'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-muted/50">
                  Round {debate.rounds.length}/{MAX_ROUNDS} · {roundsLeft > 0 ? `${roundsLeft} left` : 'Final round'}
                </p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${currentPhase.color}18`, color: currentPhase.color, border: `1px solid ${currentPhase.color}30` }}>
                  {currentPhase.label}
                </span>
                {devilsAdvocate && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-400 flex items-center gap-1">
                    <FlameKindling className="w-2.5 h-2.5" />DA
                  </span>
                )}
                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border"
                  style={debate.model === 'claude'
                    ? { background: 'rgba(139,92,246,0.1)', borderColor: 'rgba(139,92,246,0.3)', color: '#8b5cf6' }
                    : debate.model === 'auto'
                    ? { background: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.3)', color: '#a855f7' }
                    : { background: 'rgba(41,194,230,0.1)', borderColor: 'rgba(41,194,230,0.3)', color: '#29c2e6' }
                  }>
                  <Cpu className="w-2.5 h-2.5" />
                  {debate.model === 'claude' ? 'Claude' : debate.model === 'auto' ? 'Auto · Best of Both' : 'Grok'}
                </span>
              </div>
            </div>

            {debate.status === 'active' && (
              <div className="flex items-center gap-2">
                <button onClick={() => conclude('ai', true)}
                  disabled={concluding}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                  <CheckCircle className="w-3.5 h-3.5" />
                  I concede
                </button>
                <button
                  onClick={() => conclude(undefined, true)}
                  disabled={concluding || debate.rounds.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface border border-border text-muted hover:text-foreground hover:border-accent/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  <Flag className="w-3.5 h-3.5" />
                  End debate
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Confidence meter ── */}
        <div className="flex-shrink-0 px-6 py-3 bg-surface/50 border-b border-border">
          <div className="flex items-center gap-3 max-w-4xl mx-auto">
            {/* User label */}
            <div className="flex items-center gap-1.5 w-16 sm:w-28 justify-end">
              <User className="w-3.5 h-3.5 text-navy-bright" />
              <span className={cn('text-xs font-black tabular-nums', userLeads ? 'text-navy-bright' : 'text-muted/60')}>
                {currentUserScore}%
              </span>
            </div>

            {/* Bar */}
            <div className="flex-1 relative h-3 bg-surface-3 rounded-full overflow-hidden border border-border">
              {/* User fill (from left) */}
              <motion.div
                initial={false}
                animate={{ width: `${currentUserScore}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="absolute left-0 top-0 bottom-0 rounded-l-full"
                style={{ background: 'linear-gradient(90deg, #1a3050, #2d6ae0)' }}
              />
              {/* AI fill (from right) */}
              <motion.div
                initial={false}
                animate={{ width: `${currentAiScore}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="absolute right-0 top-0 bottom-0 rounded-r-full"
                style={{ background: 'linear-gradient(270deg, #e8b84b, #d4a028)' }}
              />
              {/* Center line */}
              <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-background/60 z-10" />
            </div>

            {/* AI label */}
            <div className="flex items-center gap-1.5 w-16 sm:w-28">
              <span className={cn('text-xs font-black tabular-nums', !userLeads && !tied ? 'text-accent' : 'text-muted/60')}>
                {currentAiScore}%
              </span>
              <Bot className="w-3.5 h-3.5 text-accent" strokeWidth={1.5} />
            </div>
          </div>

          {/* Topic label */}
          <p className="text-center text-[10px] text-muted/40 mt-2 truncate max-w-4xl mx-auto italic">&ldquo;{debate.topic}&rdquo;</p>

          {/* Phases progress */}
          <div className="flex items-center gap-1 mt-3 max-w-4xl mx-auto">
            {PHASES.map((phase, i) => {
              const completed = phase.rounds.every(r => r <= debate.rounds.length)
              const active = phase.rounds.includes(debate.rounds.length + 1) && debate.status === 'active'
              return (
                <div key={phase.label} className="flex-1 flex flex-col items-center gap-1">
                  <div className={cn('w-full h-1 rounded-full transition-all', completed || active ? '' : 'opacity-25')}
                    style={{ backgroundColor: completed || active ? phase.color : '#1e3a6e' }} />
                  <span className={cn('text-[9px] font-bold transition-all', active ? '' : completed ? 'opacity-60' : 'opacity-25')}
                    style={{ color: phase.color }}>
                    {phase.label}
                    {active && <span className="ml-0.5 inline-block w-1 h-1 rounded-full align-middle bg-current animate-blink" />}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Emotional bias warning */}
          <AnimatePresence>
            {lastBias !== 'none' && debate.status === 'active' && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={cn('flex items-center gap-2 mt-2 px-3 py-1.5 rounded-xl text-[11px] font-medium max-w-4xl mx-auto',
                  lastBias === 'strong' ? 'bg-red-500/10 border border-red-500/20 text-red-300' : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                )}>
                <Brain className="w-3.5 h-3.5 flex-shrink-0" />
                {lastBias === 'strong'
                  ? 'Strong emotional bias detected in your last argument — try to anchor with evidence.'
                  : 'Mild emotional bias detected — your argument has emotional weight but could use more logic.'}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Devil's Advocate mode banner */}
          {devilsAdvocate && debate.rounds.length === 0 && (
            <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-xl text-[11px] font-medium border border-orange-500/20 bg-orange-500/8 text-orange-300/80 max-w-4xl mx-auto">
              <FlameKindling className="w-3.5 h-3.5 flex-shrink-0 text-orange-400" />
              Devil&apos;s Advocate mode — Skippy agrees with your goal but will dissect every flaw in your reasoning.
            </div>
          )}
        </div>

        {/* ── Arena ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 py-4">
            {/* Column headers — only visible on sm+ where the two-column layout applies */}
            <div className="hidden sm:grid grid-cols-2 gap-4 mb-3">
              <div className="flex items-center gap-2 px-2">
                <div className="w-6 h-6 rounded-lg bg-navy-light border border-navy-bright/30 flex items-center justify-center">
                  <User className="w-3 h-3 text-navy-bright" />
                </div>
                <span className="text-[10px] font-bold text-navy-bright/70 uppercase tracking-widest">Your Arguments</span>
              </div>
              <div className="flex items-center gap-2 px-2">
                <div className="w-6 h-6 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center">
                  <Bot className="w-3 h-3 text-accent" strokeWidth={1.5} />
                </div>
                <span className="text-[10px] font-bold text-accent/70 uppercase tracking-widest">Skippy&apos;s Rebuttals</span>
              </div>
            </div>

            {/* Opening statements — shown before any rounds */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5"
            >
              {/* User opening */}
              <div className="rounded-2xl rounded-tl-sm p-4 border border-navy-bright/20 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #0b1828, #0f2035)', color: '#d8e8f8' }}
              >
                <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-full"
                  style={{ background: 'linear-gradient(90deg, #1a3050, #2d6ae0)' }} />
                <div className="text-[10px] font-bold text-navy-bright/50 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <User className="w-3 h-3" />Your Opening Position
                </div>
                <p className="text-sm leading-relaxed">{debate.userStance}</p>
              </div>

              {/* Skippy opening */}
              <div className="rounded-2xl rounded-tr-sm p-4 bg-surface border border-accent/20 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-full"
                  style={{ background: 'linear-gradient(90deg, #d4a028, #e8b84b)' }} />
                <div className="text-[10px] font-bold text-accent/50 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Bot className="w-3 h-3" strokeWidth={1.5} />Skippy&apos;s Opening Position
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed">{debate.aiStance}</p>
              </div>
            </motion.div>

            {debate.rounds.length > 0 && (
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted/40 uppercase tracking-widest font-bold">Debate begins</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            {/* Rounds */}
            <AnimatePresence mode="popLayout">
              {debate.rounds.map((round) => (
                <RoundRow key={round.id} round={round} />
              ))}
            </AnimatePresence>

            {/* Streaming round */}
            {submitting && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                {/* User arg placeholder */}
                <div className="rounded-2xl rounded-tl-sm p-4 bg-navy-light/80 border border-navy-bright/20 text-xs text-foreground/80 italic">
                  Argument submitted…
                </div>
                {/* Streaming rebuttal */}
                <div className="rounded-2xl rounded-tr-sm p-4 bg-surface border border-accent/20 text-xs text-foreground/90 leading-relaxed min-h-[60px] relative">
                  {streamingRebuttal
                    ? <><span>{streamingRebuttal}</span><span className="inline-block w-0.5 h-3.5 bg-accent animate-blink ml-0.5 align-middle" /></>
                    : <div className="flex items-center gap-1.5 text-accent"><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></div>
                  }
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent border border-background animate-blink" />
                </div>
              </motion.div>
            )}

            {/* Last round warning */}
            {isLastRound && debate.status === 'active' && !submitting && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-accent/8 border border-accent/20 text-xs text-accent/80 mb-3">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Final round — make your strongest argument.
              </motion.div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* ── Input ── */}
        {debate.status === 'active' && (
          <div className="flex-shrink-0 border-t border-border bg-background/70 backdrop-blur-sm px-4 py-3">
            <div className="max-w-5xl mx-auto flex items-end gap-3 pr-16">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={argument}
                  onChange={(e) => setArgument(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitArgument() } }}
                  placeholder="Make your argument… be specific and direct. (Enter to submit)"
                  disabled={submitting}
                  rows={2}
                  className="w-full px-4 py-3 bg-surface border border-border rounded-2xl text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent/40 focus:shadow-[0_0_0_3px_rgba(232,184,75,0.07)] transition-all resize-none disabled:opacity-50"
                  style={{ maxHeight: '120px' }}
                />
              </div>
              <motion.button
                whileHover={!submitting && argument.trim() ? { scale: 1.05 } : {}}
                whileTap={!submitting && argument.trim() ? { scale: 0.95 } : {}}
                onClick={submitArgument}
                disabled={submitting || !argument.trim()}
                className={cn(
                  'flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition-all',
                  argument.trim() && !submitting ? 'btn-gold relative' : 'bg-surface border border-border text-muted/30 cursor-not-allowed'
                )}
              >
                {submitting
                  ? <Loader2 className="w-4 h-4 animate-spin relative z-10" />
                  : <><ChevronRight className="w-4 h-4 relative z-10" /><span className="relative z-10">Argue</span></>
                }
              </motion.button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RoundRow({ round }: { round: DebateRound }) {
  const modelColor = round.usedModel === 'claude' ? '#8b5cf6' : '#29c2e6'
  const modelLabel = round.usedModel === 'claude' ? 'Claude' : round.usedModel === 'grok' ? 'Grok' : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3"
    >
      {/* User argument */}
      <div className="rounded-2xl rounded-tl-sm p-4 border border-navy-bright/20 text-sm leading-relaxed relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0b1828, #0f2035)', color: '#d8e8f8' }}
      >
        <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-full"
          style={{ background: 'linear-gradient(90deg, #1a3050, #2d6ae0)' }} />
        <div className="text-[10px] font-bold text-navy-bright/50 uppercase tracking-wider mb-2">Round {round.roundNumber}</div>
        <p>{round.userArgument}</p>
      </div>

      {/* AI rebuttal */}
      <div className="rounded-2xl rounded-tr-sm p-4 bg-surface border border-accent/20 text-sm leading-relaxed relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-full"
          style={{ background: 'linear-gradient(90deg, #d4a028, #e8b84b)' }} />
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-accent/50 uppercase tracking-wider">Skippy · R{round.roundNumber}</span>
          {modelLabel && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: `${modelColor}12`, color: modelColor, border: `1px solid ${modelColor}30` }}>
              via {modelLabel}
            </span>
          )}
        </div>
        <p className="text-foreground/90">{round.aiRebuttal}</p>
        {/* Score delta */}
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
          <span className="text-[10px] text-muted/40">Confidence:</span>
          <span className="text-[10px] font-bold text-navy-bright/70">You {round.userScore}%</span>
          <span className="text-[10px] text-muted/30">·</span>
          <span className="text-[10px] font-bold text-accent/70">Skippy {round.aiScore}%</span>
        </div>
      </div>
    </motion.div>
  )
}

function ConclusionScreen({ debate, onViewNote, onBack }: { debate: Debate; onViewNote: () => void; onBack: () => void }) {
  const WinIcon = debate.winner === 'user' ? Trophy : debate.winner === 'ai' ? Bot : Equal
  const winColor = debate.winner === 'user' ? '#10b981' : debate.winner === 'ai' ? '#e8b84b' : '#64748b'
  const winLabel = debate.winner === 'user' ? 'You won the debate!' : debate.winner === 'ai' ? 'Skippy wins this one.' : 'It\'s a draw.'
  const devilsAdvocate = debate.model?.endsWith('-da') ?? false

  const totalRounds = debate.rounds.length
  const avgUserScore = totalRounds > 0 ? Math.round(debate.rounds.reduce((s, r) => s + r.userScore, 0) / totalRounds) : 50
  const avgAiScore = totalRounds > 0 ? Math.round(debate.rounds.reduce((s, r) => s + r.aiScore, 0) / totalRounds) : 50

  // Find strongest round for each side
  const strongestUser = debate.rounds.reduce((best, r) => r.userScore > (best?.userScore ?? -1) ? r : best, debate.rounds[0])
  const strongestAi   = debate.rounds.reduce((best, r) => r.aiScore   > (best?.aiScore   ?? -1) ? r : best, debate.rounds[0])

  // Confidence: based on winner's avg score
  const confidenceScore = debate.winner === 'user' ? avgUserScore : debate.winner === 'ai' ? avgAiScore : 50
  const confidenceLabel = confidenceScore >= 70 ? 'High' : confidenceScore >= 55 ? 'Moderate' : 'Narrow'
  const confidenceColor = confidenceScore >= 70 ? '#10b981' : confidenceScore >= 55 ? '#e8b84b' : '#64748b'

  return (
    <div className="h-[calc(100dvh-3.5rem)] md:h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="fixed inset-0 pointer-events-none circuit-grid opacity-15" />
        <div className="max-w-2xl mx-auto px-4 md:px-8 py-10 relative z-10 space-y-6">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            {/* Winner badge */}
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center border-2 shadow-glow-gold animate-pulse-gold mb-4"
                style={{ backgroundColor: `${winColor}12`, borderColor: `${winColor}40` }}>
                <WinIcon className="w-10 h-10" style={{ color: winColor }} strokeWidth={1.5} />
              </div>
              <h2 className="font-display text-3xl font-black text-foreground tracking-tight mb-1">{winLabel}</h2>
              <p className="text-muted/50 text-xs uppercase tracking-widest">{debate.topic}</p>
              {devilsAdvocate && (
                <span className="mt-2 text-[10px] font-bold px-3 py-1 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-400 flex items-center gap-1.5">
                  <FlameKindling className="w-3 h-3" />Devil&apos;s Advocate Session
                </span>
              )}
            </div>

            {/* ── Decision Summary Card ── */}
            <div className="glass-gold rounded-2xl border border-accent/20 overflow-hidden mb-4">
              {/* Header */}
              <div className="px-5 py-3 border-b border-accent/15 flex items-center gap-2">
                <Brain className="w-4 h-4 text-accent" />
                <span className="text-xs font-bold text-accent uppercase tracking-wider">Decision Summary</span>
                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${confidenceColor}15`, color: confidenceColor, border: `1px solid ${confidenceColor}30` }}>
                  {confidenceLabel} Confidence
                </span>
              </div>

              <div className="p-5 space-y-4">
                {/* Score row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 rounded-xl bg-background/40 border border-navy-bright/20">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <User className="w-3 h-3 text-navy-bright/60" />
                      <span className="text-[10px] text-muted/50">You</span>
                    </div>
                    <div className="text-2xl font-black text-navy-bright">{avgUserScore}%</div>
                    <div className="text-[10px] text-muted/40">avg confidence</div>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-background/40 border border-accent/20">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Bot className="w-3 h-3 text-accent/60" strokeWidth={1.5} />
                      <span className="text-[10px] text-muted/50">Skippy</span>
                    </div>
                    <div className="text-2xl font-black text-accent">{avgAiScore}%</div>
                    <div className="text-[10px] text-muted/40">avg confidence</div>
                  </div>
                </div>

                {/* Skippy's verdict */}
                <div>
                  <p className="text-[10px] font-bold text-accent/70 uppercase tracking-wider mb-1.5">Skippy&apos;s Verdict</p>
                  <p className="text-sm text-foreground/90 leading-relaxed">{debate.conclusion}</p>
                </div>

                {/* Strongest arguments */}
                {totalRounds > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {strongestUser && (
                      <div className="p-3 rounded-xl border border-navy-bright/20 bg-navy-light/30">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <TrendingUp className="w-3 h-3 text-navy-bright/60" />
                          <span className="text-[10px] font-bold text-navy-bright/60 uppercase tracking-wider">Your Best Round</span>
                          <span className="ml-auto text-[10px] font-black text-navy-bright">R{strongestUser.roundNumber}</span>
                        </div>
                        <p className="text-[11px] text-foreground/70 leading-relaxed line-clamp-2">{strongestUser.userArgument}</p>
                      </div>
                    )}
                    {strongestAi && (
                      <div className="p-3 rounded-xl border border-accent/20 bg-accent/5">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <TrendingDown className="w-3 h-3 text-accent/60" />
                          <span className="text-[10px] font-bold text-accent/60 uppercase tracking-wider">Skippy&apos;s Best Round</span>
                          <span className="ml-auto text-[10px] font-black text-accent">R{strongestAi.roundNumber}</span>
                        </div>
                        <p className="text-[11px] text-foreground/70 leading-relaxed line-clamp-2">{strongestAi.aiRebuttal}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Round-by-round breakdown */}
            <div className="p-4 bg-surface border border-border rounded-xl mb-4">
              <p className="text-[10px] font-bold text-muted/50 uppercase tracking-wider mb-3">Round Breakdown</p>
              <div className="space-y-2">
                {debate.rounds.map((r) => {
                  const userWon = r.userScore > r.aiScore
                  const tied = r.userScore === r.aiScore
                  return (
                    <div key={r.id} className="flex items-center gap-3 text-xs">
                      <span className="text-muted/40 w-12 flex-shrink-0">Round {r.roundNumber}</span>
                      <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden relative">
                        <div className="absolute left-0 top-0 bottom-0 rounded-l-full transition-all"
                          style={{ width: `${r.userScore}%`, background: '#2d6ae066' }} />
                        <div className="absolute right-0 top-0 bottom-0 rounded-r-full transition-all"
                          style={{ width: `${r.aiScore}%`, background: '#e8b84b66' }} />
                      </div>
                      <span className={cn('w-16 text-right flex-shrink-0 font-bold', userWon ? 'text-navy-bright/70' : tied ? 'text-muted/40' : 'text-accent/70')}>
                        {tied ? <Minus className="w-3 h-3 inline" /> : userWon ? `You ${r.userScore}%` : `AI ${r.aiScore}%`}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-center gap-3">
              {debate.noteId && (
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={onViewNote}
                  className="btn-gold flex items-center gap-2 px-6 py-3 rounded-xl text-sm relative">
                  <Save className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">View saved note</span>
                </motion.button>
              )}
              <button onClick={onBack}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold glass-gold border border-accent/20 text-foreground hover:border-accent/40 transition-all">
                <ArrowLeft className="w-4 h-4" />
                Back to debates
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
