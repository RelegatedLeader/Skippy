import { NextResponse } from 'next/server'
import { grok, GROK_MODEL } from '@/lib/grok'

export const runtime = 'nodejs'

/** Temporary diagnostic endpoint — tests Grok API reachability from Vercel. Remove after debugging. */
export async function GET() {
  const start = Date.now()
  try {
    const res = await grok.chat.completions.create({
      model: GROK_MODEL,
      messages: [{ role: 'user', content: 'Say exactly: ok' }],
      max_tokens: 5,
      stream: false,
    })
    const elapsed = Date.now() - start
    return NextResponse.json({
      ok: true,
      model: GROK_MODEL,
      response: res.choices[0]?.message?.content,
      elapsed_ms: elapsed,
      key_prefix: process.env.GROK_API_KEY?.slice(0, 12) + '…',
    })
  } catch (err) {
    const elapsed = Date.now() - start
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      error_type: err instanceof Error ? err.constructor.name : 'Unknown',
      elapsed_ms: elapsed,
      key_prefix: process.env.GROK_API_KEY?.slice(0, 12) + '…',
    }, { status: 500 })
  }
}
