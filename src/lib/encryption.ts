/**
 * AES-256-GCM encryption for note content at rest.
 * Encrypted format: hex(iv):hex(authTag):hex(ciphertext)
 *
 * Set ENCRYPTION_KEY in .env to a 64-character hex string (32 bytes).
 * Generate a new key with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm' as const

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex) {
    // Development fallback — all zeros key (NOT secure, but allows the app to run without a key)
    console.warn('[Skippy] ENCRYPTION_KEY not set — using insecure zero key. Set it in .env.')
    return Buffer.alloc(32, 0)
  }
  const buf = Buffer.from(keyHex, 'hex')
  if (buf.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)')
  }
  return buf
}

/** Returns true if the string looks like our encrypted format */
export function isEncrypted(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  const parts = value.split(':')
  return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32
}

/** Encrypt a UTF-8 string. Returns iv:authTag:ciphertext (all hex). */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext
  try {
    const key = getKey()
    const iv = randomBytes(16)
    const cipher = createCipheriv(ALGO, key, iv)
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ])
    const authTag = cipher.getAuthTag()
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
  } catch (err) {
    console.error('[Skippy Crypto] Encryption failed:', err)
    return plaintext // fail open — better than data loss
  }
}

/** Decrypt an encrypted string. Returns plaintext. Backward-compatible with unencrypted strings. */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext
  if (!isEncrypted(ciphertext)) return ciphertext // not encrypted — return as-is (migration path)
  try {
    const [ivHex, tagHex, dataHex] = ciphertext.split(':')
    const key = getKey()
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  } catch (err) {
    console.error('[Skippy Crypto] Decryption failed:', err)
    return '' // auth tag mismatch — tampered data
  }
}

/** Generate a new secure encryption key (hex string) */
export function generateKey(): string {
  return randomBytes(32).toString('hex')
}
