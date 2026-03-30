/**
 * POST /api/push/test
 * Sends a real server-side push notification to all registered devices.
 * Used by the Settings page "Send test" button to verify the full push pipeline.
 */
import { NextResponse } from 'next/server'
import { sendPushToAll } from '@/lib/push'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST() {
  const subCount = await prisma.pushSubscription.count()
  if (subCount === 0) {
    return NextResponse.json({ error: 'No push subscriptions registered. Try re-enabling notifications.' }, { status: 400 })
  }

  await sendPushToAll({
    title: 'Skippy 🔔',
    body: "Test notification — everything is working! I'll ping you when things are due.",
    url: '/chat',
    tag: `skippy-test-${Date.now()}`,
  })

  return NextResponse.json({ ok: true, sent: subCount })
}
