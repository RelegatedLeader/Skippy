'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { Mic, X, Loader2, Volume2, VolumeX } from 'lucide-react'
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
  glow: string       // solid rgba used as blurred ambient light behind robot
  ringColor: string
  label: string
  sublabel: string
}> = {
  ready: {
    bg:        'radial-gradient(ellipse at 50% 45%, rgba(12,24,58,0.98) 0%, rgba(5,9,20,0.99) 100%)',
    glow:      'rgba(41,194,230,0.18)',
    ringColor: 'rgba(41,194,230,0.08)',
    label:     "I'm here",
    sublabel:  'Tap Skippy · or say "Skippy"',
  },
  listening: {
    bg:        'radial-gradient(ellipse at 50% 40%, rgba(10,28,72,0.97) 0%, rgba(5,9,20,0.99) 100%)',
    glow:      'rgba(41,194,230,0.42)',
    ringColor: 'rgba(41,194,230,0.38)',
    label:     "I'm listening…",
    sublabel:  'Go ahead — take your time',
  },
  processing: {
    bg:        'radial-gradient(ellipse at 50% 45%, rgba(18,8,48,0.97) 0%, rgba(5,6,22,0.99) 100%)',
    glow:      'rgba(124,58,237,0.42)',
    ringColor: 'rgba(124,58,237,0.35)',
    label:     'Thinking…',
    sublabel:  'Working on it',
  },
  speaking: {
    bg:        'radial-gradient(ellipse at 50% 45%, rgba(4,26,22,0.97) 0%, rgba(4,11,16,0.99) 100%)',
    glow:      'rgba(16,185,129,0.38)',
    ringColor: 'rgba(16,185,129,0.35)',
    label:     'Skippy',
    sublabel:  'Tap to interrupt',
  },
  error: {
    bg:        'radial-gradient(ellipse at center, rgba(24,6,6,0.97) 0%, rgba(5,6,12,0.99) 100%)',
    glow:      'rgba(239,68,68,0.28)',
    ringColor: 'rgba(239,68,68,0.22)',
    label:     'Hmm…',
    sublabel:  'Something went wrong',
  },
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VoiceMode({ onTranscript, chatBusy, autoActivate, className }: VoiceModeProps) {
  const [mounted, setMounted]         = useState(false)  // SSR safety for createPortal
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

  // Mount tracking (needed for createPortal — avoids SSR mismatch)
  useEffect(() => setMounted(true), [])

  // Lock html scroll when overlay open — stops iOS chrome / bottom nav bleeding through
  useEffect(() => {
    if (open) {
      document.documentElement.style.setProperty('overflow', 'hidden')
    } else {
      document.documentElement.style.removeProperty('overflow')
    }
    return () => { document.documentElement.style.removeProperty('overflow') }
  }, [open])

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

  // ── TTS — fixed for iOS + async voice loading ─────────────────────────────

  const speak = useCallback((text: string, onEnd: () => void) => {
    if (!('speechSynthesis' in window)) { onEnd(); return }
    window.speechSynthesis.cancel()
    window.speechSynthesis.resume() // iOS: must call resume() before speaking
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1').replace(/#{1,6}\s/g, '')
      .replace(/\n+/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .slice(0, 700)

    let spoken = false
    const doSpeak = () => {
      if (spoken) return
      spoken = true
      const utt = new SpeechSynthesisUtterance(clean)
      utteranceRef.current = utt
      const voices = window.speechSynthesis.getVoices()
      // samantha = warm iOS voice; karen = Android; daniel/moira = UK
      const voice =
        voices.find(v => /samantha|karen|daniel|moira|nicky|tessa/i.test(v.name) && v.lang.startsWith('en')) ||
        voices.find(v => v.lang === 'en-US') ||
        voices.find(v => v.lang.startsWith('en')) ||
        voices[0] || null
      if (voice) utt.voice = voice
      utt.rate = 1.05; utt.pitch = 0.92; utt.volume = 1.0; utt.lang = 'en-US'
      utt.onend  = () => onEnd()
      utt.onerror = () => onEnd()
      window.speechSynthesis.speak(utt)
    }

    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) {
      doSpeak()
    } else {
      // Voices load asynchronously on first page load — wait for them
      let fallback: ReturnType<typeof setTimeout>
      const handler = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', handler)
        clearTimeout(fallback)
        doSpeak()
      }
      window.speechSynthesis.addEventListener('voiceschanged', handler)
      fallback = setTimeout(() => {
        window.speechSynthesis.removeEventListener('voiceschanged', handler)
        doSpeak()
      }, 500)
    }
  }, [])

  // Pre-warm TTS on user gesture — iOS requires gesture context for speechSynthesis
  const prewarmSpeech = useCallback(() => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.getVoices() // kick off async voice list loading
    const utt = new SpeechSynthesisUtterance(' ')
    utt.volume = 0
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
        prewarmSpeech()
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
      if (voiceState === 'speaking') { stopSpeaking(); startListeningRef.current() }
      else dismiss()
      return
    }
    prewarmSpeech() // establish iOS gesture context for TTS
    setOpen(true)
    playChime('wake')
    setTimeout(() => startListeningRef.current(), 250)
  }, [chatBusy, open, voiceState, stopSpeaking, dismiss, prewarmSpeech])

  // Tap orb in "ready" state → start listening
  const orbTap = useCallback(() => {
    if (voiceState === 'ready')    startListeningRef.current()
    if (voiceState === 'speaking') { stopSpeaking(); startListeningRef.current() }
    if (voiceState === 'listening') stopListening()
  }, [voiceState, stopListening, stopSpeaking])

  // ── Waveform bars (animated via `tick`) ───────────────────────────────────

  const bars = Array.from({ length: 11 }, (_, i) => {
    const phase = (tick * 0.4 + i * 0.72) % (Math.PI * 2)
    if (voiceState === 'listening') {
      return Math.max(2, 4 + Math.sin(phase) * volumeLevel * 22 + volumeLevel * 14)
    } else if (voiceState === 'speaking') {
      // Synthetic animation — varied heights to look like natural speech
      return Math.max(3, 5 + Math.sin(phase) * 9 + Math.sin(phase * 1.8 + i * 0.5) * 5)
    }
    return 2
  })

  const cfg = STATE_CONFIG[voiceState]

  // Portaled to document.body — escapes the backdropFilter stacking context
  // in ChatInterface which would otherwise contain position:fixed children.
  const overlayJSX = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="voice-space"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: cfg.bg,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            overscrollBehavior: 'none',
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
            {/* Dot grid */}
          <div
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: 'radial-gradient(circle, rgba(41,194,230,0.055) 1px, transparent 1px)',
              backgroundSize: '38px 38px',
              maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
            }}
          />

          {/* ── Top bar ── */}
          <div style={{ position: 'relative', zIndex: 10, width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0 20px', paddingTop: 'max(env(safe-area-inset-top), 20px)' }}>
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'rgba(41,194,230,0.5)' }}>
                {greeting}
              </p>
              <p className="font-black text-xl text-foreground/90 tracking-tight leading-tight mt-0.5">Skippy</p>
              <p className="text-[10px] mt-1 font-medium" style={{ color: 'rgba(100,116,139,0.5)' }}>
                Voice processed locally · nothing leaves your device
              </p>
            </motion.div>
            <motion.button
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.08 }}
              onClick={dismiss}
              className="mt-1 p-2.5 rounded-full transition-all active:scale-90"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <X className="w-4 h-4 text-muted" />
            </motion.button>
          </div>

          {/* ── Robot + rings + waveform ── */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', gap: 16 }}>

            {/* Ambient glow */}
            <motion.div
              style={{
                position: 'absolute', width: 340, height: 340, borderRadius: '50%',
                background: cfg.glow, filter: 'blur(70px)', pointerEvents: 'none',
              }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Pulsing rings — listening + speaking */}
            <AnimatePresence>
              {(voiceState === 'listening' || voiceState === 'speaking') &&
                [0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    style={{
                      position: 'absolute',
                      width: 220 + i * 60, height: 220 + i * 60,
                      borderRadius: '50%',
                      border: `1.5px solid ${cfg.ringColor}`,
                      pointerEvents: 'none',
                    }}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{
                      scale: voiceState === 'listening'
                        ? [1, 1 + volumeLevel * 0.25 + 0.07 + i * 0.06, 1]
                        : [1, 1.08 + i * 0.06, 1],
                      opacity: [0.2, 0.5, 0.2],
                    }}
                    exit={{ scale: 0.7, opacity: 0, transition: { duration: 0.3 } }}
                    transition={{ duration: 1.8 + i * 0.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
                  />
                ))
              }
            </AnimatePresence>

            {/* Skippy robot — animated per voice state */}
            <motion.div
              onClick={orbTap}
              style={{ position: 'relative', width: 220, height: 220, zIndex: 10, flexShrink: 0, cursor: 'pointer' }}
              animate={
                voiceState === 'processing'
                  ? { scale: [1, 1.04, 1], rotate: [0, -2, 2, -2, 0] }
                  : voiceState === 'speaking'
                  ? { y: [0, -8, 2, -5, 0] }
                  : voiceState === 'listening'
                  ? { scale: [1, 1.06, 1] }
                  : { y: [0, -7, 0] }
              }
              transition={
                voiceState === 'processing'
                  ? { duration: 1.0, repeat: Infinity, ease: 'easeInOut' }
                  : voiceState === 'speaking'
                  ? { duration: 0.45, repeat: Infinity, ease: 'easeInOut' }
                  : voiceState === 'listening'
                  ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }
              }
            >
              <Image
                src="/img/skippyENHANCED3D-removebg.png"
                alt="Skippy"
                width={220}
                height={220}
                priority
                draggable={false}
                style={{
                  userSelect: 'none',
                  filter: voiceState === 'speaking'
                    ? 'drop-shadow(0 0 28px rgba(16,185,129,0.65)) brightness(1.06)'
                    : voiceState === 'listening'
                    ? 'drop-shadow(0 0 22px rgba(41,194,230,0.75)) brightness(1.06)'
                    : voiceState === 'processing'
                    ? 'drop-shadow(0 0 24px rgba(139,92,246,0.7)) brightness(1.03)'
                    : 'drop-shadow(0 0 10px rgba(41,194,230,0.25)) brightness(0.96)',
                  transition: 'filter 0.4s ease',
                }}
              />
            </motion.div>

            {/* Waveform bars — cyan when listening (real volume), green when speaking (synthetic) */}
            <AnimatePresence>
              {(voiceState === 'listening' || voiceState === 'speaking') && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 52, zIndex: 10 }}
                >
                  {bars.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        width: 4,
                        height: `${Math.max(4, h)}px`,
                        borderRadius: 9999,
                        background: voiceState === 'speaking'
                          ? 'rgba(16,185,129,0.88)'
                          : `rgba(41,194,230,${0.5 + volumeLevel * 0.5})`,
                        transition: 'height 80ms ease',
                        alignSelf: 'flex-end',
                      }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* State label */}
            <AnimatePresence mode="wait">
              <motion.div
                key={voiceState}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
                style={{ textAlign: 'center', pointerEvents: 'none', zIndex: 10 }}
              >
                <p className="text-xl font-bold text-foreground/90 leading-tight">{cfg.label}</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(148,163,184,0.55)' }}>{cfg.sublabel}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Conversation cards ── */}
          <div style={{ position: 'relative', zIndex: 10, width: '100%', padding: '0 20px 8px', display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 448 }}>
            <AnimatePresence>
              {transcript && (
                <motion.div
                  key="transcript"
                  initial={{ opacity: 0, y: 10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-4 py-3 rounded-2xl text-sm text-foreground/90 leading-relaxed"
                  style={{ background: 'rgba(12,28,70,0.75)', border: '1px solid rgba(41,194,230,0.18)', backdropFilter: 'blur(14px)' }}
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
                  style={{ background: 'rgba(4,24,20,0.75)', border: '1px solid rgba(16,185,129,0.2)', backdropFilter: 'blur(14px)' }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest mr-2" style={{ color: 'rgba(16,185,129,0.65)' }}>Skippy</span>
                  {response.slice(0, 280)}{response.length > 280 ? '…' : ''}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Controls ── */}
          <div style={{
            position: 'relative', zIndex: 10, width: '100%',
            padding: '12px 20px 0',
            paddingBottom: 'max(env(safe-area-inset-bottom), 28px)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <div className="flex items-center gap-3">
              {voiceState === 'speaking' && (
                <button
                  onClick={() => { stopSpeaking(); startListeningRef.current() }}
                  className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
                  style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }}
                >
                  Skip · listen
                </button>
              )}
              {voiceState === 'listening' && (
                <button
                  onClick={() => { stopListening(); setVoiceState('ready') }}
                  className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
                  style={{ background: 'rgba(41,194,230,0.1)', border: '1px solid rgba(41,194,230,0.3)', color: '#7dd3e8' }}
                >
                  Done talking
                </button>
              )}
              {voiceState === 'ready' && (
                <button
                  onClick={() => startListeningRef.current()}
                  className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
                  style={{ background: 'rgba(41,194,230,0.1)', border: '1px solid rgba(41,194,230,0.25)', color: '#7dd3e8' }}
                >
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
                }}
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

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
          : voiceState === 'listening'
          ? <Mic className="w-4 h-4 text-accent animate-pulse" />
          : <Mic className="w-4 h-4 text-muted group-hover:text-accent transition-colors" />
        }
        {micAllowed && !open && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent/70 animate-pulse" />
        )}
      </button>

      {/* ── Fullscreen overlay — portaled to document.body to escape parent stacking contexts ── */}
      {mounted && createPortal(overlayJSX, document.body)}
    </>
  )
}


