/**
 * Neural TTS via Microsoft Edge TTS (msedge-tts).
 * Voice: en-US-GuyNeural — warm, friendly American male.
 * No API key required. Same WebSocket endpoint powering Edge "Read Aloud".
 * Returns MP3 audio decoded by the browser's AudioContext.
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

export const runtime = 'nodejs'
export const maxDuration = 30

const VOICE          = 'en-US-GuyNeural'   // warm friendly American male
const VOICE_FALLBACK = 'en-US-EricNeural'  // backup

function cleanText(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
    .slice(0, 600)
}

async function synthesize(text: string, voice: string): Promise<Buffer> {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    const { audioStream } = tts.toStream(text)
    audioStream.on('data',  (chunk: Buffer) => chunks.push(chunk))
    audioStream.on('end',   ()              => resolve(Buffer.concat(chunks)))
    audioStream.on('error', reject)
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { text?: string }
    if (!body.text || typeof body.text !== 'string') {
      return new Response('Missing text', { status: 400 })
    }
    const clean = cleanText(body.text)
    if (!clean) return new Response('Empty text', { status: 400 })

    let mp3: Buffer
    try {
      mp3 = await synthesize(clean, VOICE)
    } catch {
      mp3 = await synthesize(clean, VOICE_FALLBACK)
    }

    return new Response(new Uint8Array(mp3), {
      headers: {
        'Content-Type':  'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-TTS-Voice':   VOICE,
      },
    })
  } catch (err) {
    console.error('[TTS]', err)
    // 503 → VoiceMode falls back to Web Speech API
    return new Response('TTS unavailable', { status: 503 })
  }
}

export async function GET() {
  return new Response(
    JSON.stringify({ status: 'ok', voice: VOICE, engine: 'msedge-tts' }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
