'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Swords, Bot, User, Trophy, Flag, Save, ArrowLeft,
  ChevronRight, Loader2, CheckCircle, AlertTriangle, Equal, Cpu
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sidebar } from '@/components/layout/Sidebar'

interface DebateRound {
  id: string; roundNumber: number; userArgument: string; aiRebuttal: string; userScore: number; aiScore: number; usedModel?: string
}
interface Debate {
  id: string; topic: string; userStance: string; aiStance: string
  status: 'active' | 'concluded'; winner?: 'user' | 'ai' | 'draw'
  conclusion?: string; noteId?: string; model?: string; rounds: DebateRound[]
}

const MAX_ROUNDS = 6

export default function DebateSessionPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [debate, setDebate] = useState<Debate | null>(null)
  const [loading, setLoading] = useState(true)
  const [argument, setArgument] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [streamingRebuttal, setStreamingRebuttal] = useState('')
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
        const rebMatch = raw.match(/REBUTTAL:\s*([\s\S]*?)(?=USER_SCORE:|AI_SCORE:|$)/)
        if (rebMatch) setStreamingRebuttal(rebMatch[1].trim())
        else setStreamingRebuttal(raw)
      }

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
    <div className="h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center gap-3 text-muted">
        <Bot className="w-5 h-5 text-accent animate-pulse" strokeWidth={1.5} />
        <span className="text-sm">Loading debate…</span>
      </div>
    </div>
  )

  if (!debate) return (
    <div className="h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex items-center justify-center text-muted text-sm">Debate not found.</div>
    </div>
  )

  if (showConclusion && debate.status === 'concluded') {
    return <ConclusionScreen debate={debate} onViewNote={() => router.push(`/notes/${debate.noteId}`)} onBack={() => router.push('/debate')} />
  }

  const roundsLeft = MAX_ROUNDS - debate.rounds.length
  const isLastRound = debate.rounds.length >= MAX_ROUNDS - 1

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Header ── */}
        <div className="flex-shrink-0 border-b border-border bg-background/90 backdrop-blur-md px-6 py-3">
          <div className="flex items-center gap-4">
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
                <p className="text-[10px] text-muted/50">Round {debate.rounds.length}/{MAX_ROUNDS} · {roundsLeft > 0 ? `${roundsLeft} left` : 'Final round'}</p>
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
            <div className="flex items-center gap-1.5 w-28 justify-end">
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
            <div className="flex items-center gap-1.5 w-28">
              <span className={cn('text-xs font-black tabular-nums', !userLeads && !tied ? 'text-accent' : 'text-muted/60')}>
                {currentAiScore}%
              </span>
              <Bot className="w-3.5 h-3.5 text-accent" strokeWidth={1.5} />
            </div>
          </div>

          {/* Topic label */}
          <p className="text-center text-[10px] text-muted/40 mt-2 truncate max-w-4xl mx-auto italic">&ldquo;{debate.topic}&rdquo;</p>
        </div>

        {/* ── Arena ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 py-4">
            {/* Column headers */}
            <div className="grid grid-cols-2 gap-4 mb-3">
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
              className="grid grid-cols-2 gap-4 mb-5"
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
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-4 mb-3">
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
      className="grid grid-cols-2 gap-4 mb-3"
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

  return (
    <div className="h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="fixed inset-0 pointer-events-none circuit-grid opacity-15" />
        <div className="max-w-2xl mx-auto px-8 py-16 relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            {/* Result icon */}
            <div className="relative flex justify-center mb-6">
              <div className="w-24 h-24 rounded-3xl flex items-center justify-center border-2 shadow-glow-gold animate-pulse-gold"
                style={{ backgroundColor: `${winColor}12`, borderColor: `${winColor}40` }}>
                <WinIcon className="w-12 h-12" style={{ color: winColor }} strokeWidth={1.5} />
              </div>
            </div>

            <h2 className="font-display text-4xl font-black text-foreground mb-2 tracking-tight">{winLabel}</h2>
            <p className="text-muted text-xs uppercase tracking-widest mb-8">{debate.topic}</p>

            {/* Conclusion */}
            <div className="glass-gold rounded-2xl p-6 text-left mb-6 border border-accent/15">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="w-4 h-4 text-accent" strokeWidth={1.5} />
                <span className="text-xs font-bold text-accent/70 uppercase tracking-wider">Skippy&apos;s Verdict</span>
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed">{debate.conclusion}</p>
            </div>

            {/* Round summary */}
            <div className="space-y-2 mb-8">
              {debate.rounds.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2 rounded-xl bg-surface border border-border text-xs">
                  <span className="text-muted/40 w-14">Round {r.roundNumber}</span>
                  <div className="flex-1 h-1 bg-surface-3 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${r.userScore}%`, background: 'linear-gradient(90deg, #2d6ae0, #e8b84b)' }} />
                  </div>
                  <span className="text-muted/40 w-32 text-right">You {r.userScore}% · AI {r.aiScore}%</span>
                </div>
              ))}
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
