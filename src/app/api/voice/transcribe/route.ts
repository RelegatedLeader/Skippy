/**
 * POST /api/voice/transcribe
 *
 * Receives an encrypted audio blob, decrypts it server-side using the
 * per-session AES-256-GCM key negotiated via /api/voice/session,
 * runs Whisper STT (OpenAI API), and returns the transcript.
 *
 * Security model:
 *  - Audio never travels in plaintext over the wire.
 *  - Each voice session gets a unique 256-bit AES-GCM key (ephemeral).
 *  - IV is sent alongside ciphertext, key is stored server-side in memory only.
 *  - Rate-limited to 30 voice transcriptions per minute per IP.
 */

import { NextResponse } from 'next/server'
import { createDecipheriv } from 'crypto'
import { voiceSessionStore } from '@/lib/voice-session'
import { checkRateLimit } from '@/lib/rate-limit'
import OpenAI from 'openai'
import { toFile } from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 30

// Whisper via OpenAI directly (Grok doesn't expose Whisper yet)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  const { allowed } = checkRateLimit(`voice-stt:${ip}`, 30, 60_000)
  if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  try {
    const { sessionId, iv, ciphertext, mimeType = 'audio/webm' } = await req.json() as {
      sessionId: string
      iv: string          // base64
      ciphertext: string  // base64
      mimeType?: string
    }

    if (!sessionId || !iv || !ciphertext) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Retrieve ephemeral session key
    const session = voiceSessionStore.get(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired voice session' }, { status: 401 })
    }

    // Decrypt audio
    const keyBuf = Buffer.from(session.keyHex, 'hex')
    const ivBuf = Buffer.from(iv, 'base64')
    const cipherBuf = Buffer.from(ciphertext, 'base64')

    // Last 16 bytes of cipherBuf are the GCM auth tag
    const authTag = cipherBuf.subarray(cipherBuf.length - 16)
    const encrypted = cipherBuf.subarray(0, cipherBuf.length - 16)

    const decipher = createDecipheriv('aes-256-gcm', keyBuf, ivBuf)
    decipher.setAuthTag(authTag)
    const audioBuf = Buffer.concat([decipher.update(encrypted), decipher.final()])

    // Determine file extension from mimeType
    const ext = mimeType.includes('ogg') ? 'ogg'
      : mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
      : mimeType.includes('wav') ? 'wav'
      : 'webm'

    const audioFile = await toFile(audioBuf, `audio.${ext}`, { type: mimeType })

    // Transcribe via Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en',
      prompt: 'Skippy personal AI assistant. Natural conversation, may include task requests, reminders, notes.',
    })

    // Touch session (extend TTL on activity)
    voiceSessionStore.touch(sessionId)

    return NextResponse.json({ transcript: transcription.text.trim() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Mask internal errors
    if (msg.includes('Unsupported Authentication') || msg.includes('auth tag')) {
      return NextResponse.json({ error: 'Audio integrity check failed' }, { status: 400 })
    }
    console.error('[Voice STT]', err)
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
  }
}
