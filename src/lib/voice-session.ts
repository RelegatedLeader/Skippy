/**
 * In-memory ephemeral voice session store.
 *
 * Maps sessionId → { keyHex, createdAt, lastUsedAt }
 * Sessions expire after 30 minutes of inactivity.
 * Runs a cleanup sweep every 5 minutes.
 *
 * This is intentionally NOT backed by a database — keys must die
 * when the process shuts down (Vercel function restarts = automatic rotation).
 */

interface VoiceSession {
  keyHex: string
  createdAt: number
  lastUsedAt: number
}

const TTL_MS = 30 * 60 * 1000  // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

class VoiceSessionStore {
  private store = new Map<string, VoiceSession>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Start periodic cleanup (only in server environments)
    if (typeof setInterval !== 'undefined') {
      this.cleanupTimer = setInterval(() => this._sweep(), CLEANUP_INTERVAL_MS)
      // Allow Node to exit even if timer is running
      if (this.cleanupTimer?.unref) this.cleanupTimer.unref()
    }
  }

  set(sessionId: string, keyHex: string): void {
    const now = Date.now()
    this.store.set(sessionId, { keyHex, createdAt: now, lastUsedAt: now })
  }

  get(sessionId: string): VoiceSession | undefined {
    const session = this.store.get(sessionId)
    if (!session) return undefined
    if (Date.now() - session.lastUsedAt > TTL_MS) {
      this.store.delete(sessionId)
      return undefined
    }
    return session
  }

  touch(sessionId: string): void {
    const session = this.store.get(sessionId)
    if (session) session.lastUsedAt = Date.now()
  }

  delete(sessionId: string): void {
    // Overwrite key material before deletion (defense in depth)
    const session = this.store.get(sessionId)
    if (session) {
      session.keyHex = '0'.repeat(session.keyHex.length)
    }
    this.store.delete(sessionId)
  }

  private _sweep(): void {
    const cutoff = Date.now() - TTL_MS
    const entries = Array.from(this.store.entries())
    for (const [id, session] of entries) {
      if (session.lastUsedAt < cutoff) {
        this.delete(id)
      }
    }
  }
}

// Singleton — persists across requests within a single Vercel function instance
export const voiceSessionStore = new VoiceSessionStore()
