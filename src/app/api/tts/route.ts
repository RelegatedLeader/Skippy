/**
 * Neural TTS — runs TWO engines in parallel, returns whichever responds first:
 *   1. en-US-GuyNeural   (Microsoft Edge WebSocket — warm American male)
 *   2. Matthew           (Amazon Polly Neural via StreamElements — natural US male)
 *
 * No API key required for either. First success wins — typical latency 1-3s.
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

export const runtime     = 'nodejs'
export const maxDuration = 25

const EDGE_VOICE = 'en-US-GuyNeural'
const SE_VOICE   = 'Matthew'   // Amazon Polly Neural US male

function cleanText(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g,     '$1')
    .replace(/`(.+?)`/g,       '$1')
    .replace(/#{1,6}\s/g,      '')
    .replace(/\n+/g,           ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
    .slice(0, 500)
}

/** Microsoft Edge TTS (WebSocket). Returns null on any failure. */
async function tryEdgeTTS(text: string): Promise<Buffer | null> {
  try {
    const tts = new MsEdgeTTS()
    await tts.setMetadata(EDGE_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
    return await Promise.race<Buffer | null>([
      new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        const { audioStream } = tts.toStream(text)
        audioStream.on('data',  (c: Buffer) => chunks.push(c))
        audioStream.on('end',   ()          => resolve(Buffer.concat(chunks)))
        audioStream.on('error', reject)
      }),
      // Hard cap — don't block StreamElements from winning
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 7_000)),
    ])
  } catch {
    return null
  }
}

/** StreamElements → Amazon Polly Neural (Matthew). Simple HTTP GET, no WebSocket. */
async function tryStreamElements(text: string): Promise<Buffer | null> {
  try {
    const url = `https://api.streamelements.com/kappa/v2/speech?voice=${SE_VOICE}&text=${encodeURIComponent(text.slice(0, 400))}`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Skippy-TTS/1.0)' },
    })
    if (!res.ok) return null
    const ab = await res.arrayBuffer()
    return ab.byteLength ? Buffer.from(ab) : null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { text?: string }
    if (!body.text || typeof body.text !== 'string') {
      return new Response('Missing text', { status: 400 })
    }
    const clean = cleanText(body.text)
    if (!clean) return new Response('Empty text', { status: 400 })

    // Fire both engines simultaneously — resolve with the first non-null buffer.
    // If one engine is broken (Vercel WebSocket issues etc.) the other still wins.
    const mp3 = await Promise.any([
      tryEdgeTTS(clean).then(b       => b ?? Promise.reject('edge-null')),
      tryStreamElements(clean).then(b => b ?? Promise.reject('se-null')),
    ]).catch(() => null as Buffer | null)

    if (!mp3) return new Response('TTS unavailable', { status: 503 })

    return new Response(new Uint8Array(mp3), {
      headers: {
        'Content-Type':  'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[TTS]', err)
    return new Response('TTS unavailable', { status: 503 })
  }
}

export async function GET() {
  return Response.json({ status: 'ok', primary: EDGE_VOICE, fallback: `streamelements-${SE_VOICE}` })
}
