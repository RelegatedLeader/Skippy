/**
 * POST /api/push/test
 * Sends a real server-side push notification to all registered devices.
 * Returns detailed error info so the Settings UI can surface exactly what failed.
 */
import { NextResponse } from 'next/server'
import { sendPushToAll } from '@/lib/push'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST() {
  try {
    const subCount = await prisma.pushSubscription.count()
    if (subCount === 0) {
      return NextResponse.json(
        { error: 'No subscriptions found. Tap "Register device" first, then retry.' },
        { status: 400 }
      )
    }

    const result = await sendPushToAll({
      title: 'Skippy 🔔',
      body: "Test notification — everything is working! I'll ping you about things that are due.",
      url: '/chat',
      tag: `skippy-test-${Date.now()}`,
    })

    if (result.sent === 0) {
      return NextResponse.json(
        { error: result.errors[0] || 'Push delivery failed — tap "Register device" again then retry.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, sent: result.sent })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[push/test] crash:', msg)
    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 })
  }
}
