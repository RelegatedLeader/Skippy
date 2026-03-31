'use client'

/**
 * VoiceMode — Skippy's voice interface.
 *
 * Architecture:
 *  1. Passive wake-word listener: polls SpeechRecognition for "skippy"
 *     using a sliding 5-word window (low CPU, browser-native, no cloud).
 *  2. On activation: opens a second SpeechRecognition session to capture
 *     the full utterance — NO audio is ever sent to a server.
 *  3. Transcript is fed into the chat pipeline (Grok / Claude) as plain text.
 *  4. AI response is read aloud via Web Speech API (SpeechSynthesis).
 *  5. Visual: animated orb with listening / thinking / speaking states.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, X, Loader2, Volume2, VolumeX, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type VoiceState =
  | 'idle'
  | 'waking'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error'

interface VoiceModeProps {
  onTranscript: (text: string) => Promise<string>
  chatBusy?: boolean
  /** If true, trigger voice activation automatically on first mount (e.g. from ?voice=1 URL) */
  autoActivate?: boolean
  className?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVATION_PHRASES = ['skippy', 'hey skippy', 'ok skippy', 'yo skippy', 'skipy']
const SILENCE_MS    = 2000
const MAX_LISTEN_MS = 30_000

// ─── Helpers ─────────────────────────────────────────────────────────────────

function playActivationChime(type: 'wake' | 'done' | 'error') {
  try {
    const ctx  = new AudioContext()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'wake') {
      osc.frequency.setValueAtTime(523.25, ctx.currentTime)
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12)
      gain.gain.setValueAtTime(0.18, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      osc.start(); osc.stop(ctx.currentTime + 0.35)
    } else if (type === 'done') {
      osc.frequency.setValueAtTime(783.99, ctx.currentTime)
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(); osc.stop(ctx.currentTime + 0.3)
    } else {
      osc.frequency.setValueAtTime(220, ctx.currentTime)
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
      osc.start(); osc.stop(ctx.currentTime + 0.25)
    }
    setTimeout(() => ctx.close(), 600)
  } catch { /* AudioContext may be blocked before user gesture */ }
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

  const wakeRecogRef    = useRef<SpeechRecognition | null>(null)
  const listenRecogRef  = useRef<SpeechRecognition | null>(null)
  const utteranceRef    = useRef<SpeechSynthesisUtterance | null>(null)
  const streamRef       = useRef<MediaStream | null>(null)
  const analyserRef     = useRef<AnalyserNode | null>(null)
  const animFrameRef    = useRef<number | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finalTextRef    = useRef<string>('')
  const stateRef        = useRef<VoiceState>('idle')
  const mutedRef        = useRef(false)
  const wakeBlockRef    = useRef(false)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { mutedRef.current = muted }, [muted])

  // ── Volume visualiser (optional — just for the orb animation) ─────────────

  const startVolumeAnalysis = useCallback((stream: MediaStream) => {
    try {
      const ctx     = new AudioContext()
      const source  = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser
      const tick = () => {
        if (stateRef.current !== 'listening') return
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setVolumeLevel(Math.min(1, avg / 80))
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
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n+/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .slice(0, 600)
    const utt = new SpeechSynthesisUtterance(clean)
    utteranceRef.current = utt
    const voices = window.speechSynthesis.getVoices()
    const preferred =
      voices.find(v => /samira|karen|daniel|moira|alex|siri/i.test(v.name) && v.lang.startsWith('en')) ||
      voices.find(v => v.lang === 'en-US' && v.localService) ||
      voices.find(v => v.lang.startsWith('en'))
    if (preferred) utt.voice = preferred
    utt.rate   = 1.05
    utt.pitch  = 0.92
    utt.volume = 0.88
    utt.lang   = 'en-US'
    utt.onend  = () => onEnd?.()
    utt.onerror = () => onEnd?.()
    window.speechSynthesis.speak(utt)
  }, [])

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel()
    utteranceRef.current = null
    setState('idle')
    setVisible(false)
  }, [])

  // ── Active listening (browser STT — no server, no API key) ───────────────

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current)
    stopVolumeAnalysis()
    listenRecogRef.current?.stop()
    listenRecogRef.current = null
  }, [stopVolumeAnalysis])

  // Keep a ref so the onend closure always has the latest callback
  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => { onTranscriptRef.current = onTranscript }, [onTranscript])

  const startListening = useCallback(() => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      setErrorMsg('Speech recognition not supported in this browser')
      setState('error')
      setTimeout(() => { setState('idle'); setVisible(false) }, 3000)
      return
    }

    // Pause the wake-word session while actively listening
    wakeBlockRef.current = true
    wakeRecogRef.current?.stop()

    finalTextRef.current = ''
    setState('listening')
    setTranscript('')
    setResponse('')
    setErrorMsg('')

    const SR = (window.SpeechRecognition || window.webkitSpeechRecognition) as typeof SpeechRecognition
    const recog = new SR()
    recog.continuous      = true
    recog.interimResults  = true
    recog.lang            = 'en-US'
    recog.maxAlternatives = 1

    recog.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        if (r.isFinal) {
          finalTextRef.current += ' ' + r[0].transcript
          // Reset the silence timer on each finalized phrase
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(() => recog.stop(), SILENCE_MS)
        } else {
          interim += r[0].transcript
        }
      }
      setTranscript((finalTextRef.current + (interim ? ' ' + interim : '')).trim())
    }

    recog.onend = async () => {
      stopVolumeAnalysis()
      listenRecogRef.current = null

      // Re-enable wake-word listener
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
        setResponse(aiResponse)
        playActivationChime('done')
        if (!mutedRef.current && aiResponse) {
          setState('speaking')
          speak(aiResponse, () => {
            setState('idle')
            setTimeout(() => setVisible(false), 1500)
          })
        } else {
          setState('idle')
          setTimeout(() => setVisible(false), 2500)
        }
      } catch {
        setErrorMsg('Something went wrong')
        setState('error')
        playActivationChime('error')
        setTimeout(() => { setState('idle'); setVisible(false) }, 3500)
      }
    }

    recog.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed') {
        setWakeEnabled(false)
        setErrorMsg('Microphone access denied')
        setState('error')
        setTimeout(() => { setState('idle'); setVisible(false) }, 3000)
      }
      // 'no-speech' handled by silence timer
    }

    listenRecogRef.current = recog
    recog.start()

    // Best-effort volume visualiser (not required for STT)
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then(stream => { streamRef.current = stream; startVolumeAnalysis(stream) })
      .catch(() => { /* visualiser is optional */ })

    silenceTimerRef.current = setTimeout(() => recog.stop(), SILENCE_MS + 1500)
    maxTimerRef.current     = setTimeout(() => recog.stop(), MAX_LISTEN_MS)
  }, [speak, stopVolumeAnalysis, startVolumeAnalysis])

  // ── Wake-word detection (passive, always-on) ──────────────────────────────

  const startWakeWordListener = useCallback(() => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) return
    const SR = (window.SpeechRecognition || window.webkitSpeechRecognition) as typeof SpeechRecognition
    const recog = new SR()
    recog.continuous      = true
    recog.interimResults  = true
    recog.lang            = 'en-US'
    recog.maxAlternatives = 1
    let slidingWindow = ''

    recog.onresult = (event) => {
      if (stateRef.current !== 'idle' || chatBusy) return
      const latest = event.results[event.results.length - 1]
      const word = latest[0].transcript.toLowerCase().trim()
      slidingWindow = (slidingWindow + ' ' + word).split(' ').slice(-6).join(' ')
      if (ACTIVATION_PHRASES.some(p => slidingWindow.includes(p))) {
        slidingWindow = ''
        if (!wakeEnabled) return
        setState('waking')
        setVisible(true)
        playActivationChime('wake')
        setTimeout(() => { if (stateRef.current === 'waking') startListening() }, 450)
      }
    }

    recog.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed') setWakeEnabled(false)
    }

    recog.onend = () => {
      if (wakeBlockRef.current) return  // active session running, don't restart
      if (stateRef.current === 'idle') {
        setTimeout(() => { try { recog.start() } catch { /* already started */ } }, 500)
      }
    }

    wakeRecogRef.current = recog
    try { recog.start() } catch { /* permission denied → handled in onerror */ }
  }, [chatBusy, wakeEnabled, startListening])

  // Mount / unmount
  useEffect(() => {
    startWakeWordListener()
    return () => {
      wakeBlockRef.current = true
      wakeRecogRef.current?.stop()
      wakeRecogRef.current = null
      listenRecogRef.current?.stop()
      listenRecogRef.current = null
      stopSpeaking()
      stopVolumeAnalysis()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-activate on mount when ?voice=1 is in the URL
  useEffect(() => {
    if (!autoActivate) return
    const timer = setTimeout(() => {
      if (stateRef.current === 'idle') {
        setState('waking')
        setVisible(true)
        playActivationChime('wake')
        setTimeout(() => { if (stateRef.current === 'waking') startListening() }, 450)
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [autoActivate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dismiss ────────────────────────────────────────────────────────────────

  const dismiss = useCallback(() => {
    stopListening()
    stopSpeaking()
    setState('idle')
    setVisible(false)
    setTranscript('')
    setResponse('')
    setErrorMsg('')
  }, [stopListening, stopSpeaking])

  // ── Manual activation (mic button click) ──────────────────────────────────

  const manualActivate = useCallback(() => {
    if (state !== 'idle' || chatBusy) return
    setState('waking')
    setVisible(true)
    playActivationChime('wake')
    setTimeout(() => { if (stateRef.current === 'waking') startListening() }, 300)
  }, [state, chatBusy, startListening])

  // ── Labels & colours ──────────────────────────────────────────────────────

  const stateLabel: Record<VoiceState, string> = {
    idle:       'Say "Skippy" to activate',
    waking:     'Skippy activated…',
    listening:  'Listening…',
    processing: 'Thinking…',
    speaking:   'Speaking…',
    error:      errorMsg || 'Something went wrong',
  }

  const orbColors: Record<VoiceState, string> = {
    idle:       'rgba(41,194,230,0.08)',
    waking:     'rgba(41,194,230,0.25)',
    listening:  'rgba(41,194,230,0.35)',
    processing: 'rgba(124,58,237,0.3)',
    speaking:   'rgba(16,185,129,0.28)',
    error:      'rgba(239,68,68,0.25)',
  }

  const orbGlow: Record<VoiceState, string> = {
    idle:       '0 0 20px rgba(41,194,230,0.05)',
    waking:     '0 0 60px rgba(41,194,230,0.35)',
    listening:  `0 0 ${40 + volumeLevel * 80}px rgba(41,194,230,${0.3 + volumeLevel * 0.4})`,
    processing: '0 0 60px rgba(124,58,237,0.5)',
    speaking:   '0 0 60px rgba(16,185,129,0.45)',
    error:      '0 0 40px rgba(239,68,68,0.4)',
  }

  const isActive = visible && state !== 'idle'

  return (
    <>
      {/* ── Mic button shown in the chat input toolbar ── */}
      <button
        onClick={manualActivate}
        disabled={!!chatBusy || (state !== 'idle' && state !== 'error')}
        title={wakeEnabled ? 'Click to speak or say "Skippy"' : 'Click to speak'}
        className={cn(
          'relative flex items-center justify-center rounded-full transition-all duration-300 group',
          'w-9 h-9 border',
          chatBusy || (state !== 'idle' && state !== 'error')
            ? 'opacity-30 cursor-not-allowed border-border'
            : 'border-accent/30 hover:border-accent/70 hover:bg-accent/10 cursor-pointer',
          className
        )}
        style={state === 'listening' ? {
          boxShadow: `0 0 ${12 + volumeLevel * 20}px rgba(41,194,230,${0.3 + volumeLevel * 0.5})`,
          borderColor: `rgba(41,194,230,${0.5 + volumeLevel * 0.5})`,
        } : {}}
      >
        {state === 'processing' ? (
          <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
        ) : state === 'speaking' ? (
          <Volume2 className="w-4 h-4 text-emerald-400" />
        ) : state === 'listening' || state === 'waking' ? (
          <Mic className="w-4 h-4 text-accent animate-pulse" />
        ) : (
          <Mic className="w-4 h-4 text-muted group-hover:text-accent transition-colors" />
        )}
        {/* Always-on indicator dot when wake-word is active */}
        {wakeEnabled && state === 'idle' && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent/60 animate-pulse" />
        )}
      </button>

      {/* ── Full-screen voice overlay ── */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(6,13,26,0.85)', backdropFilter: 'blur(20px)' }}
          >
            <div className="absolute inset-0" onClick={state === 'error' ? dismiss : undefined} />

            <div className="relative flex flex-col items-center gap-8 px-6">
              {/* Close button */}
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={dismiss}
                className="absolute -top-2 right-0 p-2 rounded-full text-muted hover:text-foreground hover:bg-surface transition-colors"
              >
                <X className="w-5 h-5" />
              </motion.button>

              {/* Orb */}
              <div className="relative flex items-center justify-center">
                {['listening', 'speaking'].includes(state) && (
                  <>
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="absolute rounded-full"
                        style={{
                          width:  `${220 + i * 60}px`,
                          height: `${220 + i * 60}px`,
                          border: `1px solid ${state === 'speaking' ? 'rgba(16,185,129,' : 'rgba(41,194,230,'}${0.18 - i * 0.05})`,
                        }}
                        animate={{
                          scale:   state === 'listening' ? [1, 1 + volumeLevel * 0.15 + 0.05, 1] : [1, 1.04, 1],
                          opacity: [0.5, 0.9, 0.5],
                        }}
                        transition={{ duration: 1.5 + i * 0.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
                      />
                    ))}
                  </>
                )}

                <motion.div
                  className="relative w-40 h-40 rounded-full flex items-center justify-center"
                  style={{ background: orbColors[state], boxShadow: orbGlow[state] }}
                  animate={
                    state === 'processing' ? { rotate: 360 }
                    : state === 'listening' ? { scale: [1, 1 + volumeLevel * 0.12 + 0.02, 1] }
                    : { scale: [1, 1.03, 1] }
                  }
                  transition={
                    state === 'processing'
                      ? { duration: 3, repeat: Infinity, ease: 'linear' }
                      : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                  }
                >
                  <div
                    className="absolute inset-3 rounded-full opacity-60"
                    style={{
                      background: `radial-gradient(circle at 40% 35%, ${
                        state === 'speaking'   ? 'rgba(16,185,129,0.4)'  :
                        state === 'processing' ? 'rgba(124,58,237,0.4)' :
                        state === 'error'      ? 'rgba(239,68,68,0.4)'  :
                        'rgba(41,194,230,0.4)'
                      }, transparent 70%)`,
                    }}
                  />
                  <div className="relative z-10">
                    {state === 'processing' ? <Zap     className="w-12 h-12 text-purple-300 animate-pulse" />
                    : state === 'speaking'  ? <Volume2 className="w-12 h-12 text-emerald-300" />
                    : state === 'error'     ? <MicOff  className="w-12 h-12 text-red-300" />
                    :                        <Mic     className="w-12 h-12 text-accent" />}
                  </div>

                  {state === 'listening' && (
                    <div className="absolute bottom-6 flex items-end gap-0.5">
                      {Array.from({ length: 7 }).map((_, i) => {
                        const h = 4 + Math.sin((Date.now() / 200 + i) * 1.3) * volumeLevel * 14 + volumeLevel * 8
                        return (
                          <motion.div key={i} className="w-1 rounded-full bg-accent/80"
                            animate={{ height: `${Math.max(4, h)}px` }} transition={{ duration: 0.1 }} />
                        )
                      })}
                    </div>
                  )}
                </motion.div>
              </div>

              {/* Skippy wordmark + state */}
              <div className="text-center">
                <p className="font-display text-2xl font-black gradient-text tracking-wide">SKIPPY</p>
                <p className="text-sm text-muted mt-1">{stateLabel[state]}</p>
              </div>

              {/* You transcript bubble */}
              <AnimatePresence>
                {transcript && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="max-w-sm w-full px-4 py-3 rounded-2xl text-sm text-foreground/90 text-center leading-relaxed"
                    style={{ background: 'rgba(15,39,89,0.8)', border: '1px solid rgba(41,194,230,0.2)' }}
                  >
                    <span className="text-accent/50 text-xs mr-1">You:</span>{transcript}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Skippy response bubble */}
              <AnimatePresence>
                {response && state !== 'processing' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="max-w-sm w-full px-4 py-3 rounded-2xl text-sm text-foreground/90 text-center leading-relaxed"
                    style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
                  >
                    <span className="text-emerald-400/70 text-xs mr-1">Skippy:</span>
                    {response.slice(0, 200)}{response.length > 200 ? '…' : ''}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Controls */}
              <div className="flex items-center gap-4">
                {state === 'speaking' && (
                  <button onClick={stopSpeaking}
                    className="px-5 py-2.5 rounded-full text-sm font-semibold border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                    Stop speaking
                  </button>
                )}
                {(state === 'listening' || state === 'waking') && (
                  <button onClick={stopListening}
                    className="px-5 py-2.5 rounded-full text-sm font-semibold border border-accent/30 text-accent hover:bg-accent/10 transition-colors">
                    Done talking
                  </button>
                )}
                <button
                  onClick={() => setMuted(m => !m)}
                  className={cn('p-2.5 rounded-full transition-colors',
                    muted ? 'text-red-400 border-red-400/30 border bg-red-500/10'
                          : 'text-muted border border-border hover:text-foreground hover:bg-surface')}
                  title={muted ? 'Unmute responses' : 'Mute responses'}
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>

              {/* Privacy badge */}
              <div className="flex items-center gap-1.5 text-[10px] text-muted/40">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                Voice processed locally · No audio sent to servers
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
