import { NextResponse } from 'next/server'
import { grok, GROK_MODEL } from '@/lib/grok'
import { anthropic, CLAUDE_MODEL } from '@/lib/claude'

export const runtime = 'nodejs'

/** Temporary diagnostic endpoint — tests both AI APIs from Vercel. */
export async function GET() {
  const results: Record<string, unknown> = {}

  // Test Grok
  const grokStart = Date.now()
  try {
    const res = await grok.chat.completions.create({
      model: GROK_MODEL,
      messages: [{ role: 'user', content: 'Say: ok' }],
      max_tokens: 5,
      stream: false,
    })
    results.grok = { ok: true, response: res.choices[0]?.message?.content, elapsed_ms: Date.now() - grokStart }
  } catch (err) {
    results.grok = { ok: false, error: err instanceof Error ? err.message : String(err), elapsed_ms: Date.now() - grokStart }
  }

  // Test Claude
  const claudeStart = Date.now()
  try {
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say: ok' }],
    })
    const text = res.content[0]?.type === 'text' ? res.content[0].text : ''
    results.claude = { ok: true, response: text, elapsed_ms: Date.now() - claudeStart }
  } catch (err) {
    results.claude = { ok: false, error: err instanceof Error ? err.message : String(err), elapsed_ms: Date.now() - claudeStart }
  }

  return NextResponse.json(results)
}
