'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, X, Loader2, Volume2, VolumeX, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

// 'ready' = overlay open, waiting for speech (replaces 'idle' inside the open overlay)
type VoiceState = 'ready' | 'listening' | 'processing' | 'speaking' | 'error'

interface VoiceModeProps {
  onTranscript: (text: string) => Promise<string>
  chatBusy?: boolean
  autoActivate?: boolean
  className?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

// "Skip" and "hey skip" added — user-requested
const WAKE_WORDS = [
  'skippy', 'skip', 'hey skippy', 'hey skip',
  'ok skippy', 'ok skip', 'yo skippy', 'yo skip',
  'skipy', 'skipper',
]

const SILENCE_MS    = 3000   // ms of silence before treating speech as done
const MAX_LISTEN_MS = 45_000 // hard cap per listening session
const LOOP_PAUSE_MS = 1400   // pause after speaking before next listen session

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours()
  if (h < 5)  return 'Still up?'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 21) return 'Good evening'
  return 'Hey, still up?'
}

function playChime(type: 'wake' | 'done' | 'error') {
  try {
    const ctx  = new AudioContext()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    if (type === 'wake') {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(440, ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(680, ctx.currentTime + 0.18)
      gain.gain.setValueAtTime(0.14, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42)
      osc.start(); osc.stop(ctx.currentTime + 0.42)
    } else if (type === 'done') {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(680, ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.2)
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38)
      osc.start(); osc.stop(ctx.currentTime + 0.38)
    } else {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(200, ctx.currentTime)
      gain.gain.setValueAtTime(0.07, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(); osc.stop(ctx.currentTime + 0.3)
    }
    setTimeout(() => ctx.close(), 800)
  } catch { /* AudioContext blocked — no-op */ }
}

// ─── Visual config per state ─────────────────────────────────────────────────

const STATE_CONFIG: Record<VoiceState, {
  bg: string
  orbCore: string
  orbMid: string
  orbOuter: string
  ringColor: string
  glow: (vol: number) => string
  label: string
  sublabel: string
}> = {
  ready: {
    bg:       'radial-gradient(ellipse at 50% 45%, rgba(12,24,58,0.98) 0%, rgba(5,9,20,0.99) 100%)',
    orbCore:  'rgba(41,194,230,0.12)',
    orbMid:   'rgba(41,194,230,0.05)',
    orbOuter: 'rgba(20,100,140,0.03)',
    ringColor: 'rgba(41,194,230,0.06)',
    glow:     () => '0 0 50px rgba(41,194,230,0.1)',
    label:    "I'm here",
    sublabel: 'Tap the orb · or just say "Skippy"',
  },
  listening: {
    bg:       'radial-gradient(ellipse at 50% 40%, rgba(10,28,72,0.97) 0%, rgba(5,9,20,0.99) 100%)',
    orbCore:  'rgba(41,194,230,0.48)',
    orbMid:   'rgba(41,194,230,0.22)',
    orbOuter: 'rgba(20,140,200,0.08)',
    ringColor: 'rgba(41,194,230,0.16)',
    glow:     (v) => `0 0 ${55 + v * 110}px rgba(41,194,230,${0.4 + v * 0.5}), 0 0 130px rgba(41,194,230,0.08)`,
    label:    "I'm listening…",
    sublabel: 'Go ahead — take your time',
  },
  processing: {
    bg:       'radial-gradient(ellipse at 50% 45%, rgba(18,8,48,0.97) 0%, rgba(5,6,22,0.99) 100%)',
    orbCore:  'rgba(124,58,237,0.48)',
    orbMid:   'rgba(139,92,246,0.22)',
    orbOuter: 'rgba(76,29,149,0.08)',
    ringColor: 'rgba(124,58,237,0.16)',
    glow:     () => '0 0 90px rgba(124,58,237,0.55), 0 0 45px rgba(139,92,246,0.22)',
    label:    'Thinking…',
    sublabel: 'Working on it',
  },
  speaking: {
    bg:       'radial-gradient(ellipse at 50% 45%, rgba(4,26,22,0.97) 0%, rgba(4,11,16,0.99) 100%)',
    orbCore:  'rgba(16,185,129,0.42)',
    orbMid:   'rgba(16,185,129,0.18)',
    orbOuter: 'rgba(5,150,105,0.06)',
    ringColor: 'rgba(16,185,129,0.14)',
    glow:     () => '0 0 90px rgba(16,185,129,0.45), 0 0 45px rgba(16,185,129,0.18)',
    label:    'Skippy',
    sublabel: 'Tap to interrupt',
  },
  error: {
    bg:       'radial-gradient(ellipse at center, rgba(24,6,6,0.97) 0%, rgba(5,6,12,0.99) 100%)',
    orbCore:  'rgba(239,68,68,0.32)',
    orbMid:   'rgba(239,68,68,0.12)',
    orbOuter: 'rgba(185,28,28,0.05)',
    ringColor: 'rgba(239,68,68,0.1)',
    glow:     () => '0 0 65px rgba(239,68,68,0.34)',
    label:    'Hmm…',
    sublabel: 'Something went wrong',
  },
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VoiceMode({ onTranscript, chatBusy, autoActivate, className }: VoiceModeProps) {
  // `open` controls fullscreen overlay visibility — SEPARATE from voice state
  const [open, setOpen]               = useState(false)
  const [voiceState, setVoiceState]   = useState<VoiceState>('ready')
  const [transcript, setTranscript]   = useState('')
  const [response, setResponse]       = useState('')
  const [muted, setMuted]             = useState(false)
  const [micAllowed, setMicAllowed]   = useState(true)
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [tick, setTick]               = useState(0)  // drives waveform animation
  const [greeting]                    = useState(getGreeting)

  // ── Refs ──────────────────────────────────────────────────────────────────

  const voiceStateRef   = useRef<VoiceState>('ready')
  const openRef         = useRef(false)
  const mutedRef        = useRef(false)
  const dismissingRef   = useRef(false)
  const wakeBlockRef    = useRef(false)

  const wakeRecogRef    = useRef<SpeechRecognition | null>(null)
  const listenRecogRef  = useRef<SpeechRecognition | null>(null)
  const utteranceRef    = useRef<SpeechSynthesisUtterance | null>(null)
  const streamRef       = useRef<MediaStream | null>(null)
  const animFrameRef    = useRef<number | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loopTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finalTextRef    = useRef('')
  const onTranscriptRef = useRef(onTranscript)
  // Forward-ref so speak/loop callbacks always see the latest startListening
  const startListeningRef = useRef<() => void>(() => {})

  useEffect(() => { voiceStateRef.current = voiceState },  [voiceState])
  useEffect(() => { mutedRef.current = muted },             [muted])
  useEffect(() => { openRef.current = open },               [open])
  useEffect(() => { onTranscriptRef.current = onTranscript }, [onTranscript])

  // Waveform tick — 12fps is plenty for smooth feel
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 80)
    return () => clearInterval(id)
  }, [])

  // ── Volume visualiser ─────────────────────────────────────────────────────

  const stopVolumeAnalysis = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    setVolumeLevel(0)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const startVolumeAnalysis = useCallback((stream: MediaStream) => {
    try {
      const ctx      = new AudioContext()
      const src      = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      const frame = () => {
        if (voiceStateRef.current !== 'listening') return
        const d = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(d)
        const avg = d.reduce((a, b) => a + b, 0) / d.length
        setVolumeLevel(Math.min(1, avg / 65))
        animFrameRef.current = requestAnimationFrame(frame)
      }
      animFrameRef.current = requestAnimationFrame(frame)
    } catch { /* silently skip */ }
  }, [])

  // ── TTS ───────────────────────────────────────────────────────────────────

  const speak = useCallback((text: string, onEnd: () => void) => {
    if (!('speechSynthesis' in window)) { onEnd(); return }
    window.speechSynthesis.cancel()
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1').replace(/#{1,6}\s/g, '')
      .replace(/\n+/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .slice(0, 700)
    const utt = new SpeechSynthesisUtterance(clean)
    utteranceRef.current = utt
    const allVoices = window.speechSynthesis.getVoices()
    const voice =
      allVoices.find(v => /samira|karen|daniel|moira|alex/i.test(v.name) && v.lang.startsWith('en')) ||
      allVoices.find(v => v.lang === 'en-US' && v.localService) ||
      allVoices.find(v => v.lang.startsWith('en'))
    if (voice) utt.voice = voice
    utt.rate = 1.05; utt.pitch = 0.92; utt.volume = 0.9; utt.lang = 'en-US'
    utt.onend = () => onEnd()
    utt.onerror = () => onEnd()
    window.speechSynthesis.speak(utt)
  }, [])

  // ── Stop listening ────────────────────────────────────────────────────────

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    if (maxTimerRef.current)     { clearTimeout(maxTimerRef.current);     maxTimerRef.current = null }
    if (loopTimerRef.current)    { clearTimeout(loopTimerRef.current);    loopTimerRef.current = null }
    stopVolumeAnalysis()
    listenRecogRef.current?.stop()
    listenRecogRef.current = null
  }, [stopVolumeAnalysis])

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel()
    utteranceRef.current = null
  }, [])

  // ── Full dismiss ──────────────────────────────────────────────────────────

  const dismiss = useCallback(() => {
    dismissingRef.current = true
    wakeBlockRef.current  = false
    stopListening()
    stopSpeaking()
    setOpen(false)
    setVoiceState('ready')
    setTranscript('')
    setResponse('')
    setTimeout(() => { dismissingRef.current = false }, 1200)
    // Restart wake-word listener after dismiss (it was stopped due to wakeBlock)
    setTimeout(() => {
      if (wakeRecogRef.current) {
        try { wakeRecogRef.current.start() } catch { /* already running */ }
      }
    }, 1500)
  }, [stopListening, stopSpeaking])

  // ── Active listening ──────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      setVoiceState('error')
      setTimeout(() => { setVoiceState('ready') }, 4000)
      return
    }
    if (dismissingRef.current) return

    // Stop any previous active session cleanly
    stopVolumeAnalysis()
    if (listenRecogRef.current) {
      listenRecogRef.current.onend = null
      listenRecogRef.current.stop()
      listenRecogRef.current = null
    }

    wakeBlockRef.current = true
    wakeRecogRef.current?.abort()

    finalTextRef.current = ''
    setVoiceState('listening')
    setTranscript('')
    setResponse('')

    const SR = (window.SpeechRecognition || window.webkitSpeechRecognition) as typeof SpeechRecognition
    const recog = new SR()
    recog.continuous     = true
    recog.interimResults = true
    recog.lang           = 'en-US'
    recog.maxAlternatives = 1

    recog.onresult = (event) => {
      if (!openRef.current) return
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        if (r.isFinal) {
          finalTextRef.current += ' ' + r[0].transcript
          // Reset silence timer on each final result
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(() => { recog.stop() }, SILENCE_MS)
        } else {
          interim += r[0].transcript
        }
      }
      setTranscript((finalTextRef.current + (interim ? ' ' + interim : '')).trim())
    }

    recog.onend = async () => {
      stopVolumeAnalysis()
      wakeBlockRef.current = false
      listenRecogRef.current = null

      const text = finalTextRef.current.trim()

      // Nothing said, or overlay closed, or dismissing → go back to ready/wake
      if (!text || !openRef.current || dismissingRef.current) {
        if (openRef.current && !dismissingRef.current) setVoiceState('ready')
        // Restart wake listener
        setTimeout(() => {
          if (!wakeBlockRef.current && wakeRecogRef.current) {
            try { wakeRecogRef.current.start() } catch { /* already running */ }
          }
        }, 600)
        return
      }

      setVoiceState('processing')

      try {
        const aiResponse = await onTranscriptRef.current(text)
        setResponse(aiResponse)
        playChime('done')

        if (mutedRef.current || !aiResponse) {
          // Muted — skip TTS, loop back
          setVoiceState('ready')
          loopTimerRef.current = setTimeout(() => {
            if (!dismissingRef.current && openRef.current) startListeningRef.current()
          }, LOOP_PAUSE_MS)
        } else {
          setVoiceState('speaking')
          speak(aiResponse, () => {
            if (dismissingRef.current || !openRef.current) return
            // ── CONTINUOUS LOOP: after speaking, restart listening ──
            setVoiceState('ready')
            loopTimerRef.current = setTimeout(() => {
              if (!dismissingRef.current && openRef.current) startListeningRef.current()
            }, LOOP_PAUSE_MS)
          })
        }
      } catch {
        setVoiceState('error')
        playChime('error')
        // Recover: go back to ready after error
        setTimeout(() => {
          if (openRef.current && !dismissingRef.current) {
            setVoiceState('ready')
          }
        }, 3500)
      }
    }

    recog.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed') {
        setMicAllowed(false)
        setVoiceState('error')
      } else if (e.error !== 'aborted') {
        // Non-fatal: will trigger onend and recover
        console.warn('SpeechRecognition error:', e.error)
      }
    }

    listenRecogRef.current = recog
    recog.start()

    // Volume analysis (best-effort, requires getUserMedia)
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } })
      .then(s => { streamRef.current = s; startVolumeAnalysis(s) })
      .catch(() => { /* continue without volume viz */ })

    // Initial silence timeout — if nothing said in 7s, give up and go ready
    silenceTimerRef.current = setTimeout(() => recog.stop(), 7000)
    maxTimerRef.current     = setTimeout(() => recog.stop(), MAX_LISTEN_MS)
  }, [speak, stopVolumeAnalysis, startVolumeAnalysis])

  // Keep startListeningRef current
  useEffect(() => { startListeningRef.current = startListening }, [startListening])

  // ── Wake-word listener ────────────────────────────────────────────────────

  const startWakeListener = useCallback(() => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) return
    if (wakeRecogRef.current) return // already running

    const SR = (window.SpeechRecognition || window.webkitSpeechRecognition) as typeof SpeechRecognition
    const recog = new SR()
    recog.continuous     = true
    recog.interimResults = true
    recog.lang           = 'en-US'
    recog.maxAlternatives = 1
    let window6 = ''

    recog.onresult = (event) => {
      if (wakeBlockRef.current || voiceStateRef.current !== 'ready') return
      if (openRef.current) return // already open — VoiceMode is handling it
      const latest = event.results[event.results.length - 1]
      const word   = latest[0].transcript.toLowerCase().trim()
      window6 = (window6 + ' ' + word).split(' ').slice(-6).join(' ')
      if (WAKE_WORDS.some(w => window6.includes(w))) {
        window6 = ''
        // Open overlay and start listening
        setOpen(true)
        playChime('wake')
        setTimeout(() => startListeningRef.current(), 350)
      }
    }

    recog.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed') setMicAllowed(false)
    }

    recog.onend = () => {
      wakeRecogRef.current = null
      if (!wakeBlockRef.current) {
        // Restart automatically
        setTimeout(() => startWakeListener(), 400)
      }
    }

    wakeRecogRef.current = recog
    try { recog.start() } catch { wakeRecogRef.current = null }
  }, [])

  // ── Mount / unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    startWakeListener()
    return () => {
      dismissingRef.current = true
      wakeBlockRef.current  = true
      wakeRecogRef.current?.abort(); wakeRecogRef.current = null
      listenRecogRef.current?.abort(); listenRecogRef.current = null
      stopSpeaking(); stopVolumeAnalysis()
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (maxTimerRef.current)     clearTimeout(maxTimerRef.current)
      if (loopTimerRef.current)    clearTimeout(loopTimerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── autoActivate (from ?voice=1 URL param) ────────────────────────────────

  useEffect(() => {
    if (!autoActivate) return
    const t = setTimeout(() => {
      if (!dismissingRef.current) {
        setOpen(true)
        playChime('wake')
        setTimeout(() => startListeningRef.current(), 400)
      }
    }, 600)
    return () => clearTimeout(t)
  }, [autoActivate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Manual activate (mic button tap) ─────────────────────────────────────

  const manualActivate = useCallback(() => {
    if (chatBusy) return
    if (open) {
      // If already open and in speaking state → interrupt; otherwise dismiss
      if (voiceState === 'speaking') { stopSpeaking(); startListeningRef.current() }
      else dismiss()
      return
    }
    setOpen(true)
    playChime('wake')
    setTimeout(() => startListeningRef.current(), 250)
  }, [chatBusy, open, voiceState, stopSpeaking, dismiss])

  // Tap orb in "ready" state → start listening
  const orbTap = useCallback(() => {
    if (voiceState === 'ready')    startListeningRef.current()
    if (voiceState === 'speaking') { stopSpeaking(); startListeningRef.current() }
    if (voiceState === 'listening') stopListening()
  }, [voiceState, stopListening, stopSpeaking])

  // ── Waveform bars (animated via `tick`) ───────────────────────────────────

  const bars = Array.from({ length: 9 }, (_, i) => {
    const phase = (tick * 0.4 + i * 0.8) % (Math.PI * 2)
    const base  = voiceState === 'listening' ? 4 + Math.sin(phase) * volumeLevel * 20 + volumeLevel * 12 : 2
    return Math.max(2, base)
  })

  const cfg = STATE_CONFIG[voiceState]

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Mic button in the chat input toolbar ── */}
      <button
        onClick={manualActivate}
        disabled={!!chatBusy}
        title="Tap to talk · or say Skip / Skippy"
        className={cn(
          'relative flex items-center justify-center rounded-full transition-all duration-200 group',
          'w-10 h-10 border',
          chatBusy
            ? 'opacity-30 cursor-not-allowed border-border'
            : 'border-accent/40 hover:border-accent/80 hover:bg-accent/10 active:scale-95 cursor-pointer',
          className,
        )}
        style={voiceState === 'listening' ? {
          boxShadow:   `0 0 ${14 + volumeLevel * 24}px rgba(41,194,230,${0.4 + volumeLevel * 0.5})`,
          borderColor: `rgba(41,194,230,${0.65 + volumeLevel * 0.35})`,
        } : {}}
      >
        {voiceState === 'processing'
          ? <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
          : voiceState === 'speaking'
          ? <Volume2 className="w-4 h-4 text-emerald-400" />
          : (voiceState === 'listening')
          ? <Mic className="w-4 h-4 text-accent animate-pulse" />
          : <Mic className="w-4 h-4 text-muted group-hover:text-accent transition-colors" />
        }
        {micAllowed && !open && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent/70 animate-pulse" />
        )}
      </button>

      {/* ── Fullscreen voice overlay — stays open until explicitly dismissed ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="voice-space"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.3 } }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 flex flex-col items-center justify-between overflow-hidden select-none touch-none"
            style={{ zIndex: 200, background: cfg.bg }}
          >
            {/* Dot grid */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(circle, rgba(41,194,230,0.055) 1px, transparent 1px)',
                backgroundSize: '38px 38px',
                maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
                WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
              }}
            />

            {/* ── Top bar ── */}
            <div className="relative z-10 w-full flex items-start justify-between px-5 pt-safe" style={{ paddingTop: 'max(env(safe-area-inset-top), 20px)' }}>
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'rgba(41,194,230,0.5)' }}>
                  {greeting}
                </p>
                <p className="font-black text-xl text-foreground/90 tracking-tight leading-tight mt-0.5">
                  Skippy
                </p>
                <p className="text-[10px] mt-1 font-medium" style={{ color: 'rgba(100,116,139,0.5)' }}>
                  Voice processed locally · nothing leaves your device
                </p>
              </motion.div>

              <motion.button
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.08 }}
                onClick={dismiss}
                className="mt-1 p-2.5 rounded-full transition-all active:scale-90 flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <X className="w-4 h-4 text-muted" />
              </motion.button>
            </div>

            {/* ── Orb area ── */}
            <div className="relative flex-1 flex items-center justify-center w-full">

              {/* Outer haze */}
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{ width: 360, height: 360, background: cfg.orbOuter }}
                animate={{ scale: [1, 1.07, 1], opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
              />

              {/* Pulsing rings — listening + speaking */}
              <AnimatePresence>
                {(voiceState === 'listening' || voiceState === 'speaking') &&
                  [0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="absolute rounded-full pointer-events-none"
                      initial={{ scale: 0.82, opacity: 0 }}
                      animate={{
                        scale: voiceState === 'listening'
                          ? [1, 1 + volumeLevel * 0.2 + 0.06 + i * 0.05, 1]
                          : [1, 1.07 + i * 0.05, 1],
                        opacity: [0.3, 0.6, 0.3],
                      }}
                      exit={{ scale: 0.82, opacity: 0, transition: { duration: 0.3 } }}
                      transition={{ duration: 1.9 + i * 0.55, repeat: Infinity, ease: 'easeInOut', delay: i * 0.28 }}
                      style={{
                        width:  230 + i * 55,
                        height: 230 + i * 55,
                        border: `1px solid ${cfg.ringColor}`,
                      }}
                    />
                  ))
                }
              </AnimatePresence>

              {/* Mid glow */}
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{ width: 255, height: 255, background: cfg.orbMid }}
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              />

              {/* Core orb — tappable */}
              <motion.div
                onClick={orbTap}
                className="relative flex items-center justify-center rounded-full cursor-pointer"
                style={{
                  width:  195,
                  height: 195,
                  background: cfg.orbCore,
                  boxShadow:  cfg.glow(volumeLevel),
                  backdropFilter: 'blur(2px)',
                }}
                whileTap={{ scale: 0.94 }}
                animate={
                  voiceState === 'processing'
                    ? { rotate: 360 }
                    : voiceState === 'listening'
                    ? { scale: [1, 1 + volumeLevel * 0.12 + 0.025, 1] }
                    : { scale: [1, 1.04, 1] }
                }
                transition={
                  voiceState === 'processing'
                    ? { duration: 3.5, repeat: Infinity, ease: 'linear' }
                    : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }
                }
              >
                {/* Radial highlight */}
                <div className="absolute inset-0 rounded-full" style={{
                  background: 'radial-gradient(circle at 38% 32%, rgba(255,255,255,0.13) 0%, transparent 55%)',
                }} />

                {/* State icon */}
                <div className="relative z-10">
                  {voiceState === 'processing'
                    ? <Zap     className="w-14 h-14 text-violet-300  drop-shadow-lg" />
                    : voiceState === 'speaking'
                    ? <Volume2 className="w-14 h-14 text-emerald-300 drop-shadow-lg" />
                    : voiceState === 'error'
                    ? <MicOff  className="w-14 h-14 text-red-300     drop-shadow-lg" />
                    : <Mic     className="w-14 h-14 text-accent       drop-shadow-lg" />
                  }
                </div>

                {/* Waveform bars (listening only) */}
                {voiceState === 'listening' && (
                  <div className="absolute bottom-9 flex items-end gap-[3px]">
                    {bars.map((h, i) => (
                      <div
                        key={i}
                        style={{
                          width: 3,
                          height: `${h}px`,
                          borderRadius: 9999,
                          background: `rgba(41,194,230,${0.5 + volumeLevel * 0.5})`,
                          transition: 'height 80ms ease',
                        }}
                      />
                    ))}
                  </div>
                )}
              </motion.div>

              {/* State label */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={voiceState}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="absolute text-center pointer-events-none"
                  style={{ top: 'calc(50% + 112px)' }}
                >
                  <p className="text-xl font-bold text-foreground/90 leading-tight">{cfg.label}</p>
                  <p className="text-xs text-muted/55 mt-1 leading-snug">{cfg.sublabel}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* ── Conversation cards ── */}
            <div className="relative z-10 w-full px-5 pb-2 flex flex-col gap-2 max-w-md mx-auto">
              <AnimatePresence>
                {transcript && (
                  <motion.div
                    key="transcript"
                    initial={{ opacity: 0, y: 10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-4 py-3 rounded-2xl text-sm text-foreground/90 leading-relaxed"
                    style={{
                      background: 'rgba(12,28,70,0.75)',
                      border: '1px solid rgba(41,194,230,0.18)',
                      backdropFilter: 'blur(14px)',
                    }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest mr-2 opacity-50">You</span>
                    {transcript}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {response && voiceState !== 'processing' && (
                  <motion.div
                    key="response"
                    initial={{ opacity: 0, y: 10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-4 py-3 rounded-2xl text-sm text-foreground/90 leading-relaxed"
                    style={{
                      background: 'rgba(4,24,20,0.75)',
                      border: '1px solid rgba(16,185,129,0.2)',
                      backdropFilter: 'blur(14px)',
                    }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest mr-2" style={{ color: 'rgba(16,185,129,0.65)' }}>Skippy</span>
                    {response.slice(0, 280)}{response.length > 280 ? '…' : ''}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Controls ── */}
            <div
              className="relative z-10 w-full px-5 pt-3 flex flex-col items-center gap-3"
              style={{
                borderTop: '1px solid rgba(255,255,255,0.05)',
                paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
              }}
            >
              <div className="flex items-center gap-3">
                {voiceState === 'speaking' && (
                  <button
                    onClick={() => { stopSpeaking(); startListeningRef.current() }}
                    className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
                    style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }}>
                    Skip · listen
                  </button>
                )}
                {(voiceState === 'listening') && (
                  <button
                    onClick={() => { stopListening(); setVoiceState('ready') }}
                    className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
                    style={{ background: 'rgba(41,194,230,0.1)', border: '1px solid rgba(41,194,230,0.3)', color: '#7dd3e8' }}>
                    Done talking
                  </button>
                )}
                {voiceState === 'ready' && (
                  <button
                    onClick={() => startListeningRef.current()}
                    className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
                    style={{ background: 'rgba(41,194,230,0.1)', border: '1px solid rgba(41,194,230,0.25)', color: '#7dd3e8' }}>
                    Tap to speak
                  </button>
                )}
                <button
                  onClick={() => setMuted(m => !m)}
                  className="p-2.5 rounded-full transition-all active:scale-95"
                  title={muted ? 'Unmute Skippy' : "Mute Skippy's voice"}
                  style={{
                    background: muted ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${muted ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    color: muted ? '#fca5a5' : 'rgba(148,163,184,0.6)',
                  }}>
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}


// ─── Types ────────────────────────────────────────────────────────────────────

