/**
 * POST /api/push/test
 * Sends a real server-side push notification to the registered device.
 * Uses actual pending items to make it feel real.
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

    // Build a meaningful test message from real data
    const [pendingTodos, pendingReminders, userProfile] = await Promise.all([
      prisma.todo.findMany({ where: { isDone: false }, orderBy: [{ priority: 'desc' }], take: 3 }),
      prisma.reminder.findMany({ where: { isDone: false }, orderBy: { dueDate: 'asc' }, take: 2 }),
      prisma.userProfile.findUnique({ where: { id: 'singleton' } }),
    ])

    const name = userProfile?.name ? `, ${userProfile.name}` : ''
    let body: string

    if (pendingTodos.length > 0) {
      const first = pendingTodos[0].content
      const rest  = pendingTodos.length - 1
      body = rest > 0
        ? `You have "${first}" and ${rest} other task${rest !== 1 ? 's' : ''} waiting.`
        : `Don't forget: "${first}"`
    } else if (pendingReminders.length > 0) {
      body = `Reminder: "${pendingReminders[0].content}"`
    } else {
      body = `Hey${name} — Skippy here. Push notifications are working!`
    }

    const result = await sendPushToAll({
      title: `Skippy 🔔`,
      body,
      url: '/todos',
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

