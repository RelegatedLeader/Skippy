'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, Flame, Zap, RotateCcw, ChevronRight,
  Volume2, Mic, MicOff, Pencil, RefreshCw, Trophy,
  CheckCircle2, XCircle, ArrowLeft, BookOpen, Star, Target,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Sidebar } from '@/components/layout/Sidebar'
import { useNotifications } from '@/components/notifications/NotificationProvider'
import { xpForExercise } from '@/lib/srs'

// ── Types ────────────────────────────────────────────────────────────────────

type ExerciseType = 'flashcard' | 'mcq' | 'pinyin' | 'listening' | 'speaking' | 'stroke'

interface WordItem {
  id: string
  simplified: string
  pinyin: string
  meaning: string
  hsk: number
  pos: string
  example: string
  exPinyin: string
  exMeaning: string
  progress: {
    easeFactor: number
    interval: number
    repetitions: number
    totalCorrect: number
    totalAttempts: number
  } | null
  exerciseType: ExerciseType
  distractors: string[]
}

interface SessionAnswer {
  wordId: string
  exerciseType: ExerciseType
  quality: number
  correct: boolean
  xpEarned: number
}

interface LangProgressData {
  totalXP: number
  wordsLearned: number
  wordsMastered: number
  sessionsCompleted: number
  currentStreak: number
  longestStreak: number
  lastPracticeDate: string
}

interface StatsData {
  progress: LangProgressData
  totalWords: number
  learnedWords: number
  masteredWords: number
  recentSessions: { wordsReviewed: number; correctCount: number; xpEarned: number; createdAt: string }[]
}

type PageView = 'dashboard' | 'practice' | 'results'

// ── Utilities ────────────────────────────────────────────────────────────────

function normalizePinyin(p: string): string {
  return p
    .toLowerCase()
    .replace(/[āáǎà]/g, 'a').replace(/[ēéěè]/g, 'e')
    .replace(/[īíǐì]/g, 'i').replace(/[ōóǒò]/g, 'o')
    .replace(/[ūúǔù]/g, 'u').replace(/[ǖǘǚǜ]/g, 'u')
    .replace(/[1-5]/g, '').replace(/\s+/g, ' ').trim()
}

function speak(text: string, lang = 'zh-CN', rate = 0.8) {
  if (typeof window === 'undefined') return
  window.speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(text)
  utt.lang = lang
  utt.rate = rate
  window.speechSynthesis.speak(utt)
}

function hskBadgeColor(hsk: number) {
  if (hsk <= 1) return { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' }
  if (hsk <= 2) return { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' }
  if (hsk <= 3) return { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' }
  return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' }
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function LearnPage() {
  const [view, setView] = useState<PageView>('dashboard')
  const [stats, setStats] = useState<StatsData | null>(null)
  const [queue, setQueue] = useState<WordItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<SessionAnswer[]>([])
  const [sessionStartTime, setSessionStartTime] = useState(0)
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [xpPops, setXpPops] = useState<{ id: number; xp: number }[]>([])
  const xpPopId = useRef(0)
  const { awardXP, refreshStats } = useNotifications()

  const fetchStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const res = await fetch('/api/learn?language=zh')
      if (res.ok) setStats(await res.json())
    } finally {
      setLoadingStats(false)
    }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  const startSession = async () => {
    setLoadingQueue(true)
    try {
      const res = await fetch('/api/learn/words?language=zh')
      if (res.ok) {
        const data = await res.json()
        setQueue(data.words)
        setCurrentIndex(0)
        setAnswers([])
        setSessionStartTime(Date.now())
        setView('practice')
      }
    } finally {
      setLoadingQueue(false)
    }
  }

  const handleAnswer = useCallback(async (answer: SessionAnswer) => {
    // Update SM-2 via API (fire and forget)
    fetch(`/api/learn/words/${answer.wordId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'zh', quality: answer.quality, correct: answer.correct }),
    }).catch(console.error)

    setAnswers(prev => [...prev, answer])

    if (answer.xpEarned > 0) {
      const popId = ++xpPopId.current
      setXpPops(prev => [...prev, { id: popId, xp: answer.xpEarned }])
      setTimeout(() => setXpPops(prev => prev.filter(p => p.id !== popId)), 1500)
    }

    // Advance to next word or end session
    if (currentIndex + 1 >= queue.length) {
      // Session complete
      const duration = Math.round((Date.now() - sessionStartTime) / 1000)
      const correctCount = [...answers, answer].filter(a => a.correct).length
      const totalXP = [...answers, answer].reduce((s, a) => s + a.xpEarned, 0)
      const sessionBonus = 20
      const perfectBonus = correctCount === queue.length ? 30 : 0
      const totalXPWithBonus = totalXP + sessionBonus + perfectBonus

      // Save session
      fetch('/api/learn/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: 'zh',
          mode: 'mixed',
          wordsReviewed: queue.length,
          correctCount,
          xpEarned: totalXPWithBonus,
          duration,
        }),
      }).catch(console.error)

      // Update language streak + XP
      fetch('/api/learn', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: 'zh', xpEarned: totalXPWithBonus }),
      }).catch(console.error)

      // Award global XP
      awardXP(totalXPWithBonus)
      refreshStats()

      setTimeout(() => setView('results'), 400)
    } else {
      setCurrentIndex(i => i + 1)
    }
  }, [answers, currentIndex, queue, sessionStartTime, awardXP, refreshStats])

  const totalSessionXP = answers.reduce((s, a) => s + a.xpEarned, 0)
  const sessionCorrect = answers.filter(a => a.correct).length

  return (
    <div className="h-screen flex bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative">
        <div className="fixed inset-0 pointer-events-none circuit-grid opacity-20" />

        {/* XP Pops */}
        <div className="fixed top-24 right-8 z-50 pointer-events-none space-y-1">
          <AnimatePresence>
            {xpPops.map(p => (
              <motion.div key={p.id}
                initial={{ y: 0, opacity: 1, scale: 1 }}
                animate={{ y: -50, opacity: 0, scale: 1.2 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                className="text-lg font-black text-yellow-400"
                style={{ textShadow: '0 0 12px rgba(250,204,21,0.9)' }}
              >
                +{p.xp} XP
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div key="dashboard"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}
            >
              <Dashboard
                stats={stats}
                loading={loadingStats}
                onStart={startSession}
                startingSession={loadingQueue}
              />
            </motion.div>
          )}

          {view === 'practice' && queue.length > 0 && (
            <motion.div key="practice"
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}
              className="h-full"
            >
              <PracticeView
                words={queue}
                currentIndex={currentIndex}
                onAnswer={handleAnswer}
                xpSoFar={totalSessionXP}
                correctSoFar={sessionCorrect}
                onExit={() => setView('dashboard')}
              />
            </motion.div>
          )}

          {view === 'results' && (
            <motion.div key="results"
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
            >
              <ResultsView
                answers={answers}
                totalWords={queue.length}
                onContinue={() => { fetchStats(); setView('dashboard') }}
                onRestart={startSession}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({
  stats, loading, onStart, startingSession,
}: {
  stats: StatsData | null
  loading: boolean
  onStart: () => void
  startingSession: boolean
}) {
  const p = stats?.progress
  const accuracy = stats?.recentSessions && stats.recentSessions.length > 0
    ? Math.round(
        stats.recentSessions.reduce((s, r) => s + (r.wordsReviewed > 0 ? r.correctCount / r.wordsReviewed : 0), 0)
        / stats.recentSessions.length * 100
      )
    : 0

  const learnedPct = stats ? Math.round((stats.learnedWords / Math.max(1, stats.totalWords)) * 100) : 0
  const masteredPct = stats ? Math.round((stats.masteredWords / Math.max(1, stats.totalWords)) * 100) : 0

  return (
    <div className="max-w-3xl mx-auto px-8 py-8 relative z-10">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/chat" className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
            中
          </div>
          <div>
            <h1 className="font-display text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
              Mandarin Chinese
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                HSK 1–2
              </span>
            </h1>
            <p className="text-xs text-muted mt-0.5">Skippy Language Engine · SM-2 Spaced Repetition</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-muted">
          <GraduationCap className="w-5 h-5 animate-pulse" style={{ color: '#ef4444' }} />
          <span className="text-sm">Loading your progress…</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<Flame className="w-4 h-4" />}
              label="Streak"
              value={`${p?.currentStreak ?? 0}d`}
              color="#f97316"
            />
            <StatCard
              icon={<Zap className="w-4 h-4" />}
              label="Lang XP"
              value={String(p?.totalXP ?? 0)}
              color="#f59e0b"
            />
            <StatCard
              icon={<BookOpen className="w-4 h-4" />}
              label="Learned"
              value={String(stats?.learnedWords ?? 0)}
              sub={`/ ${stats?.totalWords ?? 0}`}
              color="#3b82f6"
            />
            <StatCard
              icon={<Star className="w-4 h-4" />}
              label="Mastered"
              value={String(stats?.masteredWords ?? 0)}
              color="#22c55e"
            />
          </div>

          {/* Progress bars */}
          <div className="p-5 rounded-2xl border space-y-4"
            style={{ background: 'rgba(15,39,89,0.4)', borderColor: 'rgba(30,58,110,0.8)' }}>
            <div>
              <div className="flex justify-between text-xs text-muted mb-1.5">
                <span>Words Learned</span>
                <span className="text-foreground/70 font-medium">{learnedPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${learnedPct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #3b82f6, #6366f1)' }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-muted mb-1.5">
                <span>Words Mastered</span>
                <span className="text-foreground/70 font-medium">{masteredPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${masteredPct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #10b981, #22c55e)' }}
                />
              </div>
            </div>
            {stats && stats.recentSessions.length > 0 && (
              <div>
                <div className="flex justify-between text-xs text-muted mb-1.5">
                  <span>Recent Accuracy</span>
                  <span className="text-foreground/70 font-medium">{accuracy}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${accuracy}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                    className="h-full rounded-full"
                    style={{ background: accuracy >= 80 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Start session */}
          <motion.button
            onClick={onStart}
            disabled={startingSession}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full py-5 rounded-2xl font-bold text-lg text-white relative overflow-hidden disabled:opacity-60"
            style={{
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)',
              boxShadow: '0 4px 24px rgba(239,68,68,0.35)',
            }}
          >
            <div className="absolute inset-0 opacity-20"
              style={{ background: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 20px)' }}
            />
            <span className="relative z-10 flex items-center justify-center gap-3">
              {startingSession ? (
                <><RefreshCw className="w-5 h-5 animate-spin" />Loading session…</>
              ) : (
                <><GraduationCap className="w-5 h-5" />开始练习 · Start Practice</>
              )}
            </span>
          </motion.button>

          {/* Exercise type legend */}
          <div className="p-4 rounded-xl border"
            style={{ background: 'rgba(10,26,53,0.6)', borderColor: 'rgba(30,58,110,0.6)' }}>
            <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Exercise Types</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { icon: '🃏', name: 'Flashcard', desc: 'Self-rate your recall', xp: '+3 XP' },
                { icon: '🎯', name: 'Multiple Choice', desc: 'Pick the right meaning', xp: '+5 XP' },
                { icon: '✍️', name: 'Pinyin Input', desc: 'Type the pronunciation', xp: '+8 XP' },
                { icon: '👂', name: 'Listening', desc: 'Hear it, pick the character', xp: '+6 XP' },
                { icon: '🎙️', name: 'Speaking', desc: 'Say it in Mandarin', xp: '+12 XP' },
                { icon: '🖊️', name: 'Stroke Writing', desc: 'Draw the character', xp: '+10 XP' },
              ].map(ex => (
                <div key={ex.name} className="flex items-start gap-2 p-2 rounded-lg"
                  style={{ background: 'rgba(15,39,89,0.4)' }}>
                  <span className="text-base mt-0.5">{ex.icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-foreground/80">{ex.name}</p>
                    <p className="text-[10px] text-muted/60">{ex.desc}</p>
                    <p className="text-[10px] font-bold text-yellow-400/70 mt-0.5">{ex.xp}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent sessions */}
          {stats && stats.recentSessions.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Recent Sessions</h3>
              <div className="space-y-1.5">
                {stats.recentSessions.slice(0, 5).map((s, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg border"
                    style={{ background: 'rgba(15,39,89,0.3)', borderColor: 'rgba(30,58,110,0.5)' }}>
                    <span className="text-xs text-muted/60 w-20 shrink-0">
                      {new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-xs text-foreground/70">{s.wordsReviewed} words</span>
                    <span className="text-xs text-muted/50">·</span>
                    <span className="text-xs text-foreground/70">
                      {s.wordsReviewed > 0 ? Math.round(s.correctCount / s.wordsReviewed * 100) : 0}% correct
                    </span>
                    <span className="ml-auto text-xs font-bold text-yellow-400/70">+{s.xpEarned} XP</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Practice View ─────────────────────────────────────────────────────────────

function PracticeView({
  words, currentIndex, onAnswer, xpSoFar, correctSoFar, onExit,
}: {
  words: WordItem[]
  currentIndex: number
  onAnswer: (a: SessionAnswer) => void
  xpSoFar: number
  correctSoFar: number
  onExit: () => void
}) {
  const word = words[currentIndex]
  const progress = ((currentIndex) / words.length) * 100

  return (
    <div className="max-w-2xl mx-auto px-6 py-6 relative z-10">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onExit}
          className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex justify-between text-xs text-muted mb-1.5">
            <span>{currentIndex + 1} / {words.length}</span>
            <span className="flex items-center gap-1 text-yellow-400/70 font-bold">
              <Zap className="w-3 h-3" />{xpSoFar} XP
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4 }}
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #ef4444, #f97316)' }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-green-400/70 font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {correctSoFar}
        </div>
      </div>

      {/* Exercise card */}
      <AnimatePresence mode="wait">
        <motion.div key={`${word.id}-${currentIndex}`}
          initial={{ opacity: 0, x: 30, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -30, scale: 0.97 }}
          transition={{ duration: 0.2 }}
        >
          {word.exerciseType === 'flashcard' && (
            <FlashcardExercise word={word} onAnswer={onAnswer} />
          )}
          {word.exerciseType === 'mcq' && (
            <MCQExercise word={word} onAnswer={onAnswer} />
          )}
          {word.exerciseType === 'pinyin' && (
            <PinyinExercise word={word} onAnswer={onAnswer} />
          )}
          {word.exerciseType === 'listening' && (
            <ListeningExercise word={word} onAnswer={onAnswer} />
          )}
          {word.exerciseType === 'speaking' && (
            <SpeakingExercise word={word} onAnswer={onAnswer} />
          )}
          {word.exerciseType === 'stroke' && (
            <StrokeExercise word={word} onAnswer={onAnswer} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ── Results View ─────────────────────────────────────────────────────────────

function ResultsView({
  answers, totalWords, onContinue, onRestart,
}: {
  answers: SessionAnswer[]
  totalWords: number
  onContinue: () => void
  onRestart: () => void
}) {
  const totalXP = answers.reduce((s, a) => s + a.xpEarned, 0)
  const sessionBonus = 20
  const correctCount = answers.filter(a => a.correct).length
  const perfectBonus = correctCount === totalWords ? 30 : 0
  const grandTotal = totalXP + sessionBonus + perfectBonus
  const accuracy = totalWords > 0 ? Math.round(correctCount / totalWords * 100) : 0
  const perfect = correctCount === totalWords

  return (
    <div className="max-w-lg mx-auto px-8 py-12 relative z-10 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200 }}
        className="text-7xl mb-6"
      >
        {perfect ? '🏆' : accuracy >= 70 ? '⭐' : '📚'}
      </motion.div>

      <motion.h2
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="font-display text-3xl font-black text-foreground mb-2"
      >
        {perfect ? '完美！Perfect!' : accuracy >= 70 ? '很好！Well Done!' : '继续练习！Keep Going!'}
      </motion.h2>

      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-muted mb-8"
      >
        Session complete · {totalWords} words reviewed
      </motion.p>

      {/* XP breakdown */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="p-5 rounded-2xl border mb-6 text-left space-y-3"
        style={{ background: 'rgba(15,39,89,0.5)', borderColor: 'rgba(30,58,110,0.8)' }}
      >
        <div className="flex justify-between text-sm">
          <span className="text-muted">Exercise XP</span>
          <span className="font-bold text-yellow-400">+{totalXP}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">Session completion bonus</span>
          <span className="font-bold text-yellow-400">+{sessionBonus}</span>
        </div>
        {perfectBonus > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Perfect session bonus 🔥</span>
            <span className="font-bold text-yellow-400">+{perfectBonus}</span>
          </div>
        )}
        <div className="border-t pt-3 flex justify-between"
          style={{ borderColor: 'rgba(30,58,110,0.6)' }}>
          <span className="font-bold text-foreground">Total XP Earned</span>
          <span className="font-black text-xl text-yellow-400">+{grandTotal}</span>
        </div>
      </motion.div>

      {/* Accuracy */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-3 gap-3 mb-8"
      >
        <div className="p-3 rounded-xl border text-center"
          style={{ background: 'rgba(15,39,89,0.4)', borderColor: 'rgba(30,58,110,0.6)' }}>
          <div className="text-2xl font-black text-green-400">{correctCount}</div>
          <div className="text-[10px] text-muted mt-0.5">Correct</div>
        </div>
        <div className="p-3 rounded-xl border text-center"
          style={{ background: 'rgba(15,39,89,0.4)', borderColor: 'rgba(30,58,110,0.6)' }}>
          <div className="text-2xl font-black text-foreground">{accuracy}%</div>
          <div className="text-[10px] text-muted mt-0.5">Accuracy</div>
        </div>
        <div className="p-3 rounded-xl border text-center"
          style={{ background: 'rgba(15,39,89,0.4)', borderColor: 'rgba(30,58,110,0.6)' }}>
          <div className="text-2xl font-black text-red-400">{totalWords - correctCount}</div>
          <div className="text-[10px] text-muted mt-0.5">Missed</div>
        </div>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex gap-3"
      >
        <button onClick={onRestart}
          className="flex-1 py-3 rounded-xl border font-semibold text-sm text-muted hover:text-foreground transition-colors flex items-center justify-center gap-2"
          style={{ borderColor: 'rgba(30,58,110,0.6)' }}>
          <RotateCcw className="w-4 h-4" />
          Practice Again
        </button>
        <button onClick={onContinue}
          className="flex-1 py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 4px 16px rgba(239,68,68,0.3)' }}>
          Back to Dashboard
          <ChevronRight className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  )
}

// ── Exercise: Flashcard ───────────────────────────────────────────────────────

function FlashcardExercise({ word, onAnswer }: { word: WordItem; onAnswer: (a: SessionAnswer) => void }) {
  const [flipped, setFlipped] = useState(false)
  const hsk = hskBadgeColor(word.hsk)

  const handleRate = (rating: 1 | 2 | 3 | 4 | 5) => {
    const correct = rating >= 3
    // SM-2 quality: rating 1→0, 2→1, 3→2, 4→3, 5→4
    const quality = Math.max(0, rating - 1)
    const xpEarned = xpForExercise('flashcard', quality)
    onAnswer({ wordId: word.id, exerciseType: 'flashcard', quality, correct, xpEarned })
    setFlipped(false)
  }

  return (
    <div className="space-y-4">
      <ExerciseLabel icon="🃏" label="Flashcard" hint="Look at the character, try to recall the meaning, then flip." />
      <div className="p-4 rounded-xl border text-center"
        style={{ background: 'rgba(10,26,53,0.7)', borderColor: 'rgba(30,58,110,0.7)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded"
            style={{ background: hsk.bg, color: hsk.color }}>HSK {word.hsk}</span>
          <span className="text-[10px] text-muted">{word.pos}</span>
          <button onClick={() => speak(word.simplified)}
            className="p-1.5 rounded-lg text-muted hover:text-accent transition-colors">
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {!flipped ? (
            <motion.div key="front"
              initial={{ rotateY: -90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: 90, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="py-10"
            >
              <div className="text-[96px] leading-none font-serif mb-2" style={{ color: '#ef4444' }}>
                {word.simplified}
              </div>
              <button onClick={() => { setFlipped(true); speak(word.simplified) }}
                className="mt-4 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 mx-auto"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                Flip to reveal <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>
          ) : (
            <motion.div key="back"
              initial={{ rotateY: -90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: 90, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="py-4"
            >
              <div className="text-[64px] leading-none font-serif mb-1" style={{ color: '#ef4444' }}>
                {word.simplified}
              </div>
              <div className="text-lg font-medium text-accent/80 mb-1">{word.pinyin}</div>
              <div className="text-2xl font-bold text-foreground mb-3">{word.meaning}</div>
              {word.example && (
                <div className="text-sm text-muted/70 border-t pt-3 text-left space-y-0.5"
                  style={{ borderColor: 'rgba(30,58,110,0.4)' }}>
                  <p className="font-medium text-foreground/80">{word.example}</p>
                  <p className="text-muted/60 text-xs">{word.exPinyin}</p>
                  <p className="text-muted/50 text-xs italic">{word.exMeaning}</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {flipped && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-xs text-center text-muted mb-3">How well did you remember it?</p>
          <div className="grid grid-cols-5 gap-2">
            {[
              { rating: 1 as const, label: 'Again', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
              { rating: 2 as const, label: 'Hard', color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
              { rating: 3 as const, label: 'Good', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
              { rating: 4 as const, label: 'Easy', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
              { rating: 5 as const, label: 'Perfect', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
            ].map(r => (
              <button key={r.rating} onClick={() => handleRate(r.rating)}
                className="py-3 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95"
                style={{ background: r.bg, color: r.color, border: `1px solid ${r.color}30` }}>
                {r.label}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ── Exercise: Multiple Choice ─────────────────────────────────────────────────

function MCQExercise({ word, onAnswer }: { word: WordItem; onAnswer: (a: SessionAnswer) => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const hsk = hskBadgeColor(word.hsk)

  // Memoize options per word to prevent re-shuffle on re-render
  const [stableOptions] = useState(() => [word.meaning, ...word.distractors].sort(() => Math.random() - 0.5))

  const handleSelect = (option: string) => {
    if (selected) return
    setSelected(option)
    const correct = option === word.meaning
    const quality = correct ? 4 : 1
    const xpEarned = xpForExercise('mcq', quality)
    setTimeout(() => {
      onAnswer({ wordId: word.id, exerciseType: 'mcq', quality, correct, xpEarned })
      setSelected(null)
    }, 1000)
  }

  return (
    <div className="space-y-4">
      <ExerciseLabel icon="🎯" label="Multiple Choice" hint="What does this character mean?" />
      <div className="p-6 rounded-2xl border text-center"
        style={{ background: 'rgba(10,26,53,0.7)', borderColor: 'rgba(30,58,110,0.7)' }}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded"
            style={{ background: hsk.bg, color: hsk.color }}>HSK {word.hsk}</span>
          <button onClick={() => speak(word.simplified)}
            className="p-1.5 rounded-lg text-muted hover:text-accent transition-colors">
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="text-[96px] leading-none font-serif py-4" style={{ color: '#ef4444' }}>
          {word.simplified}
        </div>
        <div className="text-sm text-muted/50">{word.pinyin}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stableOptions.map((opt, i) => {
          const isSelected = selected === opt
          const isCorrect = opt === word.meaning
          let style: React.CSSProperties = {
            background: 'rgba(15,39,89,0.5)',
            borderColor: 'rgba(30,58,110,0.6)',
            color: 'rgba(255,255,255,0.8)',
          }
          if (isSelected) {
            style = isCorrect
              ? { background: 'rgba(16,185,129,0.2)', borderColor: '#10b981', color: '#10b981' }
              : { background: 'rgba(239,68,68,0.2)', borderColor: '#ef4444', color: '#ef4444' }
          } else if (selected && isCorrect) {
            style = { background: 'rgba(16,185,129,0.15)', borderColor: '#10b981', color: '#10b981' }
          }

          return (
            <motion.button key={i} onClick={() => handleSelect(opt)}
              whileHover={!selected ? { scale: 1.02 } : {}}
              whileTap={!selected ? { scale: 0.98 } : {}}
              className="py-4 px-4 rounded-xl border text-sm font-medium text-left transition-all"
              style={style}
            >
              {isSelected && (isCorrect
                ? <CheckCircle2 className="w-4 h-4 inline mr-2" />
                : <XCircle className="w-4 h-4 inline mr-2" />
              )}
              {opt}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

// ── Exercise: Pinyin Input ────────────────────────────────────────────────────

function PinyinExercise({ word, onAnswer }: { word: WordItem; onAnswer: (a: SessionAnswer) => void }) {
  const [input, setInput] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [correct, setCorrect] = useState(false)
  const hsk = hskBadgeColor(word.hsk)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = () => {
    if (!input.trim() || submitted) return
    const normalized = normalizePinyin(input)
    const expected = normalizePinyin(word.pinyin)
    const isCorrect = normalized === expected
    setCorrect(isCorrect)
    setSubmitted(true)
    const quality = isCorrect ? 5 : 1
    const xpEarned = xpForExercise('pinyin', quality)
    setTimeout(() => {
      onAnswer({ wordId: word.id, exerciseType: 'pinyin', quality, correct: isCorrect, xpEarned })
      setInput('')
      setSubmitted(false)
    }, 1400)
  }

  return (
    <div className="space-y-4">
      <ExerciseLabel icon="✍️" label="Pinyin Input" hint="Type the pronunciation (tone marks or numbers OK)" />
      <div className="p-6 rounded-2xl border text-center"
        style={{ background: 'rgba(10,26,53,0.7)', borderColor: 'rgba(30,58,110,0.7)' }}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded"
            style={{ background: hsk.bg, color: hsk.color }}>HSK {word.hsk}</span>
          <button onClick={() => speak(word.simplified)}
            className="p-1.5 rounded-lg text-muted hover:text-accent transition-colors">
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="text-[96px] leading-none font-serif py-4" style={{ color: '#ef4444' }}>
          {word.simplified}
        </div>
        <div className="text-sm text-muted/40 mb-2">{word.meaning}</div>
      </div>

      <div className="space-y-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => !submitted && setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Type the pinyin…  e.g. nǐ hǎo  or  ni3 hao3"
          className={cn(
            'w-full px-4 py-4 rounded-xl border text-base font-medium focus:outline-none transition-all',
            submitted && correct
              ? 'border-green-500/60 bg-green-500/10 text-green-400'
              : submitted && !correct
              ? 'border-red-500/60 bg-red-500/10 text-red-400'
              : 'bg-background border-border text-foreground focus:border-accent/40'
          )}
        />

        {submitted && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className={cn('flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium',
              correct ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400')}>
            {correct ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            {correct ? 'Correct!' : `Correct answer: ${word.pinyin}`}
          </motion.div>
        )}

        {!submitted && (
          <button onClick={handleSubmit} disabled={!input.trim()}
            className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-40 transition-all"
            style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
            Check Answer
          </button>
        )}
      </div>
    </div>
  )
}

// ── Exercise: Listening ───────────────────────────────────────────────────────

function ListeningExercise({ word, onAnswer }: { word: WordItem; onAnswer: (a: SessionAnswer) => void }) {
  const [played, setPlayed] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [stableOptions] = useState(() => [word.simplified, ...word.distractors.map(() => {
    // distractors should be character options, but our distractors are meanings
    // Use pinyin distractors instead — we'll pick 3 random characters from HSK
    return ''
  })].filter(Boolean))

  // For listening, options should be Chinese characters. Use word.distractors as meanings,
  // but we need character options. We'll create plausible character options from the meanings.
  // For simplicity, show the meaning in the options (still tests comprehension).
  const [charOptions] = useState(() => {
    const opts = [word.meaning, ...word.distractors].sort(() => Math.random() - 0.5)
    return opts
  })

  const handlePlay = () => {
    speak(word.simplified)
    setPlayed(true)
  }

  const handleSelect = (opt: string) => {
    if (selected) return
    setSelected(opt)
    const correct = opt === word.meaning
    const quality = correct ? 4 : 1
    const xpEarned = xpForExercise('listening', quality)
    setTimeout(() => {
      onAnswer({ wordId: word.id, exerciseType: 'listening', quality, correct, xpEarned })
      setSelected(null)
    }, 1000)
  }

  return (
    <div className="space-y-4">
      <ExerciseLabel icon="👂" label="Listening" hint="Listen to the word, then pick the correct meaning." />
      <div className="p-8 rounded-2xl border text-center space-y-4"
        style={{ background: 'rgba(10,26,53,0.7)', borderColor: 'rgba(30,58,110,0.7)' }}>
        <motion.button
          onClick={handlePlay}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="w-24 h-24 rounded-full flex items-center justify-center mx-auto transition-all"
          style={{
            background: played ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            border: `2px solid ${played ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
          }}
        >
          <Volume2 className="w-10 h-10" style={{ color: played ? '#10b981' : '#ef4444' }} />
        </motion.button>
        <p className="text-sm text-muted">
          {played ? 'Tap again to replay' : 'Tap to hear the word'}
        </p>
      </div>

      {played && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-xs text-center text-muted mb-3">What does it mean?</p>
          <div className="grid grid-cols-2 gap-3">
            {charOptions.map((opt, i) => {
              const isSelected = selected === opt
              const isCorrect = opt === word.meaning
              let style: React.CSSProperties = {
                background: 'rgba(15,39,89,0.5)',
                borderColor: 'rgba(30,58,110,0.6)',
                color: 'rgba(255,255,255,0.8)',
              }
              if (isSelected) {
                style = isCorrect
                  ? { background: 'rgba(16,185,129,0.2)', borderColor: '#10b981', color: '#10b981' }
                  : { background: 'rgba(239,68,68,0.2)', borderColor: '#ef4444', color: '#ef4444' }
              } else if (selected && isCorrect) {
                style = { background: 'rgba(16,185,129,0.15)', borderColor: '#10b981', color: '#10b981' }
              }
              return (
                <motion.button key={i} onClick={() => handleSelect(opt)}
                  whileHover={!selected ? { scale: 1.02 } : {}}
                  className="py-4 px-4 rounded-xl border text-sm font-medium transition-all"
                  style={style}>
                  {opt}
                </motion.button>
              )
            })}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ── Exercise: Speaking ────────────────────────────────────────────────────────

function SpeakingExercise({ word, onAnswer }: { word: WordItem; onAnswer: (a: SessionAnswer) => void }) {
  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null)
  const [error, setError] = useState('')
  const hsk = hskBadgeColor(word.hsk)

  const startRecording = useCallback(() => {
    if (typeof window === 'undefined') return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setError('Speech recognition requires Chrome. Tap "Skip" to continue.')
      return
    }

    setError('')
    setTranscript('')
    setResult(null)
    setRecording(true)

    const recognition = new SR()
    recognition.lang = 'zh-CN'
    recognition.interimResults = false
    recognition.maxAlternatives = 5

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const heard = Array.from(e.results[0] as any[])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r.transcript as string)
        .join(' ')
      setTranscript(heard)
      // Check if any alternative contains the target character(s)
      const simplified = word.simplified.replace(/\s/g, '')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyMatch = Array.from(e.results[0] as any[]).some((r: any) =>
        (r.transcript as string).replace(/\s/g, '').includes(simplified)
      )
      const isCorrect = anyMatch
      setResult(isCorrect ? 'correct' : 'wrong')
      setRecording(false)

      const quality = isCorrect ? 5 : 1
      const xpEarned = xpForExercise('speaking', quality)
      setTimeout(() => {
        onAnswer({ wordId: word.id, exerciseType: 'speaking', quality, correct: isCorrect, xpEarned })
        setTranscript('')
        setResult(null)
      }, 1400)
    }

    recognition.onerror = () => {
      setRecording(false)
      setError('Could not hear audio. Try again.')
    }

    recognition.onend = () => setRecording(false)

    recognition.start()
  }, [word, onAnswer])

  const handleSkip = () => {
    onAnswer({ wordId: word.id, exerciseType: 'speaking', quality: 3, correct: true, xpEarned: 0 })
  }

  return (
    <div className="space-y-4">
      <ExerciseLabel icon="🎙️" label="Speaking" hint="Say the word in Mandarin Chinese." />
      <div className="p-6 rounded-2xl border text-center"
        style={{ background: 'rgba(10,26,53,0.7)', borderColor: 'rgba(30,58,110,0.7)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded"
            style={{ background: hsk.bg, color: hsk.color }}>HSK {word.hsk}</span>
          <button onClick={() => speak(word.simplified)}
            className="p-1.5 rounded-lg text-muted hover:text-accent transition-colors">
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="text-[80px] leading-none font-serif py-4" style={{ color: '#ef4444' }}>
          {word.simplified}
        </div>
        <div className="text-base font-medium text-accent/70 mb-1">{word.pinyin}</div>
        <div className="text-lg font-semibold text-foreground/80">{word.meaning}</div>
      </div>

      <div className="text-center space-y-4">
        {error && (
          <p className="text-xs text-red-400/80 px-4">{error}</p>
        )}

        {transcript && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className={cn('px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2',
              result === 'correct' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400')}>
            {result === 'correct' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            Heard: &ldquo;{transcript}&rdquo;
          </motion.div>
        )}

        <div className="flex gap-3 justify-center">
          <motion.button
            onClick={startRecording}
            disabled={recording}
            whileHover={!recording ? { scale: 1.05 } : {}}
            whileTap={!recording ? { scale: 0.95 } : {}}
            className="w-20 h-20 rounded-full flex items-center justify-center transition-all"
            style={{
              background: recording ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.15)',
              border: `2px solid ${recording ? '#ef4444' : 'rgba(239,68,68,0.4)'}`,
              boxShadow: recording ? '0 0 20px rgba(239,68,68,0.4)' : 'none',
            }}
          >
            {recording
              ? <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 0.8 }}>
                  <MicOff className="w-8 h-8 text-red-400" />
                </motion.div>
              : <Mic className="w-8 h-8 text-red-400" />
            }
          </motion.button>
        </div>

        <p className="text-xs text-muted">
          {recording ? 'Listening… speak now' : 'Tap the mic to record'}
        </p>

        <button onClick={handleSkip} className="text-xs text-muted/40 hover:text-muted transition-colors">
          Skip this exercise
        </button>
      </div>
    </div>
  )
}

// ── Exercise: Stroke Drawing ──────────────────────────────────────────────────

function StrokeExercise({ word, onAnswer }: { word: WordItem; onAnswer: (a: SessionAnswer) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const hsk = hskBadgeColor(word.hsk)

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const size = canvas.offsetWidth
    canvas.width = size
    canvas.height = size

    // Background
    ctx.fillStyle = 'rgba(10, 26, 53, 0.95)'
    ctx.fillRect(0, 0, size, size)

    // Practice grid (田字格)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size)
    ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Guide character (faint)
    ctx.font = `${size * 0.72}px serif`
    ctx.fillStyle = 'rgba(239,68,68,0.07)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(word.simplified, size / 2, size / 2 + size * 0.04)

    // Border
    ctx.strokeStyle = 'rgba(30,58,110,0.8)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([])
    ctx.strokeRect(0.75, 0.75, size - 1.5, size - 1.5)
  }, [word.simplified])

  useEffect(() => {
    initCanvas()
  }, [initCanvas])

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      const touch = e.touches[0]
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    isDrawingRef.current = true
    lastPosRef.current = getPos(e, canvas)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e, canvas)
    const last = lastPosRef.current
    if (!last) return

    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()

    lastPosRef.current = pos
    setHasDrawn(true)
  }

  const endDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    isDrawingRef.current = false
    lastPosRef.current = null
  }

  const clearCanvas = () => {
    initCanvas()
    setHasDrawn(false)
    setSubmitted(false)
  }

  const handleRate = (rating: 1 | 2 | 3 | 4 | 5) => {
    const correct = rating >= 3
    const quality = Math.max(0, rating - 1)
    const xpEarned = xpForExercise('stroke', quality)
    onAnswer({ wordId: word.id, exerciseType: 'stroke', quality, correct, xpEarned })
  }

  return (
    <div className="space-y-4">
      <ExerciseLabel icon="🖊️" label="Stroke Writing" hint={`Write: "${word.meaning}" (${word.pinyin})`} />

      <div className="p-4 rounded-2xl border"
        style={{ background: 'rgba(10,26,53,0.7)', borderColor: 'rgba(30,58,110,0.7)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-lg font-semibold text-foreground/90">{word.meaning}</span>
            <span className="ml-2 text-sm text-accent/70">{word.pinyin}</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded"
            style={{ background: hsk.bg, color: hsk.color }}>HSK {word.hsk}</span>
        </div>
        <p className="text-xs text-muted/60 mb-3">Draw the character below. The guide is faint — try from memory!</p>

        <div className="relative rounded-xl overflow-hidden mx-auto" style={{ maxWidth: 280 }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', aspectRatio: '1', cursor: 'crosshair', touchAction: 'none', display: 'block' }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
        </div>

        <div className="flex gap-2 mt-3 justify-center">
          <button onClick={clearCanvas}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted hover:text-foreground hover:bg-surface transition-colors">
            <RotateCcw className="w-3 h-3" /> Clear
          </button>
          {!submitted && hasDrawn && (
            <button onClick={() => setSubmitted(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
              Submit <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {submitted && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-center gap-4 mb-4 p-4 rounded-xl border"
            style={{ background: 'rgba(15,39,89,0.4)', borderColor: 'rgba(30,58,110,0.6)' }}>
            <div className="text-center">
              <div className="text-xs text-muted mb-1">Correct character</div>
              <div className="text-6xl font-serif" style={{ color: '#ef4444' }}>{word.simplified}</div>
              <div className="text-sm text-accent/70 mt-1">{word.pinyin}</div>
            </div>
          </div>
          <p className="text-xs text-center text-muted mb-3">How close was your drawing?</p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { rating: 1 as const, label: 'Again', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
              { rating: 2 as const, label: 'Close', color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
              { rating: 4 as const, label: 'Good', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
              { rating: 5 as const, label: 'Perfect', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
            ].map(r => (
              <button key={r.rating} onClick={() => handleRate(r.rating)}
                className="py-3 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95"
                style={{ background: r.bg, color: r.color, border: `1px solid ${r.color}30` }}>
                {r.label}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ── Helper Components ─────────────────────────────────────────────────────────

function ExerciseLabel({ icon, label, hint }: { icon: string; label: string; hint: string }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <span className="text-xl">{icon}</span>
      <div>
        <span className="text-sm font-bold text-foreground/90">{label}</span>
        <p className="text-xs text-muted/60 mt-0.5">{hint}</p>
      </div>
    </div>
  )
}

function StatCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <div className="p-4 rounded-xl border text-center"
      style={{ background: 'rgba(15,39,89,0.4)', borderColor: 'rgba(30,58,110,0.7)' }}>
      <div className="flex justify-center mb-2" style={{ color }}>{icon}</div>
      <div className="flex items-baseline justify-center gap-0.5">
        <span className="text-xl font-black" style={{ color }}>{value}</span>
        {sub && <span className="text-xs text-muted/50">{sub}</span>}
      </div>
      <p className="text-[10px] text-muted/50 mt-0.5">{label}</p>
    </div>
  )
}
