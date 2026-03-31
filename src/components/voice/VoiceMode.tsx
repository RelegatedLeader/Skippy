'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, X, Loader2, Volume2, VolumeX, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type VoiceState = 'idle' | 'waking' | 'listening' | 'processing' | 'speaking' | 'error'

interface VoiceModeProps {
  onTranscript: (text: string) => Promise<string>
  chatBusy?: boolean
  autoActivate?: boolean
  className?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVATION_PHRASES = ['skippy', 'hey skippy', 'ok skippy', 'yo skippy', 'skipy']
const SILENCE_MS    = 2200
const MAX_LISTEN_MS = 30_000

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours()
  if (h < 5)  return "Still up?"
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  if (h < 21) return "Good evening"
  return "Hey, still up?"
}

function playActivationChime(type: 'wake' | 'done' | 'error') {
  try {
    const ctx  = new AudioContext()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    if (type === 'wake') {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(440, ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(660, ctx.currentTime + 0.15)
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(); osc.stop(ctx.currentTime + 0.4)
    } else if (type === 'done') {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(660, ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.18)
      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      osc.start(); osc.stop(ctx.currentTime + 0.35)
    } else {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(220, ctx.currentTime)
      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(); osc.stop(ctx.currentTime + 0.3)
    }
    setTimeout(() => ctx.close(), 700)
  } catch { /* AudioContext may be blocked */ }
}

// State-driven visual config
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
  idle: {
    bg:       'radial-gradient(ellipse at center, rgba(10,20,50,0.98) 0%, rgba(6,10,20,0.99) 100%)',
    orbCore:  'rgba(41,194,230,0.15)',
    orbMid:   'rgba(41,194,230,0.06)',
    orbOuter: 'rgba(20,100,140,0.04)',
    ringColor: 'rgba(41,194,230,0.08)',
    glow:     () => '0 0 40px rgba(41,194,230,0.08)',
    label:    'Say "Skippy"',
    sublabel: 'I\'m listening for you',
  },
  waking: {
    bg:       'radial-gradient(ellipse at center, rgba(20,30,70,0.97) 0%, rgba(8,12,28,0.99) 100%)',
    orbCore:  'rgba(251,191,36,0.3)',
    orbMid:   'rgba(41,194,230,0.2)',
    orbOuter: 'rgba(124,58,237,0.1)',
    ringColor: 'rgba(251,191,36,0.2)',
    glow:     () => '0 0 80px rgba(251,191,36,0.3), 0 0 40px rgba(41,194,230,0.2)',
    label:    'Skippy is here',
    sublabel: 'Opening up…',
  },
  listening: {
    bg:       'radial-gradient(ellipse at 50% 40%, rgba(15,35,80,0.97) 0%, rgba(6,10,20,0.99) 100%)',
    orbCore:  'rgba(41,194,230,0.45)',
    orbMid:   'rgba(41,194,230,0.2)',
    orbOuter: 'rgba(20,140,200,0.08)',
    ringColor: 'rgba(41,194,230,0.15)',
    glow:     (v) => `0 0 ${60 + v * 100}px rgba(41,194,230,${0.35 + v * 0.45}), 0 0 120px rgba(41,194,230,0.1)`,
    label:    'Listening…',
    sublabel: 'Go ahead, I\'m all ears',
  },
  processing: {
    bg:       'radial-gradient(ellipse at 50% 45%, rgba(20,10,50,0.97) 0%, rgba(6,8,22,0.99) 100%)',
    orbCore:  'rgba(124,58,237,0.45)',
    orbMid:   'rgba(139,92,246,0.2)',
    orbOuter: 'rgba(76,29,149,0.08)',
    ringColor: 'rgba(124,58,237,0.15)',
    glow:     () => '0 0 80px rgba(124,58,237,0.5), 0 0 40px rgba(139,92,246,0.2)',
    label:    'Thinking…',
    sublabel: 'Working on it',
  },
  speaking: {
    bg:       'radial-gradient(ellipse at 50% 45%, rgba(5,30,25,0.97) 0%, rgba(6,12,18,0.99) 100%)',
    orbCore:  'rgba(16,185,129,0.4)',
    orbMid:   'rgba(16,185,129,0.18)',
    orbOuter: 'rgba(5,150,105,0.06)',
    ringColor: 'rgba(16,185,129,0.12)',
    glow:     () => '0 0 80px rgba(16,185,129,0.4), 0 0 40px rgba(16,185,129,0.15)',
    label:    'Speaking…',
    sublabel: 'Here\'s what I found',
  },
  error: {
    bg:       'radial-gradient(ellipse at center, rgba(25,8,8,0.97) 0%, rgba(6,8,12,0.99) 100%)',
    orbCore:  'rgba(239,68,68,0.3)',
    orbMid:   'rgba(239,68,68,0.12)',
    orbOuter: 'rgba(185,28,28,0.05)',
    ringColor: 'rgba(239,68,68,0.1)',
    glow:     () => '0 0 60px rgba(239,68,68,0.3)',
    label:    'Hmm…',
    sublabel: 'Something went wrong',
  },
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VoiceMode({ onTranscript, chatBusy, autoActivate, className }: VoiceModeProps) {
  const [state, setState]             = useState<VoiceState>('idle')
  const [transcript, setTranscript]   = useState('')
  const [response, setResponse]       = useState('')
  const [errorMsg, setErrorMsg]       = useState('')
  const [muted, setMuted]             = useState(false)
  const [visible, setVisible]         = useState(false)
  const [wakeEnabled, setWakeEnabled] = useState(true)
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [greeting]                    = useState(getGreeting)

  const wakeRecogRef    = useRef<SpeechRecognition | null>(null)
  const listenRecogRef  = useRef<SpeechRecognition | null>(null)
  const utteranceRef    = useRef<SpeechSynthesisUtterance | null>(null)
  const streamRef       = useRef<MediaStream | null>(null)
  const animFrameRef    = useRef<number | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finalTextRef    = useRef<string>('')
  const stateRef        = useRef<VoiceState>('idle')
  const mutedRef        = useRef(false)
  const wakeBlockRef    = useRef(false)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { mutedRef.current = muted }, [muted])

  // ── Volume visualiser ─────────────────────────────────────────────────────

  const startVolumeAnalysis = useCallback((stream: MediaStream) => {
    try {
      const ctx     = new AudioContext()
      const source  = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const tick = () => {
        if (stateRef.current !== 'listening') return
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setVolumeLevel(Math.min(1, avg / 70))
        animFrameRef.current = requestAnimationFrame(tick)
      }
      animFrameRef.current = requestAnimationFrame(tick)
    } catch { /* no-op */ }
  }, [])

  const stopVolumeAnalysis = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    setVolumeLevel(0)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  // ── TTS ───────────────────────────────────────────────────────────────────

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!('speechSynthesis' in window)) { onEnd?.(); return }
    window.speechSynthesis.cancel()
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1').replace(/#{1,6}\s/g, '')
      .replace(/\n+/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .slice(0, 600)
    const utt = new SpeechSynthesisUtterance(clean)
    utteranceRef.current = utt
    const voices = window.speechSynthesis.getVoices()
    const preferred =
      voices.find(v => /samira|karen|daniel|moira|alex|siri/i.test(v.name) && v.lang.startsWith('en')) ||
      voices.find(v => v.lang === 'en-US' && v.localService) ||
      voices.find(v => v.lang.startsWith('en'))
    if (preferred) utt.voice = preferred
    utt.rate = 1.05; utt.pitch = 0.92; utt.volume = 0.88; utt.lang = 'en-US'
    utt.onend = () => onEnd?.(); utt.onerror = () => onEnd?.()
    window.speechSynthesis.speak(utt)
  }, [])

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel()
    utteranceRef.current = null
    setState('idle'); setVisible(false)
  }, [])

  // ── Active listening ──────────────────────────────────────────────────────

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current)
    stopVolumeAnalysis()
    listenRecogRef.current?.stop()
    listenRecogRef.current = null
  }, [stopVolumeAnalysis])

  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => { onTranscriptRef.current = onTranscript }, [onTranscript])

  const startListening = useCallback(() => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      setErrorMsg('Speech recognition not supported in this browser')
      setState('error')
      setTimeout(() => { setState('idle'); setVisible(false) }, 4000)
      return
    }
    wakeBlockRef.current = true
    wakeRecogRef.current?.stop()
    finalTextRef.current = ''
    setState('listening'); setTranscript(''); setResponse(''); setErrorMsg('')

    const SR = (window.SpeechRecognition || window.webkitSpeechRecognition) as typeof SpeechRecognition
    const recog = new SR()
    recog.continuous = true; recog.interimResults = true
    recog.lang = 'en-US'; recog.maxAlternatives = 1

    recog.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        if (r.isFinal) {
          finalTextRef.current += ' ' + r[0].transcript
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(() => recog.stop(), SILENCE_MS)
        } else { interim += r[0].transcript }
      }
      setTranscript((finalTextRef.current + (interim ? ' ' + interim : '')).trim())
    }

    recog.onend = async () => {
      stopVolumeAnalysis()
      listenRecogRef.current = null
      wakeBlockRef.current = false
      setTimeout(() => {
        if (wakeRecogRef.current && stateRef.current !== 'listening') {
          try { wakeRecogRef.current.start() } catch { /* already running */ }
        }
      }, 800)
      const text = finalTextRef.current.trim()
      if (!text || stateRef.current === 'idle') return
      setState('processing')
      try {
        const aiResponse = await onTranscriptRef.current(text)
        setResponse(aiResponse); playActivationChime('done')
        if (!mutedRef.current && aiResponse) {
          setState('speaking')
          speak(aiResponse, () => { setState('idle'); setTimeout(() => setVisible(false), 1800) })
        } else {
          setState('idle'); setTimeout(() => setVisible(false), 2500)
        }
      } catch {
        setErrorMsg('Something went wrong')
        setState('error'); playActivationChime('error')
        setTimeout(() => { setState('idle'); setVisible(false) }, 4000)
      }
    }

    recog.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed') {
        setWakeEnabled(false); setErrorMsg('Microphone access denied')
        setState('error'); setTimeout(() => { setState('idle'); setVisible(false) }, 4000)
      }
    }

    listenRecogRef.current = recog
    recog.start()
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then(s => { streamRef.current = s; startVolumeAnalysis(s) })
      .catch(() => {})
    silenceTimerRef.current = setTimeout(() => recog.stop(), SILENCE_MS + 1500)
    maxTimerRef.current = setTimeout(() => recog.stop(), MAX_LISTEN_MS)
  }, [speak, stopVolumeAnalysis, startVolumeAnalysis])

  // ── Wake-word detection ────────────────────────────────────────────────────

  const startWakeWordListener = useCallback(() => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) return
    const SR = (window.SpeechRecognition || window.webkitSpeechRecognition) as typeof SpeechRecognition
    const recog = new SR()
    recog.continuous = true; recog.interimResults = true
    recog.lang = 'en-US'; recog.maxAlternatives = 1
    let slidingWindow = ''

    recog.onresult = (event) => {
      if (stateRef.current !== 'idle' || chatBusy) return
      const latest = event.results[event.results.length - 1]
      const word = latest[0].transcript.toLowerCase().trim()
      slidingWindow = (slidingWindow + ' ' + word).split(' ').slice(-6).join(' ')
      if (ACTIVATION_PHRASES.some(p => slidingWindow.includes(p))) {
        slidingWindow = ''
        if (!wakeEnabled) return
        setState('waking'); setVisible(true); playActivationChime('wake')
        setTimeout(() => { if (stateRef.current === 'waking') startListening() }, 450)
      }
    }

    recog.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed') setWakeEnabled(false)
    }

    recog.onend = () => {
      if (wakeBlockRef.current) return
      if (stateRef.current === 'idle') {
        setTimeout(() => { try { recog.start() } catch { /* already started */ } }, 500)
      }
    }

    wakeRecogRef.current = recog
    try { recog.start() } catch { /* permission denied */ }
  }, [chatBusy, wakeEnabled, startListening])

  useEffect(() => {
    startWakeWordListener()
    return () => {
      wakeBlockRef.current = true
      wakeRecogRef.current?.stop(); wakeRecogRef.current = null
      listenRecogRef.current?.stop(); listenRecogRef.current = null
      stopSpeaking(); stopVolumeAnalysis()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoActivate) return
    const t = setTimeout(() => {
      if (stateRef.current === 'idle') {
        setState('waking'); setVisible(true); playActivationChime('wake')
        setTimeout(() => { if (stateRef.current === 'waking') startListening() }, 450)
      }
    }, 800)
    return () => clearTimeout(t)
  }, [autoActivate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dismiss / manual ──────────────────────────────────────────────────────

  const dismiss = useCallback(() => {
    stopListening(); stopSpeaking()
    setState('idle'); setVisible(false)
    setTranscript(''); setResponse(''); setErrorMsg('')
  }, [stopListening, stopSpeaking])

  const manualActivate = useCallback(() => {
    if (state !== 'idle' || chatBusy) return
    setState('waking'); setVisible(true); playActivationChime('wake')
    setTimeout(() => { if (stateRef.current === 'waking') startListening() }, 350)
  }, [state, chatBusy, startListening])

  // ── Render ────────────────────────────────────────────────────────────────

  const cfg     = STATE_CONFIG[state]
  const isActive = visible && state !== 'idle'

  // Waveform bar heights — 9 bars, organic feel
  const bars = Array.from({ length: 9 }, (_, i) => {
    const phase = (Date.now() / 250 + i * 0.7) % (Math.PI * 2)
    return Math.max(3, 4 + Math.sin(phase) * volumeLevel * 18 + volumeLevel * 10)
  })

  return (
    <>
      {/* ── Mic button in chat toolbar ── */}
      <button
        onClick={manualActivate}
        disabled={!!chatBusy || (state !== 'idle' && state !== 'error')}
        title={wakeEnabled ? 'Tap to speak, or say "Skippy"' : 'Tap to speak'}
        className={cn(
          'relative flex items-center justify-center rounded-full transition-all duration-300 group',
          'w-10 h-10 border',
          chatBusy || (state !== 'idle' && state !== 'error')
            ? 'opacity-30 cursor-not-allowed border-border'
            : 'border-accent/40 hover:border-accent/80 hover:bg-accent/10 active:scale-95 cursor-pointer',
          className
        )}
        style={state === 'listening' ? {
          boxShadow: `0 0 ${14 + volumeLevel * 24}px rgba(41,194,230,${0.35 + volumeLevel * 0.5})`,
          borderColor: `rgba(41,194,230,${0.6 + volumeLevel * 0.4})`,
        } : {}}
      >
        {state === 'processing' ? <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
        : state === 'speaking'  ? <Volume2 className="w-4 h-4 text-emerald-400" />
        : (state === 'listening' || state === 'waking') ? <Mic className="w-4 h-4 text-accent animate-pulse" />
        : <Mic className="w-4 h-4 text-muted group-hover:text-accent transition-colors" />}
        {wakeEnabled && state === 'idle' && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent/70 animate-pulse" />
        )}
      </button>

      {/* ── Full-screen voice space ── */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            key="voice-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            transition={{ duration: 0.35 }}
            className="fixed inset-0 flex flex-col items-center justify-between overflow-hidden select-none"
            style={{
              // z-[200] sits above MobileBottomNav's z-[150]
              zIndex: 200,
              background: cfg.bg,
            }}
          >
            {/* ── Ambient particles (CSS only, no JS) ── */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(circle, rgba(41,194,230,0.06) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
                maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
                WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
              }}
            />

            {/* ── Top bar ── */}
            <div className="relative z-10 w-full flex items-center justify-between px-5 pt-safe pt-5">
              {/* Greeting */}
              <motion.div
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
              >
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(41,194,230,0.5)' }}>
                  {greeting}
                </p>
                <p className="font-display font-black text-lg text-foreground tracking-tight leading-tight">
                  Skippy
                </p>
              </motion.div>

              {/* Close */}
              <motion.button
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                onClick={dismiss}
                className="p-2.5 rounded-full transition-all active:scale-90"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <X className="w-4 h-4 text-muted" />
              </motion.button>
            </div>

            {/* ── Orb ── */}
            <div className="relative flex-1 flex items-center justify-center w-full">

              {/* Outer ambient glow */}
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{ width: 380, height: 380, background: cfg.orbOuter }}
                animate={{ scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
              />

              {/* Pulsing rings — only during listening/speaking */}
              <AnimatePresence>
                {(state === 'listening' || state === 'speaking') && (
                  <>
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="absolute rounded-full pointer-events-none"
                        initial={{ scale: 0.85, opacity: 0 }}
                        animate={{
                          scale: state === 'listening'
                            ? [1, 1 + volumeLevel * 0.18 + 0.06 + i * 0.04, 1]
                            : [1, 1.06 + i * 0.04, 1],
                          opacity: [0.35, 0.7, 0.35],
                        }}
                        exit={{ scale: 0.85, opacity: 0 }}
                        transition={{ duration: 1.8 + i * 0.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.25 }}
                        style={{
                          width:  240 + i * 52,
                          height: 240 + i * 52,
                          border: `1px solid ${cfg.ringColor}`,
                        }}
                      />
                    ))}
                  </>
                )}
              </AnimatePresence>

              {/* Mid glow layer */}
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{ width: 260, height: 260, background: cfg.orbMid }}
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              />

              {/* Core orb */}
              <motion.div
                className="relative flex items-center justify-center rounded-full"
                style={{
                  width:  200,
                  height: 200,
                  background: cfg.orbCore,
                  boxShadow: cfg.glow(volumeLevel),
                  backdropFilter: 'blur(2px)',
                }}
                animate={
                  state === 'processing' ? { rotate: 360 }
                  : state === 'listening'
                  ? { scale: [1, 1 + volumeLevel * 0.1 + 0.02, 1] }
                  : { scale: [1, 1.04, 1] }
                }
                transition={
                  state === 'processing'
                    ? { duration: 4, repeat: Infinity, ease: 'linear' }
                    : { duration: 2, repeat: Infinity, ease: 'easeInOut' }
                }
              >
                {/* Inner radial highlight */}
                <div className="absolute inset-0 rounded-full" style={{
                  background: 'radial-gradient(circle at 38% 32%, rgba(255,255,255,0.12) 0%, transparent 55%)',
                }} />

                {/* Icon */}
                <div className="relative z-10">
                  {state === 'processing' ? <Zap     className="w-14 h-14 text-violet-300 drop-shadow-lg" />
                  : state === 'speaking'  ? <Volume2 className="w-14 h-14 text-emerald-300 drop-shadow-lg" />
                  : state === 'error'     ? <MicOff  className="w-14 h-14 text-red-300 drop-shadow-lg" />
                  :                        <Mic     className="w-14 h-14 text-accent drop-shadow-lg" />}
                </div>

                {/* Volume waveform bars (listening only) */}
                {state === 'listening' && (
                  <div className="absolute bottom-9 flex items-end gap-[3px]">
                    {bars.map((h, i) => (
                      <motion.div
                        key={i}
                        className="rounded-full"
                        animate={{ height: `${h}px` }}
                        transition={{ duration: 0.08 }}
                        style={{
                          width: 3,
                          background: `rgba(41,194,230,${0.5 + volumeLevel * 0.5})`,
                          borderRadius: 9999,
                        }}
                      />
                    ))}
                  </div>
                )}
              </motion.div>

              {/* State label below orb */}
              <motion.div
                key={state}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="absolute text-center"
                style={{ bottom: 'calc(50% - 160px)' }}
              >
                <p className="text-xl font-bold text-foreground/90">{cfg.label}</p>
                <p className="text-xs text-muted/60 mt-0.5">{cfg.sublabel}</p>
              </motion.div>
            </div>

            {/* ── Transcript cards ── */}
            <div className="relative z-10 w-full px-5 pb-2 flex flex-col gap-2 max-w-md mx-auto">
              <AnimatePresence>
                {transcript && (
                  <motion.div
                    initial={{ opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="px-4 py-3 rounded-2xl text-sm text-foreground/90 leading-relaxed"
                    style={{
                      background: 'rgba(15,35,75,0.7)',
                      border: '1px solid rgba(41,194,230,0.15)',
                      backdropFilter: 'blur(12px)',
                    }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest mr-2" style={{ color: 'rgba(41,194,230,0.5)' }}>You</span>
                    {transcript}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {response && state !== 'processing' && (
                  <motion.div
                    initial={{ opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-4 py-3 rounded-2xl text-sm text-foreground/90 leading-relaxed"
                    style={{
                      background: 'rgba(5,28,22,0.7)',
                      border: '1px solid rgba(16,185,129,0.18)',
                      backdropFilter: 'blur(12px)',
                    }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest mr-2" style={{ color: 'rgba(16,185,129,0.6)' }}>Skippy</span>
                    {response.slice(0, 220)}{response.length > 220 ? '…' : ''}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Controls + privacy ── */}
            <div
              className="relative z-10 w-full px-5 pb-safe pb-6 pt-3 flex flex-col items-center gap-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
            >
              <div className="flex items-center gap-3">
                {state === 'speaking' && (
                  <button onClick={stopSpeaking}
                    className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
                    style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }}>
                    Stop speaking
                  </button>
                )}
                {(state === 'listening' || state === 'waking') && (
                  <button onClick={stopListening}
                    className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
                    style={{ background: 'rgba(41,194,230,0.1)', border: '1px solid rgba(41,194,230,0.3)', color: '#7dd3e8' }}>
                    Done talking
                  </button>
                )}
                <button
                  onClick={() => setMuted(m => !m)}
                  className="p-2.5 rounded-full transition-all active:scale-95"
                  style={{
                    background: muted ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${muted ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    color: muted ? '#fca5a5' : 'rgba(148,163,184,0.7)',
                  }}
                  title={muted ? 'Unmute' : 'Mute Skippy'}
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>

              <p className="text-[10px] tracking-wide" style={{ color: 'rgba(100,116,139,0.4)' }}>
                Voice processed locally · nothing leaves your device
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
