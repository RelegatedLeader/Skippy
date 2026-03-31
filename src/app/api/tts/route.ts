/**
 * Neural TTS endpoint using Kokoro-82M (free, on-device quality).
 * Voice: am_puck — warm, friendly American male (Grade B).
 *
 * The model is downloaded from HuggingFace on first call and cached
 * in the module-level singleton for subsequent warm invocations.
 */

import { KokoroTTS } from 'kokoro-js'

export const runtime = 'nodejs'
export const maxDuration = 60

// ── Singleton — cached between warm function invocations ──────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ttsPromise: Promise<any> | null = null

function getTTS() {
  if (!ttsPromise) {
    ttsPromise = KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8',   // ~82 MB — fits well in Vercel /tmp
      device: 'cpu', // Node.js runtime
    }).catch((err: unknown) => {
      ttsPromise = null // allow retry on next request
      throw err
    })
  }
  return ttsPromise
}

export async function POST(req: Request) {
  try {
    const { text, voice = 'am_puck' } = await req.json() as { text?: string; voice?: string }

    if (!text || typeof text !== 'string') {
      return new Response('Missing text', { status: 400 })
    }

    // Sanitize
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n+/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim()
      .slice(0, 500)

    if (!clean) return new Response('Empty text', { status: 400 })

    const tts = await getTTS()
    const audio = await tts.generate(clean, { voice })

    // RawAudio.toBlob() returns a WAV Blob
    const blob = audio.toBlob() as Blob
    const buffer = await blob.arrayBuffer()

    return new Response(buffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'no-store',
        'X-TTS-Voice': voice,
      },
    })
  } catch (err) {
    console.error('[TTS API]', err)
    // Return 503 so the client falls back to Web Speech API
    return new Response('Neural TTS unavailable — using fallback', { status: 503 })
  }
}

// Allow GET for health-check
export async function GET() {
  return new Response(JSON.stringify({ status: 'ok', voice: 'am_puck (Kokoro-82M)' }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
