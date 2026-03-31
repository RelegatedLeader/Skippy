'use client'

/**
 * GlobalVoiceListener
 *
 * Mounts once in ClientProviders. Passively listens for the wake word "Skippy"
 * via the browser's SpeechRecognition API. When heard, navigates to /chat?voice=1
 * which auto-launches the full VoiceMode overlay.
 *
 * Design decisions:
 * - When already on /chat, this listener stays silent — VoiceMode in ChatInterface
 *   owns the SpeechRecognition while on that page (avoids duplicate instances).
 * - Requests mic permission on first user interaction (click/touch anywhere) to
 *   avoid an abrupt permission prompt on hard load.
 * - No audio is processed by this component — recognition runs entirely on-device.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Mic } from 'lucide-react'

const WAKE_WORDS = ['skippy', 'skip', 'hey skippy', 'hey skip', 'ok skippy', 'ok skip', 'yo skippy', 'skipy', 'skipper']

export function GlobalVoiceListener() {
  const router   = useRouter()
  const pathname = usePathname()

  const recognRef      = useRef<SpeechRecognition | null>(null)
  const activeRef      = useRef(false)
  const permissionRef  = useRef<'unknown' | 'granted' | 'denied'>('unknown')
  const [showPrompt, setShowPrompt] = useState(false)
  const [permDenied, setPermDenied] = useState(false)

  // ── Check / request mic permission ──────────────────────────────────────────

  const checkPermission = useCallback(async () => {
    if (typeof navigator === 'undefined') return false
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      permissionRef.current = result.state === 'granted' ? 'granted'
        : result.state === 'denied'  ? 'denied'
        : 'unknown'
      result.onchange = () => {
        permissionRef.current = result.state === 'granted' ? 'granted' : 'denied'
        if (result.state === 'granted') { setShowPrompt(false); startListening() }
        if (result.state === 'denied')  setPermDenied(true)
      }
      return result.state === 'granted'
    } catch {
      // permissions API not available (Firefox, some iOS) — just try
      return true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const requestPermissionNow = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop()) // don't hold the stream
      permissionRef.current = 'granted'
      setShowPrompt(false)
      startListening()
    } catch {
      permissionRef.current = 'denied'
      setPermDenied(true)
      setShowPrompt(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Wake word listener ──────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    // Don't run on chat page — VoiceMode's own listener handles that page
    if (pathname?.startsWith('/chat')) return
    // Don't run on login/setup
    if (pathname?.startsWith('/login') || pathname?.startsWith('/setup')) return
    if (activeRef.current) return
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) return

    const SR = (window.SpeechRecognition || window.webkitSpeechRecognition) as typeof SpeechRecognition
    const recog   = new SR()
    recog.continuous      = true
    recog.interimResults  = true
    recog.lang            = 'en-US'
    recog.maxAlternatives = 1

    let slidingWindow = ''

    recog.onresult = (event) => {
      const latest = event.results[event.results.length - 1]
      const word   = latest[0].transcript.toLowerCase().trim()
      slidingWindow = (slidingWindow + ' ' + word).split(' ').slice(-6).join(' ')
      if (WAKE_WORDS.some(w => slidingWindow.includes(w))) {
        slidingWindow = ''
        // Navigate to chat → VoiceMode auto-activates via ?voice=1
        router.push('/chat?voice=1')
      }
    }

    recog.onerror = (e: SpeechRecognitionErrorEvent) => {
      activeRef.current = false
      recognRef.current = null
      if (e.error === 'not-allowed') {
        permissionRef.current = 'denied'
        setPermDenied(true)
      }
    }

    recog.onend = () => {
      activeRef.current = false
      recognRef.current = null
      // Restart unless we navigated to chat or permission was denied
      if (permissionRef.current !== 'denied' && !window.location.pathname.startsWith('/chat')) {
        setTimeout(startListening, 600)
      }
    }

    recognRef.current = recog
    activeRef.current = true
    try { recog.start() } catch { activeRef.current = false }
  }, [pathname, router])

  // ── Mount: check permission then start ──────────────────────────────────────

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const granted = await checkPermission()
      if (!mounted) return
      if (granted) {
        startListening()
      } else if (permissionRef.current === 'unknown') {
        // Show a soft permission banner after 2 seconds
        setTimeout(() => { if (mounted) setShowPrompt(true) }, 2000)
      }
    }

    init()
    return () => { mounted = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restart / stop when route changes ──────────────────────────────────────

  useEffect(() => {
    if (pathname?.startsWith('/chat')) {
      // Stop — yield to VoiceMode
      recognRef.current?.stop()
      activeRef.current = false
    } else if (permissionRef.current === 'granted') {
      startListening()
    }
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      recognRef.current?.stop()
      activeRef.current = false
    }
  }, [])

  // ── Permission prompt (soft banner at top) ──────────────────────────────────

  if (permDenied || (!showPrompt && !permDenied)) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[300] flex items-center justify-between gap-3 px-4 py-3 text-sm"
      style={{
        background: 'rgba(10,20,42,0.97)',
        borderBottom: '1px solid rgba(41,194,230,0.2)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Mic className="w-4 h-4 flex-shrink-0" style={{ color: '#29c2e6' }} />
        <span className="text-xs text-foreground/80 leading-snug">
          Enable mic so you can say <strong className="text-foreground">"Skippy"</strong> from anywhere
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => setShowPrompt(false)}
          className="text-xs text-muted/50 hover:text-muted transition-colors px-1 py-1"
        >
          Later
        </button>
        <button
          onClick={requestPermissionNow}
          className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all active:scale-95"
          style={{ background: 'rgba(41,194,230,0.15)', border: '1px solid rgba(41,194,230,0.3)', color: '#29c2e6' }}
        >
          Allow
        </button>
      </div>
    </div>
  )
}
