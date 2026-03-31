'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, X, Loader2, Volume2, VolumeX, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type VoiceState = 'greeting' | 'ready' | 'listening' | 'processing' | 'speaking' | 'error'

interface VoiceModeProps {
  onTranscript: (text: string, onChunk?: (chunk: string) => void) => Promise<string>
  chatBusy?: boolean
  autoActivate?: boolean
  className?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SILENCE_MS         = 850    // ms after last FINAL result → stop
const INTERIM_SILENCE_MS = 2200   // ms after last ANY result → force-stop if we have final text
const MAX_LISTEN_MS      = 45_000
const LOOP_PAUSE_MS      = 150    // ms between Skippy finishing and listening again
const MAX_ERR_RESTARTS   = 6      // guard against tight ERROR-based restart loops (not no-speech)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function greetingLine(): string {
  const h = new Date().getHours()
  if (h < 5)  return "Still up? What's on your mind?"
  if (h < 12) return "Good morning! What can I help you with?"
  if (h < 17) return "Hey! What can I do for you?"
  if (h < 21) return "Good evening! What do you need?"
  return "Hey, still up. What do you need?"
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
      osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.18)
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(); osc.stop(ctx.currentTime + 0.4)
    } else if (type === 'done') {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(660, ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.18)
      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      osc.start(); osc.stop(ctx.currentTime + 0.35)
    } else {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(200, ctx.currentTime)
      gain.gain.setValueAtTime(0.06, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28)
      osc.start(); osc.stop(ctx.currentTime + 0.28)
    }
    setTimeout(() => ctx.close(), 900)
  } catch { /* AudioContext may be blocked */ }
}

// ─── Sentence splitter for streaming TTS ─────────────────────────────────────

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
    // Chunk at comma-pause (≥90 chars) to start TTS before the full sentence arrives
    if (buf.length > 90) {
      const ci = buf.lastIndexOf(',')
      if (ci > 45) return { sentences: [buf.slice(0, ci + 1).trim()], rest: buf.slice(ci + 1) }
    }
    // Last resort: chunk at word boundary once buffer reaches 75 chars
    if (buf.length > 75) {
      const si = buf.lastIndexOf(' ', 75)
      if (si > 40) return { sentences: [buf.slice(0, si).trim()], rest: buf.slice(si + 1) }
    }
  }
  return { sentences, rest: buf.slice(last) }
}

// ─── Per-state config ─────────────────────────────────────────────────────────

const BG: Record<VoiceState, string> = {
  greeting:   'radial-gradient(ellipse at 50% 45%, rgba(4,26,22,0.99) 0%,  rgba(4,11,16,1) 100%)',
  ready:      'radial-gradient(ellipse at 50% 45%, rgba(12,24,58,0.99) 0%, rgba(5,9,20,1)  100%)',
  listening:  'radial-gradient(ellipse at 50% 40%, rgba(10,28,72,0.99) 0%, rgba(5,9,20,1)  100%)',
  processing: 'radial-gradient(ellipse at 50% 45%, rgba(18,8,48,0.99)  0%, rgba(5,6,22,1)  100%)',
  speaking:   'radial-gradient(ellipse at 50% 45%, rgba(4,26,22,0.99)  0%, rgba(4,11,16,1) 100%)',
  error:      'radial-gradient(ellipse at center,  rgba(24,6,6,0.99)   0%, rgba(5,6,12,1)  100%)',
}

const GLOW: Record<VoiceState, string> = {
  greeting:   'rgba(16,185,129,0.55)',
  ready:      'rgba(41,194,230,0.25)',
  listening:  'rgba(41,194,230,0.55)',
  processing: 'rgba(124,58,237,0.55)',
  speaking:   'rgba(16,185,129,0.55)',
  error:      'rgba(239,68,68,0.4)',
}

const RING_COLOR: Record<VoiceState, string> = {
  greeting:   'rgba(16,185,129,0.4)',
  ready:      'rgba(41,194,230,0.12)',
  listening:  'rgba(41,194,230,0.45)',
  processing: 'rgba(124,58,237,0.4)',
  speaking:   'rgba(16,185,129,0.4)',
  error:      'rgba(239,68,68,0.35)',
}

const ROBOT_FILTER: Record<VoiceState, string> = {
  greeting:   'drop-shadow(0 0 30px rgba(16,185,129,0.7))  brightness(1.08)',
  ready:      'drop-shadow(0 0 12px rgba(41,194,230,0.3))  brightness(0.95)',
  listening:  'drop-shadow(0 0 25px rgba(41,194,230,0.8))  brightness(1.08)',
  processing: 'drop-shadow(0 0 26px rgba(124,58,237,0.75)) brightness(1.05)',
  speaking:   'drop-shadow(0 0 30px rgba(16,185,129,0.7))  brightness(1.08)',
  error:      'drop-shadow(0 0 18px rgba(239,68,68,0.5))   brightness(0.9)',
}

const MAIN_LABEL: Record<VoiceState, string> = {
  greeting:   'Skippy',
  ready:      'Listen Mode',
  listening:  "I'm listening\u2026",
  processing: 'Thinking\u2026',
  speaking:   'Skippy',
  error:      'Hmm\u2026',
}

const SUB_LABEL: Record<VoiceState, string> = {
  greeting:   'Tap to interrupt \u00b7 start talking',
  ready:      'Space or tap Skippy to speak \u00b7 or type below',
  listening:  'Listening \u00b7 tap robot or Space to finish',
  processing: 'Working on it',
  speaking:   'Tap or Space to interrupt & talk',
  error:      'Tap to try again',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VoiceMode({
  onTranscript,
  chatBusy,
  autoActivate,
  className,
}: VoiceModeProps) {
  const [mounted, setMounted]         = useState(false)
  const [open, setOpen]               = useState(false)
  const [voiceState, setVoiceState]   = useState<VoiceState>('ready')
  const [transcript, setTranscript]       = useState('')
  const [response, setResponse]           = useState('')
  const [currentSentence, setCurrentSentence] = useState('')
  const [muted, setMuted]                   = useState(false)
  const [micAllowed, setMicAllowed]   = useState(true)
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [tick, setTick]               = useState(0)
  const [typeInput, setTypeInput]     = useState('')
  const [sessionLog, setSessionLog]   = useState<Array<{id: string; role: 'user'|'skippy'; text: string}>>([])  // conversation history

  // ── Refs ──────────────────────────────────────────────────────────────────

  const openRef            = useRef(false)
  const voiceStateRef      = useRef<VoiceState>('ready')
  const mutedRef           = useRef(false)
  const dismissingRef      = useRef(false)
  const errRestartCountRef = useRef(0)   // only counts error-driven restarts, NOT no-speech
  const restartWindowRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const processingRef      = useRef(false) // prevents concurrent processText calls
  const generationRef      = useRef(0)     // incremented each processText call — stale closures bail out

  const listenRecogRef     = useRef<SpeechRecognition | null>(null)
  const utteranceRef       = useRef<SpeechSynthesisUtterance | null>(null)
  const streamRef          = useRef<MediaStream | null>(null)
  const animFrameRef       = useRef<number | null>(null)
  const silenceTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const interimTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loopTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finalTextRef       = useRef('')
  const onTranscriptRef    = useRef(onTranscript)
  const startListeningRef  = useRef<() => void>(() => {})
  const processTextRef     = useRef<(t: string) => void>(() => {})
  const speakGreetingRef   = useRef<() => void>(() => {})
  const greetingRef        = useRef(greetingLine())
  const typeInputRef       = useRef<HTMLInputElement>(null)
  const sessionLogRef      = useRef<HTMLDivElement>(null)

  // Sync refs
  useEffect(() => { openRef.current         = open },           [open])
  useEffect(() => { voiceStateRef.current   = voiceState },     [voiceState])
  useEffect(() => { mutedRef.current        = muted },          [muted])
  useEffect(() => { onTranscriptRef.current = onTranscript },   [onTranscript])

  useEffect(() => setMounted(true), [])

  // Waveform tick ~12fps
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
        setVolumeLevel(Math.min(1, d.reduce((a, b) => a + b, 0) / d.length / 65))
        animFrameRef.current = requestAnimationFrame(frame)
      }
      animFrameRef.current = requestAnimationFrame(frame)
    } catch { /* optional */ }
  }, [])

  // ── TTS ───────────────────────────────────────────────────────────────────
  // iOS CRITICAL: speak() must be called synchronously inside a click handler.

  const speak = useCallback((text: string, onEnd: () => void) => {
    if (!('speechSynthesis' in window)) { onEnd(); return }

    window.speechSynthesis.cancel()

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

    const doSpeak = () => {
      const utt = new SpeechSynthesisUtterance(clean)
      utteranceRef.current = utt

      const voices = window.speechSynthesis.getVoices()

      // ── Voice priority: natural friendly male — most human-sounding first ──
      // Tom      = macOS, warm clear American male (best free voice on Mac)
      // Daniel   = macOS/iOS, natural British male — second best
      // Gordon   = macOS, Scottish male (distinct but warm)
      // Alex     = macOS older but clear American male
      // Liam     = iOS 16+ natural American male
      // Reed     = iOS 16+ high-quality American male
      // Microsoft Mark/David = Windows natural males
      // Google UK English Male = Chrome natural male
      // Fallback: any English non-female voice
      const femaleNames = /samantha|karen|tessa|nicky|moira|serena|victoria|susan|zira|hazel|fiona|veena|alva|alice|amelie|ava|kate|siri|allison|ava/i
      const voice =
        voices.find(v => /\btom\b/i.test(v.name)    && v.lang.startsWith('en')) ||
        voices.find(v => /\bdaniel\b/i.test(v.name) && v.lang.startsWith('en')) ||
        voices.find(v => /\bliam\b/i.test(v.name)   && v.lang.startsWith('en')) ||
        voices.find(v => /\breed\b/i.test(v.name)   && v.lang.startsWith('en')) ||
        voices.find(v => /\bgordon\b/i.test(v.name) && v.lang.startsWith('en')) ||
        voices.find(v => /\balex\b/i.test(v.name)   && v.lang.startsWith('en')) ||
        voices.find(v => /\bmark\b/i.test(v.name)   && v.lang.startsWith('en')) ||
        voices.find(v => /microsoft mark/i.test(v.name)) ||
        voices.find(v => /microsoft david/i.test(v.name)) ||
        voices.find(v => /google uk english male/i.test(v.name)) ||
        voices.find(v => v.lang === 'en-US' && !femaleNames.test(v.name) && !v.name.toLowerCase().includes('google')) ||
        voices.find(v => v.lang === 'en-US' && !femaleNames.test(v.name)) ||
        voices.find(v => v.lang.startsWith('en') && !femaleNames.test(v.name)) ||
        voices.find(v => v.lang.startsWith('en')) ||
        null

      if (voice) utt.voice = voice
      utt.rate   = 1.1   // slightly faster — natural conversational pace
      utt.pitch  = 0.9   // slightly warm/low but not robotic
      utt.volume = 1.0
      utt.lang   = 'en-US'

      // iOS Safari silently pauses synthesis — keep it going
      const keepAlive = setInterval(() => {
        if (window.speechSynthesis.speaking) window.speechSynthesis.resume()
        else clearInterval(keepAlive)
      }, 5000)

      utt.onend   = () => { clearInterval(keepAlive); utteranceRef.current = null; onEnd() }
      utt.onerror = (e) => {
        clearInterval(keepAlive)
        utteranceRef.current = null
        // 'interrupted' / 'canceled' = intentional cancel() call — don't fire onEnd,
        // which would re-trigger driveQueue incorrectly while a new sentence is starting
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          onEnd()
        }
      }

      window.speechSynthesis.speak(utt)
    }

    // Voices load async on first page load
    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) {
      doSpeak()
    } else {
      let fired = false
      const go = () => {
        if (fired) return; fired = true
        window.speechSynthesis.removeEventListener('voiceschanged', go)
        doSpeak()
      }
      window.speechSynthesis.addEventListener('voiceschanged', go)
      setTimeout(go, 500)
    }
  }, [])

  const stopSpeaking = useCallback(() => {
    // Reset processingRef so the next processText call isn't silently dropped.
    // Critical for interruption: user taps orb while Skippy speaks → stopSpeaking()
    // → processingRef.current was still true → new call was ignored. Now it won't be.
    processingRef.current = false
    window.speechSynthesis?.cancel()
    utteranceRef.current = null
  }, [])

  // ── Process text → AI → streaming TTS ────────────────────────────────────
  // Shared by both voice recognition and type-to-speak.
  // Speaks sentences as they arrive in the stream — no waiting for the full response.

  const processText = useCallback(async (text: string) => {
    if (!text.trim() || dismissingRef.current || !openRef.current) return
    // Increment generation — any previous processText closure will see its gen is stale
    // and will silently bail out of driveQueue / finishUp / onChunk without fighting this call.
    const gen = ++generationRef.current
    processingRef.current = true
    setVoiceState('processing')
    setCurrentSentence('')

    let ttsBuffer          = ''
    const ttsQueue: string[] = []
    let ttsActive          = false
    let streamDone         = false
    let anyStreamingSpeech = false

    const finishUp = () => {
      if (gen !== generationRef.current) return  // stale — a newer call took over
      processingRef.current = false
      setCurrentSentence('')
      if (!dismissingRef.current && openRef.current) {
        setVoiceState('ready')
        loopTimerRef.current = setTimeout(() => {
          if (!dismissingRef.current && openRef.current) startListeningRef.current()
        }, LOOP_PAUSE_MS)
      }
    }

    const driveQueue = () => {
      if (gen !== generationRef.current) return  // stale — bail, don't touch synth
      if (ttsActive || ttsQueue.length === 0 || mutedRef.current || !openRef.current) return
      ttsActive = true
      anyStreamingSpeech = true
      const sentence = ttsQueue.shift()!
      setCurrentSentence(sentence)
      setVoiceState('speaking')
      speak(sentence, () => {
        ttsActive = false
        if (gen !== generationRef.current) return  // interrupted mid-sentence
        setCurrentSentence('')
        if (ttsQueue.length > 0) {
          driveQueue()
        } else if (streamDone) {
          finishUp()
        }
      })
    }

    const onChunk = (chunk: string) => {
      if (gen !== generationRef.current) return  // stale
      ttsBuffer += chunk
      const { sentences, rest } = pullSentences(ttsBuffer)
      ttsBuffer = rest
      if (sentences.length > 0) {
        ttsQueue.push(...sentences)
        driveQueue()
      }
    }

    // Add user message to session log before AI call
    setSessionLog(prev => [...prev, { id: `u${Date.now()}`, role: 'user', text }])

    try {
      const fullResp = await onTranscriptRef.current(text, onChunk)
      if (gen !== generationRef.current) return  // interrupted while awaiting AI response
      setResponse(fullResp)
      playChime('done')
      streamDone = true
      if (fullResp) setSessionLog(prev => [...prev, { id: `s${Date.now()}`, role: 'skippy', text: fullResp }])

      const leftover = ttsBuffer.trim()
      if (leftover.length > 4) ttsQueue.push(leftover)
      ttsBuffer = ''

      if (mutedRef.current || !fullResp) {
        finishUp()
      } else if (anyStreamingSpeech) {
        if (!ttsActive && ttsQueue.length === 0) finishUp()
        else if (!ttsActive && ttsQueue.length > 0) driveQueue()
        // else ttsActive — driveQueue onEnd will call finishUp
      } else {
        setVoiceState('speaking')
        speak(fullResp, finishUp)
      }
    } catch {
      if (gen !== generationRef.current) return
      processingRef.current = false
      setCurrentSentence('')
      setVoiceState('error')
      playChime('error')
      setTimeout(() => {
        if (openRef.current && !dismissingRef.current) {
          setVoiceState('ready')
          loopTimerRef.current = setTimeout(() => startListeningRef.current(), 800)
        }
      }, 2000)
    }
  }, [speak])

  useEffect(() => { processTextRef.current = processText }, [processText])

  // ── Stop listening ────────────────────────────────────────────────────────

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current)  { clearTimeout(silenceTimerRef.current);  silenceTimerRef.current  = null }
    if (interimTimerRef.current)  { clearTimeout(interimTimerRef.current);  interimTimerRef.current  = null }
    if (maxTimerRef.current)      { clearTimeout(maxTimerRef.current);      maxTimerRef.current      = null }
    if (loopTimerRef.current)     { clearTimeout(loopTimerRef.current);     loopTimerRef.current     = null }
    stopVolumeAnalysis()
    if (listenRecogRef.current) {
      listenRecogRef.current.onend = null
      try { listenRecogRef.current.stop() } catch {}
      listenRecogRef.current = null
    }
  }, [stopVolumeAnalysis])

  // ── Active listening ──────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      setVoiceState('error')
      setTimeout(() => setVoiceState('ready'), 3500)
      return
    }
    if (dismissingRef.current) return

    // ── Guard against tight ERROR-based restart loops only ──
    // Normal no-speech restarts are expected and must NOT count here
    // This counter is only incremented from the error path below

    stopVolumeAnalysis()
    if (silenceTimerRef.current)  { clearTimeout(silenceTimerRef.current);  silenceTimerRef.current  = null }
    if (interimTimerRef.current)  { clearTimeout(interimTimerRef.current);  interimTimerRef.current  = null }
    if (listenRecogRef.current) {
      listenRecogRef.current.onend = null
      try { listenRecogRef.current.stop() } catch {}
      listenRecogRef.current = null
    }

    finalTextRef.current = ''
    setVoiceState('listening')
    setTranscript('')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: typeof SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    const recog = new SR()
    recog.continuous      = true
    recog.interimResults  = true
    recog.lang            = 'en-US'
    recog.maxAlternatives = 3

    recog.onresult = (event) => {
      if (!openRef.current) return

      // Any result resets the interim silence watchdog
      if (interimTimerRef.current) clearTimeout(interimTimerRef.current)
      // Only force-stop if we actually have final confirmed text — not just interim
      interimTimerRef.current = setTimeout(() => {
        if (finalTextRef.current.trim().length > 2) {
          try { recog.stop() } catch {}
        }
      }, INTERIM_SILENCE_MS)

      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        if (r.isFinal) {
          finalTextRef.current += ' ' + r[0].transcript
          // Reset silence countdown on each final word
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(() => {
            try { recog.stop() } catch {}
          }, SILENCE_MS)
        } else {
          interim += r[0].transcript
        }
      }
      setTranscript((finalTextRef.current + (interim ? ' ' + interim : '')).trim())
    }

    recog.onend = () => {
      stopVolumeAnalysis()
      if (silenceTimerRef.current)  { clearTimeout(silenceTimerRef.current);  silenceTimerRef.current  = null }
      if (interimTimerRef.current)  { clearTimeout(interimTimerRef.current);  interimTimerRef.current  = null }
      listenRecogRef.current = null

      const text = finalTextRef.current.trim()

      // No speech detected — restart immediately, never go idle
      if (!text || !openRef.current || dismissingRef.current) {
        if (openRef.current && !dismissingRef.current) {
          loopTimerRef.current = setTimeout(() => {
            if (!dismissingRef.current && openRef.current) startListeningRef.current()
          }, 150)  // restart fast — no perceptible gap
        }
        return
      }

      processTextRef.current(text)
    }

    recog.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed') {
        setMicAllowed(false)
        setVoiceState('error')
        return
      }
      // Track error-driven restarts to detect genuine crash loops
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        errRestartCountRef.current++
        if (restartWindowRef.current) clearTimeout(restartWindowRef.current)
        restartWindowRef.current = setTimeout(() => { errRestartCountRef.current = 0 }, 6000)
        if (errRestartCountRef.current > MAX_ERR_RESTARTS) {
          errRestartCountRef.current = 0
          loopTimerRef.current = setTimeout(() => {
            if (!dismissingRef.current && openRef.current) startListeningRef.current()
          }, 3000)
        }
      }
      // All other errors (no-speech, aborted, network) → let onend restart gracefully
    }

    listenRecogRef.current = recog

    // Request mic + start SR together — don't wait for one before the other
    Promise.resolve(
      navigator.mediaDevices
        ?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        .then(s => { streamRef.current = s; startVolumeAnalysis(s) })
        .catch(() => { /* volume viz optional */ })
    )
    try { recog.start() } catch (err) { console.warn('SR start failed:', err) }

    // Only a max-time hard stop — no premature cutoff
    maxTimerRef.current = setTimeout(() => { try { recog.stop() } catch {} }, MAX_LISTEN_MS)
  }, [stopVolumeAnalysis, startVolumeAnalysis])

  useEffect(() => { startListeningRef.current = startListening }, [startListening])

  // ── Speak greeting ────────────────────────────────────────────────────────
  // Called synchronously in click handler — iOS TTS gesture context is preserved.

  const speakGreeting = useCallback(() => {
    if (mutedRef.current) {
      setTimeout(() => {
        if (!dismissingRef.current && openRef.current) startListeningRef.current()
      }, 300)
      return
    }
    setVoiceState('greeting')
    speak(greetingRef.current, () => {
      if (dismissingRef.current || !openRef.current) return
      setVoiceState('ready')
      setTimeout(() => {
        if (!dismissingRef.current && openRef.current) startListeningRef.current()
      }, 400)
    })
  }, [speak])

  useEffect(() => { speakGreetingRef.current = speakGreeting }, [speakGreeting])

  // ── Space-bar push-to-talk (when overlay is open) ─────────────────────────

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const target = e.target as HTMLElement
      // Don't intercept space in input/textarea
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      e.preventDefault()
      const state = voiceStateRef.current
      if      (state === 'ready')                                  startListeningRef.current()
      else if (state === 'listening')                              { try { listenRecogRef.current?.stop() } catch {} }
      else if (state === 'speaking' || state === 'greeting')       { stopSpeaking(); startListeningRef.current() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, stopSpeaking])

  // ── Auto-scroll session log ───────────────────────────────────────────────

  useEffect(() => {
    if (sessionLogRef.current) {
      sessionLogRef.current.scrollTop = sessionLogRef.current.scrollHeight
    }
  }, [sessionLog])

  // ── Type-to-speak ─────────────────────────────────────────────────────────

  const submitTyped = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    const text = typeInput.trim()
    if (!text || dismissingRef.current) return
    stopListening()
    stopSpeaking()
    setTranscript(text)
    setTypeInput('')
    processText(text)
  }, [typeInput, stopListening, stopSpeaking, processText])

  // ── Dismiss ───────────────────────────────────────────────────────────────

  const dismiss = useCallback(() => {
    dismissingRef.current  = true
    processingRef.current  = false
    stopListening()
    stopSpeaking()
    setOpen(false)
    setVoiceState('ready')
    setTranscript('')
    setResponse('')
    setCurrentSentence('')
    setTypeInput('')
    setSessionLog([])
    setTimeout(() => { dismissingRef.current = false }, 1200)
  }, [stopListening, stopSpeaking])

  // ── Mount / unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      dismissingRef.current = true
      try { listenRecogRef.current?.abort() } catch {}; listenRecogRef.current = null
      stopSpeaking()
      stopVolumeAnalysis()
      if (silenceTimerRef.current)  clearTimeout(silenceTimerRef.current)
      if (interimTimerRef.current)  clearTimeout(interimTimerRef.current)
      if (maxTimerRef.current)      clearTimeout(maxTimerRef.current)
      if (loopTimerRef.current)     clearTimeout(loopTimerRef.current)
      if (restartWindowRef.current) clearTimeout(restartWindowRef.current)
      errRestartCountRef.current = 0
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── autoActivate ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!autoActivate) return
    const t = setTimeout(() => {
      if (!dismissingRef.current) {
        setOpen(true)
        playChime('wake')
        setTimeout(() => speakGreetingRef.current(), 200)
      }
    }, 700)
    return () => clearTimeout(t)
  }, [autoActivate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Manual activate ───────────────────────────────────────────────────────
  // speakGreeting() called SYNCHRONOUSLY — iOS TTS gesture context preserved.

  const manualActivate = useCallback(() => {
    if (chatBusy) return
    if (open) {
      if (voiceState === 'speaking' || voiceState === 'greeting') {
        stopSpeaking()
        startListeningRef.current()
      } else {
        dismiss()
      }
      return
    }
    setOpen(true)
    playChime('wake')
    speakGreeting()
  }, [chatBusy, open, voiceState, stopSpeaking, dismiss, speakGreeting])

  // ── Robot tap ─────────────────────────────────────────────────────────────

  const orbTap = useCallback(() => {
    if (voiceState === 'ready')
      startListeningRef.current()
    else if (voiceState === 'listening')
      { stopListening(); setVoiceState('ready') }
    else if (voiceState === 'speaking' || voiceState === 'greeting')
      { stopSpeaking(); startListeningRef.current() }
  }, [voiceState, stopListening, stopSpeaking])

  // ── Waveform bars ─────────────────────────────────────────────────────────

  const isTalking = voiceState === 'speaking' || voiceState === 'greeting' || voiceState === 'listening'
  const bars = Array.from({ length: 11 }, (_, i) => {
    const phase = (tick * 0.4 + i * 0.72) % (Math.PI * 2)
    if (voiceState === 'listening') {
      return Math.max(3, 5 + Math.sin(phase) * volumeLevel * 20 + volumeLevel * 14)
    } else if (voiceState === 'speaking' || voiceState === 'greeting') {
      return Math.max(4, 7 + Math.sin(phase) * 9 + Math.sin(phase * 1.8 + i * 0.5) * 5)
    }
    return 2
  })

  // ── Portal overlay ────────────────────────────────────────────────────────

  const overlayContent = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="skippy-voice"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            width: '100%', height: '100%',
            zIndex: 2147483647,
            background: BG[voiceState],
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', overflow: 'hidden',
          }}
        >
          {/* Dot grid */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle, rgba(41,194,230,0.055) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
            maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 72%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 72%)',
          }} />

          {/* ── Top bar ── */}
          <div style={{
            position: 'relative', zIndex: 10, width: '100%',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            padding: '0 20px',
            paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)',
            flexShrink: 0,
          }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(41,194,230,0.5)', margin: 0 }}>
                {voiceState === 'greeting' || voiceState === 'speaking' ? 'Speaking'
                  : voiceState === 'listening' ? 'Listening'
                  : voiceState === 'processing' ? 'Thinking'
                  : 'Ready'}
              </p>
              <p style={{ fontWeight: 900, fontSize: 22, color: 'rgba(216,232,248,0.92)', margin: '3px 0 0', letterSpacing: '-0.02em' }}>
                Skippy
              </p>
            </div>
            <button
              onClick={dismiss}
              style={{
                marginTop: 4, padding: 10, borderRadius: '50%', cursor: 'pointer',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(148,163,184,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>

          {/* ── Robot + rings ── */}
          <div style={{
            flex: 1, position: 'relative',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            width: '100%', gap: 14, minHeight: 0,
          }}>
            {/* Ambient glow */}
            <motion.div
              style={{
                position: 'absolute', width: 220, height: 220, borderRadius: '50%',
                background: GLOW[voiceState], filter: 'blur(60px)', pointerEvents: 'none',
              }}
              animate={{ scale: [1, 1.18, 1], opacity: [0.65, 1, 0.65] }}
              transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Pulsing rings */}
            <AnimatePresence>
              {isTalking && [0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  style={{
                    position: 'absolute',
                    width: 165 + i * 44, height: 165 + i * 44,
                    borderRadius: '50%',
                    border: `1.5px solid ${RING_COLOR[voiceState]}`,
                    pointerEvents: 'none',
                  }}
                  initial={{ scale: 0.65, opacity: 0 }}
                  animate={{
                    scale: voiceState === 'listening'
                      ? [1, 1 + volumeLevel * 0.22 + 0.07 + i * 0.06, 1]
                      : [1, 1.09 + i * 0.06, 1],
                    opacity: [0.18, 0.48, 0.18],
                  }}
                  exit={{ scale: 0.65, opacity: 0, transition: { duration: 0.28 } }}
                  transition={{ duration: 1.8 + i * 0.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
                />
              ))}
            </AnimatePresence>

            {/* Skippy robot */}
            <motion.div
              onClick={orbTap}
              style={{ position: 'relative', zIndex: 10, width: 148, height: 148, flexShrink: 0, cursor: 'pointer' }}
              animate={
                voiceState === 'greeting' || voiceState === 'speaking'
                  ? { y: [0, -8, 2, -5, 0] }
                  : voiceState === 'listening'
                  ? { scale: [1, 1 + volumeLevel * 0.06 + 0.04, 1] }
                  : voiceState === 'processing'
                  ? { scale: [1, 1.04, 1], rotate: [0, -3, 3, -3, 0] }
                  : { y: [0, -6, 0] }
              }
              transition={
                voiceState === 'greeting' || voiceState === 'speaking'
                  ? { duration: 0.5, repeat: Infinity, ease: 'easeInOut' }
                  : voiceState === 'listening'
                  ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
                  : voiceState === 'processing'
                  ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 3.0, repeat: Infinity, ease: 'easeInOut' }
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/img/skippyENHANCED3D-removebg.png"
                alt="Skippy"
                draggable={false}
                style={{
                  width: 148, height: 148, objectFit: 'contain',
                  userSelect: 'none', display: 'block',
                  filter: ROBOT_FILTER[voiceState],
                  transition: 'filter 0.4s ease',
                }}
              />
            </motion.div>

            {/* Waveform bars */}
            <AnimatePresence>
              {isTalking && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 48, zIndex: 10, flexShrink: 0 }}
                >
                  {bars.map((h, idx) => (
                    <div
                      key={idx}
                      style={{
                        width: 4, height: Math.max(4, h), borderRadius: 9999, alignSelf: 'flex-end',
                        background: voiceState === 'listening'
                          ? `rgba(41,194,230,${0.5 + volumeLevel * 0.5})`
                          : 'rgba(16,185,129,0.9)',
                        transition: 'height 80ms ease',
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
                transition={{ duration: 0.2 }}
                style={{ textAlign: 'center', pointerEvents: 'none', zIndex: 10, flexShrink: 0 }}
              >
                <p style={{ fontSize: 20, fontWeight: 800, color: 'rgba(216,232,248,0.92)', margin: 0, letterSpacing: '-0.02em' }}>
                  {MAIN_LABEL[voiceState]}
                </p>
                <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.55)', margin: '6px 0 0' }}>
                  {SUB_LABEL[voiceState]}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Session log ── */}
          {/* Scrollable conversation history for this Listen Mode session */}
          <div
            ref={sessionLogRef}
            style={{
              position: 'relative', zIndex: 10, width: '100%', maxWidth: 480,
              padding: '0 16px 4px',
              maxHeight: 230, minHeight: 0, overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 6,
              flexShrink: 0,
              scrollbarWidth: 'none',
            }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {sessionLog.map(entry => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'flex', justifyContent: entry.role === 'user' ? 'flex-end' : 'flex-start' }}
                >
                  <div style={{
                    maxWidth: '84%',
                    padding: '7px 12px',
                    borderRadius: entry.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    fontSize: 13, lineHeight: 1.45,
                    color: 'rgba(216,232,248,0.9)',
                    background: entry.role === 'user' ? 'rgba(12,28,70,0.82)' : 'rgba(4,22,18,0.82)',
                    border: entry.role === 'user'
                      ? '1px solid rgba(41,194,230,0.2)'
                      : '1px solid rgba(16,185,129,0.2)',
                    backdropFilter: 'blur(12px)',
                  }}>
                    <div style={{
                      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.16em',
                      marginBottom: 3,
                      color: entry.role === 'user' ? 'rgba(41,194,230,0.55)' : 'rgba(16,185,129,0.6)',
                    }}>
                      {entry.role === 'user' ? 'You' : 'Skippy'}
                    </div>
                    {entry.text.slice(0, 220)}{entry.text.length > 220 ? '\u2026' : ''}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Live transcript while listening */}
            <AnimatePresence>
              {voiceState === 'listening' && transcript && (
                <motion.div
                  key="live-tr"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ display: 'flex', justifyContent: 'flex-end' }}
                >
                  <div style={{
                    maxWidth: '84%', padding: '7px 12px',
                    borderRadius: '14px 14px 4px 14px',
                    fontSize: 13, lineHeight: 1.45,
                    color: 'rgba(41,194,230,0.7)',
                    background: 'rgba(12,28,70,0.55)',
                    border: '1px dashed rgba(41,194,230,0.25)',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 3, color: 'rgba(41,194,230,0.4)' }}>You</div>
                    {transcript}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Live sentence being spoken — stays in sync with Skippy's voice */}
          <AnimatePresence>
            {currentSentence && (
              <motion.div
                key="cur-sentence"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  position: 'relative', zIndex: 10, width: '100%', maxWidth: 480,
                  padding: '0 16px 4px', flexShrink: 0,
                }}
              >
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '8px 14px', borderRadius: '14px 14px 14px 4px',
                  fontSize: 13, lineHeight: 1.45,
                  color: 'rgba(110,231,183,0.95)',
                  background: 'rgba(16,185,129,0.07)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  backdropFilter: 'blur(12px)',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', background: '#10b981',
                    flexShrink: 0, marginTop: 5, animation: 'pulse 1.2s ease-in-out infinite',
                  }} />
                  <span>{currentSentence}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Type-to-speak input ── */}
          <form
            onSubmit={submitTyped}
            style={{
              position: 'relative', zIndex: 10, width: '100%', maxWidth: 460,
              padding: '0 20px 10px', flexShrink: 0,
              display: 'flex', gap: 8, alignItems: 'center',
            }}
          >
            <input
              ref={typeInputRef}
              type="text"
              value={typeInput}
              onChange={e => setTypeInput(e.target.value)}
              placeholder="Type to Skippy\u2026"
              disabled={voiceState === 'processing'}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: 9999, fontSize: 14,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.13)',
                color: 'rgba(216,232,248,0.9)', outline: 'none',
                WebkitAppearance: 'none', appearance: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!typeInput.trim() || voiceState === 'processing'}
              style={{
                padding: 10, borderRadius: '50%',
                cursor: typeInput.trim() ? 'pointer' : 'default',
                background: typeInput.trim() ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${typeInput.trim() ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: typeInput.trim() ? '#6ee7b7' : 'rgba(148,163,184,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.2s',
              }}
            >
              <Send style={{ width: 16, height: 16 }} />
            </button>
          </form>

          {/* ── Controls bar ── */}
          <div style={{
            position: 'relative', zIndex: 10, width: '100%', flexShrink: 0,
            padding: '10px 20px',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {(voiceState === 'speaking' || voiceState === 'greeting') && (
                <button
                  onClick={() => { stopSpeaking(); startListeningRef.current() }}
                  style={{ padding: '9px 20px', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }}
                >
                  Skip &middot; listen
                </button>
              )}
              {voiceState === 'listening' && (
                <button
                  onClick={() => { stopListening(); setVoiceState('ready') }}
                  style={{ padding: '9px 20px', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(41,194,230,0.1)', border: '1px solid rgba(41,194,230,0.3)', color: '#7dd3e8' }}
                >
                  Done talking
                </button>
              )}
              {voiceState === 'ready' && (
                <button
                  onClick={() => startListeningRef.current()}
                  style={{ padding: '9px 20px', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(41,194,230,0.1)', border: '1px solid rgba(41,194,230,0.25)', color: '#7dd3e8' }}
                >
                  Tap to speak
                </button>
              )}
              {voiceState === 'processing' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(167,139,250,0.8)', fontSize: 13 }}>
                  <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                  Thinking&hellip;
                </div>
              )}
              {voiceState === 'error' && (
                <button
                  onClick={() => { setVoiceState('ready'); startListeningRef.current() }}
                  style={{ padding: '9px 20px', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}
                >
                  Try again
                </button>
              )}
              <button
                onClick={() => setMuted(m => !m)}
                title={muted ? 'Unmute Skippy' : "Mute Skippy's voice"}
                style={{
                  padding: 10, borderRadius: '50%', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: muted ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${muted ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
                  color: muted ? '#fca5a5' : 'rgba(148,163,184,0.6)',
                }}
              >
                {muted ? <VolumeX style={{ width: 16, height: 16 }} /> : <Volume2 style={{ width: 16, height: 16 }} />}
              </button>
            </div>
            {!micAllowed && (
              <p style={{ fontSize: 11, color: 'rgba(239,68,68,0.75)', textAlign: 'center', margin: 0, lineHeight: 1.4 }}>
                Microphone blocked. Allow microphone in browser settings and refresh.
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // ── Listen Mode trigger button ────────────────────────────────────────────

  return (
    <>
      <button
        onClick={manualActivate}
        disabled={!!chatBusy}
        title={open ? 'Exit Listen Mode' : 'Enter Listen Mode — voice chat with Skippy'}
        className={cn(
          'relative flex items-center gap-1.5 px-3 py-2 rounded-full transition-all duration-200 group border',
          chatBusy
            ? 'opacity-30 cursor-not-allowed border-border'
            : open
            ? 'border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/15 active:scale-95 cursor-pointer'
            : 'border-accent/35 bg-accent/5 hover:border-accent/70 hover:bg-accent/10 active:scale-95 cursor-pointer',
          className,
        )}
        style={voiceState === 'listening' && open ? {
          boxShadow:   `0 0 ${12 + volumeLevel * 20}px rgba(41,194,230,${0.35 + volumeLevel * 0.45})`,
          borderColor: `rgba(41,194,230,${0.55 + volumeLevel * 0.35})`,
        } : {}}
      >
        {voiceState === 'processing' && open
          ? <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin flex-shrink-0" />
          : voiceState === 'speaking' || voiceState === 'greeting'
          ? <Volume2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          : voiceState === 'listening' && open
          ? <Mic className="w-3.5 h-3.5 text-accent animate-pulse flex-shrink-0" />
          : <Mic className="w-3.5 h-3.5 text-muted group-hover:text-accent transition-colors flex-shrink-0" />
        }
        <span className={cn(
          'text-xs font-semibold transition-colors',
          open && (voiceState === 'speaking' || voiceState === 'greeting') ? 'text-emerald-400'
          : open && voiceState === 'listening' ? 'text-accent'
          : open && voiceState === 'processing' ? 'text-purple-400'
          : open ? 'text-emerald-300/80'
          : 'text-muted/70 group-hover:text-accent',
        )}>
          {open ? 'Listening' : 'Listen'}
        </span>
        {/* Session exchange count badge */}
        {sessionLog.filter(e => e.role === 'user').length > 0 && open && (
          <span style={{
            fontSize: 9, fontWeight: 700, lineHeight: 1,
            padding: '1px 5px', borderRadius: 9999,
            background: 'rgba(16,185,129,0.2)', color: 'rgba(110,231,183,0.8)',
            border: '1px solid rgba(16,185,129,0.3)',
          }}>
            {sessionLog.filter(e => e.role === 'user').length}
          </span>
        )}
      </button>

      {/* Portal: renders directly to document.body, outside all CSS stacking contexts */}
      {mounted && createPortal(overlayContent, document.body)}
    </>
  )
}
