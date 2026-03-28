/**
 * Session verification — Edge runtime compatible.
 * Only uses Web Crypto API (crypto.subtle + globalThis). Safe to import in middleware.
 */

export const SESSION_COOKIE = 'skippy_session'
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

function getSecret(): string {
  return process.env.SESSION_SECRET || 'dev-insecure-change-this-in-production'
}

function base64urlToUint8Array(b64url: string): Uint8Array<ArrayBuffer> {
  // Convert base64url → base64 → binary
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')
  const bin = atob(padded)
  return Uint8Array.from(bin, c => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const dotIdx = token.lastIndexOf('.')
    if (dotIdx === -1) return false
    const data = token.slice(0, dotIdx)
    const sig = token.slice(dotIdx + 1)

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(getSecret()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64urlToUint8Array(sig),
      new TextEncoder().encode(data),
    )
    if (!valid) return false

    const payloadBytes = base64urlToUint8Array(data)
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes))
    return typeof payload.exp === 'number' && Date.now() < payload.exp
  } catch {
    return false
  }
}
