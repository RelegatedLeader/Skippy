'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Swords, Plus, Trophy, Equal, Trash2, Clock, ChevronRight, Bot, Shield, Zap, Cpu } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { cn, formatRelativeTime } from '@/lib/utils'

type DebateModel = 'grok' | 'claude'

const MODEL_OPTIONS: { id: DebateModel; label: string; desc: string; color: string }[] = [
  { id: 'grok',   label: 'Grok',   desc: 'xAI — fast & assertive',     color: '#29c2e6' },
  { id: 'claude', label: 'Claude', desc: 'Anthropic — deep reasoning', color: '#8b5cf6' },
]

interface Debate {
  id: string
  topic: string
  userStance: string
  aiStance: string
  status: 'active' | 'concluded'
  winner?: 'user' | 'ai' | 'draw'
  conclusion?: string
  model?: string
  rounds: Array<{ roundNumber: number; userScore: number; aiScore: number }>
  createdAt: string
}

const TOPIC_IDEAS = [
  'I should quit my job to pursue my side project full-time',
  'I need to cut this person out of my life',
  'Taking this financial risk is worth it',
  'I should move to a new city',
  'This goal is realistic for me right now',
  'I\'m making the right decision about my career path',
]

export default function DebatePage() {
  const router = useRouter()
  const [debates, setDebates] = useState<Debate[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [topic, setTopic] = useState('')
  const [userStance, setUserStance] = useState('')
  const [debateModel, setDebateModel] = useState<DebateModel>('grok')

  const fetchDebates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/debates')
      if (res.ok) setDebates(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchDebates() }, [fetchDebates])

  // Pre-fill topic from ?topic= param (e.g. from a note link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const topicParam = params.get('topic')
    if (topicParam) { setTopic(decodeURIComponent(topicParam)); setShowForm(true) }
  }, [])

  const startDebate = async () => {
    if (!topic.trim() || !userStance.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/debates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), userStance: userStance.trim(), model: debateModel }),
      })
      if (res.ok) {
        const debate = await res.json()
        router.push(`/debate/${debate.id}`)
      }
    } finally { setCreating(false) }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await fetch(`/api/debates/${id}`, { method: 'DELETE' })
    setDebates((p) => p.filter((d) => d.id !== id))
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
                <Swords className="w-5 h-5 text-accent" />
                Debate Arena
              </h1>
              <p className="text-xs text-muted mt-0.5">Challenge your thinking. Skippy pushes back.</p>
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => setShowForm(!showForm)}
              className="btn-gold flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm relative"
            >
              <Plus className="w-4 h-4 relative z-10" />
              <span className="relative z-10">New Debate</span>
            </motion.button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-8 py-6 relative z-10 space-y-6">

          {/* Create form */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, y: -12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.98 }}
                className="glass-gold rounded-2xl p-6 border border-accent/20 relative overflow-hidden"
              >
                {/* Decorative bg */}
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: 'radial-gradient(circle at 100% 0%, rgba(232,184,75,0.05), transparent 60%)' }} />

                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center">
                      <Swords className="w-4 h-4 text-accent" />
                    </div>
                    <h2 className="font-display font-bold text-foreground text-base">Start a New Debate</h2>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-muted/70 uppercase tracking-wider mb-2 block">
                        Debate Topic / Proposition
                      </label>
                      <input
                        type="text"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="e.g. I should quit my job and go all-in on my startup"
                        className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent/40 focus:shadow-[0_0_0_3px_rgba(232,184,75,0.07)] transition-all"
                      />
                      {/* Topic ideas */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {TOPIC_IDEAS.map((idea) => (
                          <button key={idea} onClick={() => setTopic(idea)}
                            className="text-[10px] text-muted/60 hover:text-accent px-2 py-1 rounded-lg bg-surface border border-border hover:border-accent/25 transition-all">
                            {idea.length > 40 ? idea.slice(0, 40) + '…' : idea}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-muted/70 uppercase tracking-wider mb-2 block">
                        Your Stance — What do you believe?
                      </label>
                      <textarea
                        value={userStance}
                        onChange={(e) => setUserStance(e.target.value)}
                        placeholder="State your position clearly. Why do you believe this is the right call?"
                        rows={2}
                        className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent/40 focus:shadow-[0_0_0_3px_rgba(232,184,75,0.07)] transition-all resize-none"
                      />
                    </div>

                    {/* Model selector */}
                    <div>
                      <label className="text-xs font-semibold text-muted/70 uppercase tracking-wider mb-2 block">
                        Debate powered by
                      </label>
                      <div className="flex gap-2">
                        {MODEL_OPTIONS.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => setDebateModel(m.id)}
                            className={cn(
                              'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all',
                              debateModel === m.id ? '' : 'bg-surface border-border text-muted hover:text-foreground'
                            )}
                            style={debateModel === m.id ? {
                              background: `${m.color}12`,
                              borderColor: `${m.color}40`,
                              color: m.color,
                            } : {}}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                            <span>{m.label}</span>
                            <span className="text-[10px] opacity-60 hidden sm:block">{m.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <motion.button
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={startDebate}
                        disabled={creating || !topic.trim() || !userStance.trim()}
                        className={cn(
                          'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all',
                          topic.trim() && userStance.trim()
                            ? 'btn-gold relative'
                            : 'bg-surface border border-border text-muted/40 cursor-not-allowed'
                        )}
                      >
                        {creating
                          ? <><Bot className="w-4 h-4 animate-pulse relative z-10" /><span className="relative z-10">Skippy is preparing…</span></>
                          : <><Swords className="w-4 h-4 relative z-10" /><span className="relative z-10">Begin the Debate</span></>
                        }
                      </motion.button>
                      <button onClick={() => { setShowForm(false); setTopic(''); setUserStance('') }}
                        className="text-xs text-muted/50 hover:text-muted transition-colors px-3 py-2">
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Design principles callout */}
          {!showForm && debates.length === 0 && !loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { icon: Shield, color: '#e8b84b', title: 'Safe to be wrong', text: 'No judgment. The debate is a thinking tool, not a test. Changing your mind is a win.' },
                  { icon: Zap, color: '#2d6ae0', title: 'Skippy knows you', text: "Arguments are built from your memories, notes, and goals — not generic advice." },
                  { icon: Trophy, color: '#10b981', title: 'Saved for reflection', text: 'Every debate becomes a note. Review your thinking months later to see how you\'ve grown.' },
                ].map(({ icon: Icon, color, title, text }) => (
                  <div key={title} className="p-5 rounded-2xl bg-surface border border-border relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-full opacity-60" style={{ backgroundColor: color }} />
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: `${color}15`, border: `1px solid ${color}25` }}>
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                    <h3 className="font-display font-bold text-sm text-foreground mb-1.5">{title}</h3>
                    <p className="text-xs text-muted leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>

              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-surface border border-accent/25 flex items-center justify-center mx-auto mb-4 shadow-glow-gold-sm animate-pulse-gold">
                  <Swords className="w-8 h-8 text-accent/70" />
                </div>
                <h3 className="font-display text-xl font-bold text-foreground mb-2">No debates yet</h3>
                <p className="text-muted text-sm max-w-sm mx-auto mb-6">Start a debate on any decision, belief, or plan. Skippy will challenge you — and make you think harder.</p>
                <button onClick={() => setShowForm(true)}
                  className="btn-gold inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm relative">
                  <Swords className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">Start your first debate</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* Past debates */}
          {debates.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-muted/50 uppercase tracking-widest">Past Debates</p>
              <AnimatePresence>
                {debates.map((d) => {
                  const lastRound = d.rounds[d.rounds.length - 1]
                  const userScore = lastRound?.userScore ?? 50
                  const aiScore = lastRound?.aiScore ?? 50
                  const WinIcon = d.winner === 'user' ? Trophy : d.winner === 'ai' ? Bot : Equal

                  return (
                    <motion.div key={d.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      onClick={() => router.push(`/debate/${d.id}`)}
                      className="group relative p-5 rounded-2xl bg-surface border border-border hover:border-accent/25 cursor-pointer transition-all overflow-hidden"
                    >
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ background: 'radial-gradient(circle at 100% 50%, rgba(232,184,75,0.04), transparent 60%)' }} />

                      <div className="relative z-10">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
                                d.status === 'active' ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-muted/60'
                              )}>
                                {d.status === 'active' ? '● Active' : '✓ Concluded'}
                              </span>
                              {d.status === 'concluded' && d.winner && (
                                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
                                  d.winner === 'user' ? 'bg-emerald-400/15 text-emerald-400' :
                                  d.winner === 'ai' ? 'bg-blue-400/15 text-blue-400' : 'bg-muted/15 text-muted'
                                )}>
                                  {d.winner === 'user' ? '🏆 You won' : d.winner === 'ai' ? '🤖 Skippy won' : '= Draw'}
                                </span>
                              )}
                              <span className="text-[10px] text-muted/40 ml-auto flex items-center gap-1.5">
                              <Cpu className="w-2.5 h-2.5" />
                              {d.model === 'claude' ? 'Claude' : 'Grok'}
                              <span className="opacity-40">·</span>
                              {d.rounds.length} round{d.rounds.length !== 1 ? 's' : ''}
                            </span>
                            </div>
                            <h3 className="font-display font-bold text-foreground text-sm leading-tight">{d.topic}</h3>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {d.status === 'concluded' && (
                              <WinIcon className="w-4 h-4 text-accent/60" />
                            )}
                            <button onClick={(e) => handleDelete(e, d.id)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <ChevronRight className="w-4 h-4 text-muted/30 group-hover:text-accent/50 transition-colors" />
                          </div>
                        </div>

                        {/* Confidence bar */}
                        {d.rounds.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted/50 w-12 text-right">You {userScore}%</span>
                            <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{
                                  width: `${userScore}%`,
                                  background: userScore > aiScore
                                    ? 'linear-gradient(90deg, #2d6ae0, #6ba3f0)'
                                    : 'linear-gradient(90deg, #162236, #1a3050)',
                                }} />
                            </div>
                            <span className="text-[10px] text-muted/50 w-16">Skippy {aiScore}%</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 mt-2.5">
                          <Clock className="w-3 h-3 text-muted/30" />
                          <span className="text-[10px] text-muted/40">{formatRelativeTime(d.createdAt)}</span>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
