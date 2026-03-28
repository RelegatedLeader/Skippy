/**
 * Authentication utilities — Node.js runtime only.
 * Do NOT import this in middleware (Edge runtime). Use src/lib/session.ts instead.
 */
import crypto from 'node:crypto'
import { prisma } from './db'

// ─── Credential Generation ────────────────────────────────────────────────────

export function generateCredentials() {
  const username = `skippy-${crypto.randomBytes(4).toString('hex')}`
  const password = crypto.randomBytes(24).toString('base64url') // ~32 chars, URL-safe
  const rawCode = crypto.randomBytes(6).toString('hex').toUpperCase()
  const accessCode = `${rawCode.slice(0, 4)}-${rawCode.slice(4, 8)}-${rawCode.slice(8, 12)}`
  return { username, password, accessCode }
}

// ─── Hashing — PBKDF2-SHA256, 210,000 iterations (OWASP recommended) ─────────

export async function hashSecret(secret: string): Promise<string> {
  const salt = crypto.randomBytes(32)
  const key = await pbkdf2Async(secret, salt)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  try {
    const derived = await pbkdf2Async(secret, Buffer.from(saltHex, 'hex'))
    return crypto.timingSafeEqual(derived, Buffer.from(hashHex, 'hex'))
  } catch {
    return false
  }
}

function pbkdf2Async(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(secret, salt, 210_000, 32, 'sha256', (err, key) => {
      if (err) reject(err)
      else resolve(key)
    })
  })
}

// ─── Session Creation (Node HMAC — compatible with Edge verify) ───────────────

export function createSessionToken(): string {
  const payload = {
    auth: true,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    jti: crypto.randomBytes(8).toString('hex'),   // unique token id
  }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const secret = process.env.SESSION_SECRET || 'dev-insecure-change-this-in-production'
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

export async function getAuth() {
  return prisma.auth.findUnique({ where: { id: 'singleton' } })
}

export async function isSetup(): Promise<boolean> {
  const auth = await getAuth()
  return !!auth
}
