/**
 * POST /api/cron/daily-brief
 *
 * Runs every morning (see vercel.json crons).
 * Sends a push notification with a briefing of what's due today.
 *
 * Protected by CRON_SECRET environment variable.
 * Vercel automatically sends: Authorization: Bearer {CRON_SECRET}
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPushToAll } from '@/lib/push'
import { grok, GROK_MODEL } from '@/lib/grok'

export const runtime = 'nodejs'
export const maxDuration = 30

function verifyCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function POST(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Check if at least one push subscription exists
    const subCount = await prisma.pushSubscription.count()
    if (subCount === 0) return NextResponse.json({ ok: true, skipped: 'no subscriptions' })

    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayEnd   = new Date(now)
    todayEnd.setUTCHours(23, 59, 59, 999)

    // Get todos due today and overdue + pending reminders due today
    const [todayTodos, overdueReminders, userProfile] = await Promise.all([
      prisma.todo.findMany({
        where: {
          isDone: false,
          OR: [
            { dueDate: { gte: todayStart, lte: todayEnd } },
            { dueDate: { lt: todayStart } }, // overdue
          ],
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
        take: 10,
      }),
      prisma.reminder.findMany({
        where: {
          isDone: false,
          dueDate: { lte: todayEnd },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      prisma.userProfile.findUnique({ where: { id: 'singleton' } }),
    ])

    const todoCount     = todayTodos.length
    const reminderCount = overdueReminders.length
    const name          = userProfile?.name || 'there'

    // Build a short, punchy message with AI
    const taskLines = [
      ...todayTodos.map(t => `- ${t.content}`),
      ...overdueReminders.map(r => `- ⏰ ${r.content}`),
    ].join('\n')

    let body = ''

    if (todoCount === 0 && reminderCount === 0) {
      body = "Nothing due today — clear slate. Use the time well."
    } else {
      try {
        const res = await grok.chat.completions.create({
          model: GROK_MODEL,
          messages: [
            {
              role: 'system',
              content: `You are Skippy, a personal AI assistant. Write a SHORT morning briefing push notification (max 120 characters) for ${name}. Be direct, warm, and motivating. Don't use emojis excessively. Just a compact, human sentence or two.`,
            },
            {
              role: 'user',
              content: `Today's tasks:\n${taskLines}\n\nWrite a short morning briefing. Max 120 chars. No hashtags. No filler.`,
            },
          ],
          max_tokens: 60,
          temperature: 0.7,
        })
        body = res.choices[0]?.message?.content?.trim() || `${todoCount} task${todoCount !== 1 ? 's' : ''} waiting today.`
      } catch {
        body = todoCount > 0
          ? `${todoCount} task${todoCount !== 1 ? 's' : ''} due today. Let's get it done.`
          : `${reminderCount} reminder${reminderCount !== 1 ? 's' : ''} up today.`
      }
    }

    await sendPushToAll({
      title: '☀️ Morning Brief',
      body,
      url: '/todos',
      tag: 'daily-brief',
    })

    return NextResponse.json({ ok: true, sent: subCount })
  } catch (err) {
    console.error('[cron/daily-brief]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
