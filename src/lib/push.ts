/**
 * Web Push helper — sends a push notification to all stored subscriptions.
 * VAPID keys must be set as environment variables:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY   (safe to expose to the client)
 *   VAPID_PRIVATE_KEY              (server-only, never sent to browser)
 *   VAPID_CONTACT_EMAIL            (e.g. "you@example.com")
 */
import webPush from 'web-push'
import { prisma } from './db'

function getVapidConfig() {
  const publicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const contact    = process.env.VAPID_CONTACT_EMAIL || 'mailto:admin@skippy.app'
  return { publicKey, privateKey, contact }
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  requireInteraction?: boolean
}

export interface PushResult {
  sent: number
  failed: number
  errors: string[]
}

/**
 * Send a push notification to every stored subscription.
 * Returns counts of sent/failed so callers can surface errors.
 * Stale / invalid subscriptions (404/410) are pruned from the DB.
 */
export async function sendPushToAll(payload: PushPayload): Promise<PushResult> {
  const { publicKey, privateKey, contact } = getVapidConfig()
  if (!publicKey || !privateKey) {
    return { sent: 0, failed: 0, errors: ['VAPID keys not configured on server'] }
  }

  webPush.setVapidDetails(`mailto:${contact.replace('mailto:', '')}`, publicKey, privateKey)

  const subs = await prisma.pushSubscription.findMany()
  if (subs.length === 0) return { sent: 0, failed: 0, errors: [] }

  let sent = 0
  const errors: string[] = []

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          { TTL: 86400 }
        )
        sent++
      } catch (err: unknown) {
        const e = err as { statusCode?: number; body?: string; message?: string }
        const status = e.statusCode
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
          errors.push(`Subscription expired (${status}) — re-register device`)
        } else {
          const detail = e.body || e.message || String(err)
          errors.push(`Send failed (${status ?? 'unknown'}): ${detail}`)
          console.error('[push] Failed:', sub.endpoint.slice(-20), detail)
        }
      }
    })
  )

  return { sent, failed: errors.length, errors }
}
