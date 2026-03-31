/**
 * Neural TTS — Amazon Polly "Matthew" (US male) via StreamElements.
 * Simple HTTP GET, no API key, no WebSocket, ~1-2s response on Vercel.
 */

export const runtime     = 'nodejs'
export const maxDuration = 15

const SE_VOICE = 'Matthew'  // Amazon Polly Neural — warm, natural US male

function cleanText(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g,     '$1')
    .replace(/`(.+?)`/g,       '$1')
    .replace(/#{1,6}\s/g,      '')
    .replace(/\n+/g,           ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
    .slice(0, 400)
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { text?: string }
    if (!body.text || typeof body.text !== 'string') {
      return new Response('Missing text', { status: 400 })
    }
    const clean = cleanText(body.text)
    if (!clean) return new Response('Empty text', { status: 400 })

    const url = `https://api.streamelements.com/kappa/v2/speech?voice=${SE_VOICE}&text=${encodeURIComponent(clean)}`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Skippy-TTS/1.0)' },
    })

    if (!res.ok) return new Response('TTS unavailable', { status: 503 })
    const ab = await res.arrayBuffer()
    if (!ab.byteLength) return new Response('TTS unavailable', { status: 503 })

    return new Response(new Uint8Array(ab), {
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
  return Response.json({ status: 'ok', voice: `streamelements-${SE_VOICE}` })
}
