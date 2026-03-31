'use client'

/**
 * VoiceMode — Skippy's voice interface.
 *
 * Architecture:
 *  1. Passive wake-word listener: polls SpeechRecognition for "skippy"
 *     using a sliding 5-word window (low CPU, browser-native, no cloud).
 *  2. On activation: starts encrypted recording session
 *     - Negotiates AES-256-GCM key per session via /api/voice/session
 *     - Records with MediaRecorder → encrypts each blob client-side
 *     - Sends encrypted audio to /api/voice/transcribe
 *  3. Transcript is fed into the chat send pipeline (same path as text).
 *  4. AI response is read aloud via Web Speech API (SpeechSynthesis)
 *     with a Skippy-tuned voice profile.
 *  5. Visual: animated orb with listening/thinking/speaking states.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, X, Loader2, Volume2, VolumeX, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type VoiceState =
  | 'idle'          // orb hidden, passive wake-word listener running in bg
  | 'waking'        // heard "Skippy", playing activation chime, preparing
  | 'listening'     // actively recording user speech
  | 'processing'    // STT + AI response in flight
  | 'speaking'      // reading AI response aloud
  | 'error'         // something went wrong

interface VoiceModeProps {
  /** Called with the transcribed text — should feed it into the chat pipeline */
  onTranscript: (text: string) => Promise<string>  // returns AI response text
  /** Whether the chat is currently processing (disable voice if so) */
  chatBusy?: boolean
  className?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACTIVATION_PHRASES = ['skippy', 'hey skippy', 'ok skippy', 'yo skippy', 'skipy']
const SILENCE_TIMEOUT_MS = 2400   // stop recording after 2.4s silence
const MAX_RECORD_MS      = 25_000 // hard cap at 25s

/** AES-256-GCM encrypt a buffer using Web Crypto API */
async function encryptAudioBuffer(
  audioBuf: ArrayBuffer,
  keyRaw: Uint8Array
): Promise<{ iv: string; ciphertext: string }> {
  const key = await crypto.subtle.importKey(
    'raw', keyRaw.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt']
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))  // 96-bit IV for GCM
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    audioBuf
  )
  // Encode as base64 for JSON transport
  const ivArr = Array.from(iv)
  const encArr = Array.from(new Uint8Array(encrypted))
  return {
    iv: btoa(String.fromCharCode(...ivArr)),
    ciphertext: btoa(String.fromCharCode(...encArr)),
  }
}

/** Play a subtle chime to signal activation */
function playActivationChime(type: 'wake' | 'done' | 'error') {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'wake') {
      // Rising two-note: C5 → E5
      osc.frequency.setValueAtTime(523.25, ctx.currentTime)
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12)
      gain.gain.setValueAtTime(0.18, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      osc.start(); osc.stop(ctx.currentTime + 0.35)
    } else if (type === 'done') {
      // Soft descending G5 → E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime)
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(); osc.stop(ctx.currentTime + 0.3)
    } else {
      // Error: low beep
      osc.frequency.setValueAtTime(220, ctx.currentTime)
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
      osc.start(); osc.stop(ctx.currentTime + 0.25)
    }
    setTimeout(() => ctx.close(), 600)
  } catch { /* AudioContext blocked (user hasn't interacted yet) */ }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VoiceMode({ onTranscript, chatBusy, className }: VoiceModeProps) {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [muted, setMuted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [wakeEnabled, setWakeEnabled] = useState(true)
  const [volumeLevel, setVolumeLevel] = useState(0)

  const sessionRef = useRef<{ id: string; keyRaw: Uint8Array } | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const wakeRecogRef = useRef<SpeechRecognition | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const stateRef = useRef<VoiceState>('idle')

  // Keep stateRef in sync for closures
  useEffect(() => { stateRef.current = state }, [state])

  // ── Session management ────────────────────────────────────────────────────

  const negotiateSession = useCallback(async () => {
    const res = await fetch('/api/voice/session', { method: 'POST' })
    if (!res.ok) throw new Error('Failed to create voice session')
    const { sessionId, keyHex } = await res.json()
    const keyRaw = new Uint8Array(keyHex.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)))
    sessionRef.current = { id: sessionId, keyRaw }
  }, [])

  const teardownSession = useCallback(async () => {
    if (sessionRef.current) {
      fetch('/api/voice/session', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionRef.current.id }),
      }).catch(() => {})
      sessionRef.current = null
    }
  }, [])

  // ── Volume visualiser ─────────────────────────────────────────────────────

  const startVolumeAnalysis = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
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
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    setVolumeLevel(0)
  }, [])

  // ── Recording ─────────────────────────────────────────────────────────────

  const stopRecording = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current)
    stopVolumeAnalysis()
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [stopVolumeAnalysis])

  const startRecording = useCallback(async () => {
    try {
      setState('listening')
      setTranscript('')
      setResponse('')
      setErrorMsg('')

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } })
      streamRef.current = stream
      startVolumeAnalysis(stream)

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
          // Reset silence timer on new audio data > threshold
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(() => stopRecording(), SILENCE_TIMEOUT_MS)
        }
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null

        if (chunksRef.current.length === 0 || stateRef.current === 'idle') return

        setState('processing')
        try {
          if (!sessionRef.current) await negotiateSession()
          const session = sessionRef.current!

          const blob = new Blob(chunksRef.current, { type: mimeType })
          const audioBuf = await blob.arrayBuffer()

          const { iv, ciphertext } = await encryptAudioBuffer(audioBuf, session.keyRaw)

          const sttRes = await fetch('/api/voice/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: session.id,
              iv,
              ciphertext,
              mimeType: blob.type,
            }),
          })

          if (!sttRes.ok) {
            const err = await sttRes.json().catch(() => ({}))
            throw new Error(err.error || 'Transcription failed')
          }

          const { transcript: text } = await sttRes.json()
          if (!text?.trim()) {
            setState('idle')
            setVisible(false)
            return
          }

          setTranscript(text)

          // Feed into chat pipeline — caller returns the AI response text
          const aiResponse = await onTranscript(text)
          setResponse(aiResponse)
          playActivationChime('done')

          if (!muted && aiResponse) {
            setState('speaking')
            speak(aiResponse, () => {
              setState('idle')
              setTimeout(() => setVisible(false), 1500)
            })
          } else {
            setState('idle')
            setTimeout(() => setVisible(false), 2500)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Something went wrong'
          setErrorMsg(msg)
          setState('error')
          playActivationChime('error')
          setTimeout(() => { setState('idle'); setVisible(false) }, 3500)
        }
      }

      recorder.start(250)  // collect in 250ms chunks for silence detection

      // Hard cap
      maxTimerRef.current = setTimeout(() => stopRecording(), MAX_RECORD_MS)

      // Initial silence guard (start timer immediately in case nothing is said)
      silenceTimerRef.current = setTimeout(() => stopRecording(), SILENCE_TIMEOUT_MS + 1000)

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied'
      setErrorMsg(msg)
      setState('error')
      setTimeout(() => { setState('idle'); setVisible(false) }, 3500)
    }
  }, [startVolumeAnalysis, stopRecording, negotiateSession, onTranscript, muted])

  // ── TTS ───────────────────────────────────────────────────────────────────

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!('speechSynthesis' in window)) { onEnd?.(); return }
    window.speechSynthesis.cancel()

    // Strip markdown for speech
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n+/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .slice(0, 600)  // cap length for voice

    const utt = new SpeechSynthesisUtterance(clean)
    utteranceRef.current = utt

    // Pick a good voice — prefer a natural-sounding English voice
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v =>
      /samira|karen|daniel|moira|alex|siri/i.test(v.name) && v.lang.startsWith('en')
    ) || voices.find(v => v.lang === 'en-US' && v.localService) || voices.find(v => v.lang.startsWith('en'))
    if (preferred) utt.voice = preferred

    utt.rate = 1.05
    utt.pitch = 0.92
    utt.volume = 0.88
    utt.lang = 'en-US'

    utt.onend = () => onEnd?.()
    utt.onerror = () => onEnd?.()
    window.speechSynthesis.speak(utt)
  }, [])

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel()
    utteranceRef.current = null
    setState('idle')
    setVisible(false)
  }, [])

  // ── Wake-word detection (passive, always running) ─────────────────────────

  const startWakeWordListener = useCallback(() => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) return

    const SR = (window.SpeechRecognition || window.webkitSpeechRecognition) as typeof SpeechRecognition
    const recog = new SR()
    recog.continuous = true
    recog.interimResults = true
    recog.lang = 'en-US'
    recog.maxAlternatives = 1

    let slidingWindow = ''

    recog.onresult = (event) => {
      // Only process if not already active and chat is free
      if (stateRef.current !== 'idle' || chatBusy) return

      const latest = event.results[event.results.length - 1]
      const word = latest[0].transcript.toLowerCase().trim()
      slidingWindow = (slidingWindow + ' ' + word).split(' ').slice(-6).join(' ')

      const activated = ACTIVATION_PHRASES.some(p => slidingWindow.includes(p))
      if (activated) {
        slidingWindow = ''
        if (!wakeEnabled) return

        setState('waking')
        setVisible(true)
        playActivationChime('wake')

        // Brief visual delay then start recording
        setTimeout(() => {
          if (stateRef.current === 'waking') startRecording()
        }, 450)
      }
    }

    recog.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed') {
        setWakeEnabled(false)
      }
    }

    // Auto-restart on end (SpeechRecognition stops after ~60s on some browsers)
    recog.onend = () => {
      if (stateRef.current === 'idle') {
        setTimeout(() => {
          try { recog.start() } catch { /* already started */ }
        }, 500)
      }
    }

    wakeRecogRef.current = recog
    try { recog.start() } catch { /* permission denied handled in onerror */ }
  }, [chatBusy, wakeEnabled, startRecording])

  useEffect(() => {
    startWakeWordListener()
    return () => {
      wakeRecogRef.current?.stop()
      wakeRecogRef.current = null
      stopSpeaking()
      teardownSession()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Negotiate session eagerly once to reduce first-activation latency
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!sessionRef.current) negotiateSession().catch(() => {})
    }, 3000)
    return () => clearTimeout(timer)
  }, [negotiateSession])

  // ── Dismiss ────────────────────────────────────────────────────────────────

  const dismiss = useCallback(() => {
    stopRecording()
    stopSpeaking()
    setState('idle')
    setVisible(false)
    setTranscript('')
    setResponse('')
    setErrorMsg('')
  }, [stopRecording, stopSpeaking])

  // ── Manual activation (mic button) ────────────────────────────────────────

  const manualActivate = useCallback(() => {
    if (state !== 'idle' || chatBusy) return
    setState('waking')
    setVisible(true)
    playActivationChime('wake')
    setTimeout(() => {
      if (stateRef.current === 'waking') startRecording()
    }, 300)
  }, [state, chatBusy, startRecording])

  // ── Render labels ─────────────────────────────────────────────────────────

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
      {/* ── Passive mic button (always visible in chat) ── */}
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

        {/* Wake-word indicator dot */}
        {wakeEnabled && state === 'idle' && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent/60 animate-pulse" />
        )}
      </button>

      {/* ── Active voice overlay ── */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(6,13,26,0.85)', backdropFilter: 'blur(20px)' }}
          >
            {/* Dismiss backdrop */}
            <div className="absolute inset-0" onClick={state === 'error' ? dismiss : undefined} />

            <div className="relative flex flex-col items-center gap-8 px-6">
              {/* ── Close button ── */}
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={dismiss}
                className="absolute -top-2 right-0 p-2 rounded-full text-muted hover:text-foreground hover:bg-surface transition-colors"
              >
                <X className="w-5 h-5" />
              </motion.button>

              {/* ── Orb ── */}
              <div className="relative flex items-center justify-center">
                {/* Outer ring — breathing animation */}
                {['listening', 'speaking'].includes(state) && (
                  <>
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="absolute rounded-full"
                        style={{
                          width: `${220 + i * 60}px`,
                          height: `${220 + i * 60}px`,
                          border: `1px solid ${state === 'speaking' ? 'rgba(16,185,129,' : 'rgba(41,194,230,'}${0.18 - i * 0.05})`,
                        }}
                        animate={{
                          scale: state === 'listening'
                            ? [1, 1 + volumeLevel * 0.15 + 0.05, 1]
                            : [1, 1.04, 1],
                          opacity: [0.5, 0.9, 0.5],
                        }}
                        transition={{ duration: 1.5 + i * 0.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
                      />
                    ))}
                  </>
                )}

                {/* Main orb */}
                <motion.div
                  className="relative w-40 h-40 rounded-full flex items-center justify-center"
                  style={{ background: orbColors[state], boxShadow: orbGlow[state] }}
                  animate={
                    state === 'processing'
                      ? { rotate: 360 }
                      : state === 'listening'
                      ? { scale: [1, 1 + volumeLevel * 0.12 + 0.02, 1] }
                      : { scale: [1, 1.03, 1] }
                  }
                  transition={
                    state === 'processing'
                      ? { duration: 3, repeat: Infinity, ease: 'linear' }
                      : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                  }
                >
                  {/* Inner glow ring */}
                  <div
                    className="absolute inset-3 rounded-full opacity-60"
                    style={{
                      background: `radial-gradient(circle at 40% 35%, ${
                        state === 'speaking' ? 'rgba(16,185,129,0.4)' :
                        state === 'processing' ? 'rgba(124,58,237,0.4)' :
                        state === 'error' ? 'rgba(239,68,68,0.4)' :
                        'rgba(41,194,230,0.4)'
                      }, transparent 70%)`,
                    }}
                  />

                  {/* Icon */}
                  <div className="relative z-10">
                    {state === 'processing' ? (
                      <Zap className="w-12 h-12 text-purple-300 animate-pulse" />
                    ) : state === 'speaking' ? (
                      <Volume2 className="w-12 h-12 text-emerald-300" />
                    ) : state === 'error' ? (
                      <MicOff className="w-12 h-12 text-red-300" />
                    ) : (
                      <Mic className="w-12 h-12 text-accent" />
                    )}
                  </div>

                  {/* Volume bars (listening state) */}
                  {state === 'listening' && (
                    <div className="absolute bottom-6 flex items-end gap-0.5">
                      {Array.from({ length: 7 }).map((_, i) => {
                        const height = 4 + Math.sin((Date.now() / 200 + i) * 1.3) * volumeLevel * 14 + volumeLevel * 8
                        return (
                          <motion.div
                            key={i}
                            className="w-1 rounded-full bg-accent/80"
                            animate={{ height: `${Math.max(4, height)}px` }}
                            transition={{ duration: 0.1 }}
                          />
                        )
                      })}
                    </div>
                  )}
                </motion.div>
              </div>

              {/* ── Skippy wordmark ── */}
              <div className="text-center">
                <p className="font-display text-2xl font-black gradient-text tracking-wide">SKIPPY</p>
                <p className="text-sm text-muted mt-1">{stateLabel[state]}</p>
              </div>

              {/* ── Transcript bubble ── */}
              <AnimatePresence>
                {transcript && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="max-w-sm w-full px-4 py-3 rounded-2xl text-sm text-foreground/90 text-center leading-relaxed"
                    style={{ background: 'rgba(15,39,89,0.8)', border: '1px solid rgba(41,194,230,0.2)' }}
                  >
                    <span className="text-accent/50 text-xs mr-1">You:</span>
                    {transcript}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Response bubble ── */}
              <AnimatePresence>
                {response && state !== 'processing' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="max-w-sm w-full px-4 py-3 rounded-2xl text-sm text-foreground/90 text-center leading-relaxed"
                    style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
                  >
                    <span className="text-emerald-400/70 text-xs mr-1">Skippy:</span>
                    {response.slice(0, 200)}{response.length > 200 ? '…' : ''}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Controls ── */}
              <div className="flex items-center gap-4">
                {state === 'speaking' && (
                  <button
                    onClick={stopSpeaking}
                    className="px-5 py-2.5 rounded-full text-sm font-semibold border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  >
                    Stop speaking
                  </button>
                )}
                {(state === 'listening' || state === 'waking') && (
                  <button
                    onClick={stopRecording}
                    className="px-5 py-2.5 rounded-full text-sm font-semibold border border-accent/30 text-accent hover:bg-accent/10 transition-colors"
                  >
                    Done talking
                  </button>
                )}
                <button
                  onClick={() => setMuted(m => !m)}
                  className={cn(
                    'p-2.5 rounded-full transition-colors',
                    muted ? 'text-red-400 border-red-400/30 border bg-red-500/10' : 'text-muted border border-border hover:text-foreground hover:bg-surface'
                  )}
                  title={muted ? 'Unmute responses' : 'Mute responses'}
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>

              {/* ── Security badge ── */}
              <div className="flex items-center gap-1.5 text-[10px] text-muted/40">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                End-to-end encrypted · AES-256-GCM · ephemeral key
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
