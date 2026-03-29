import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * POST /api/push/subscribe
 * Save (or upsert) the browser's PushSubscription JSON.
 * Body: { endpoint, keys: { p256dh, auth } }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
    }

    const { endpoint, keys } = body
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }

    await prisma.pushSubscription.upsert({
      where:  { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { p256dh: keys.p256dh, auth: keys.auth },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[push/subscribe] error:', err)
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
  }
}

/**
 * DELETE /api/push/subscribe
 * Remove a subscription when the user revokes permission.
 * Body: { endpoint }
 */
export async function DELETE(req: Request) {
  try {
    const { endpoint } = await req.json() as { endpoint?: string }
    if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
    await prisma.pushSubscription.delete({ where: { endpoint } }).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true }) // idempotent
  }
}
