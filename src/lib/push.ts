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

/**
 * Send a push notification to every stored subscription.
 * Stale / invalid subscriptions are automatically pruned from the DB.
 */
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  const { publicKey, privateKey, contact } = getVapidConfig()
  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID keys not configured — skipping push')
    return
  }

  webPush.setVapidDetails(`mailto:${contact.replace('mailto:', '')}`, publicKey, privateKey)

  const subs = await prisma.pushSubscription.findMany()
  if (subs.length === 0) return

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          { TTL: 86400 } // 24-hour time-to-live
        )
      } catch (err: unknown) {
        // 404/410 = subscription expired or unsubscribed — remove from DB
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
        } else {
          console.error('[push] Failed to send to subscription:', sub.endpoint.slice(-20), err)
        }
      }
    })
  )
}
