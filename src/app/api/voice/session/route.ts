/**
 * POST /api/voice/session
 *
 * Creates an ephemeral per-session AES-256-GCM key for voice encryption.
 * Returns the sessionId + key material to the client.
 * The key is also stored server-side in memory (TTL: 30 minutes).
 *
 * The client uses the key to encrypt audio before sending.
 * The server uses the same key to decrypt.
 * Key never persists to disk or database.
 */

import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { voiceSessionStore } from '@/lib/voice-session'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  const { allowed } = checkRateLimit(`voice-session:${ip}`, 10, 60_000)
  if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const sessionId = randomBytes(16).toString('hex')
  const keyHex = randomBytes(32).toString('hex')  // 256-bit AES key

  voiceSessionStore.set(sessionId, keyHex)

  return NextResponse.json({
    sessionId,
    keyHex,  // transmitted over HTTPS — client stores in memory only, never on disk
    expiresIn: 1800,  // 30 minutes
  })
}

// DELETE: explicit session teardown
export async function DELETE(req: Request) {
  try {
    const { sessionId } = await req.json() as { sessionId?: string }
    if (sessionId) voiceSessionStore.delete(sessionId)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
