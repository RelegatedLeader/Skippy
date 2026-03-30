/**
 * POST /api/cron/nudge
 *
 * Fires a few times per day (see vercel.json crons).
 * Skippy picks something from the user's memories / goals / pending todos
 * and sends a personalised nudge notification.
 *
 * Requires Vercel Pro for sub-daily frequency.
 * Protected by CRON_SECRET.
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
    const subCount = await prisma.pushSubscription.count()
    if (subCount === 0) return NextResponse.json({ ok: true, skipped: 'no subscriptions' })

    // Gather context: a few memories + pending todos + user profile
    const [memories, pendingTodos, userProfile] = await Promise.all([
      prisma.memory.findMany({
        orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
        take: 15,
        select: { category: true, content: true },
      }),
      prisma.todo.findMany({
        where: { isDone: false },
        orderBy: [{ priority: 'desc' }],
        take: 5,
        select: { content: true, priority: true },
      }),
      prisma.userProfile.findUnique({ where: { id: 'singleton' } }),
    ])

    const name = userProfile?.name || 'there'

    const memoryContext = memories
      .map(m => `[${m.category}] ${m.content}`)
      .join('\n')

    const todoContext = pendingTodos
      .map(t => `- ${t.content} (${t.priority})`)
      .join('\n')

    // Use AI to generate a personalised nudge — 1-2 sentences max
    let nudgeBody = ''
    try {
      const res = await grok.chat.completions.create({
        model: GROK_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are Skippy, a personal AI for ${name}. Based on what you know about them, write ONE short, punchy push notification nudge (max 120 characters). It could be:
- A check-in on a goal they mentioned
- A gentle reminder about a pending task (if relevant)
- An interesting observation about a pattern you've noticed
- A simple motivating thought
- A question that makes them think

Be personal and specific — NOT generic. Don't say "Hey [name]", just get to the point. No hashtags. No filler.`,
          },
          {
            role: 'user',
            content: `What I know about them:\n${memoryContext || '(nothing yet)'}\n\nPending tasks:\n${todoContext || '(none)'}\n\nSend a nudge. Max 120 chars.`,
          },
        ],
        max_tokens: 60,
        temperature: 0.85,
      })
      nudgeBody = res.choices[0]?.message?.content?.trim() || ''
    } catch {
      nudgeBody = pendingTodos.length > 0
        ? `Don't forget: "${pendingTodos[0].content}"`
        : "How's it going? Check in with Skippy."
    }

    if (!nudgeBody) return NextResponse.json({ ok: true, skipped: 'empty nudge' })

    await sendPushToAll({
      title: 'Skippy',
      body: nudgeBody,
      url: '/chat',
      tag: `nudge-${Date.now()}`,
    })

    // Also fire individual notifications for any reminders/todos due within 3 hours
    const soonStart = new Date()
    const soonEnd   = new Date(soonStart.getTime() + 3 * 60 * 60 * 1000)

    const [dueSoonReminders, dueSoonTodos] = await Promise.all([
      prisma.reminder.findMany({
        where: { isDone: false, isNotified: false, dueDate: { gte: soonStart, lte: soonEnd } },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.todo.findMany({
        where: { isDone: false, dueDate: { gte: soonStart, lte: soonEnd } },
        orderBy: { dueDate: 'asc' },
      }),
    ])

    for (const r of dueSoonReminders) {
      const due = r.dueDate ? new Date(r.dueDate) : null
      const timeStr = due ? due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) : ''
      await sendPushToAll({
        title: '⏰ Reminder due soon',
        body: timeStr ? `"${r.content}" — due at ${timeStr}` : r.content,
        url: '/chat',
        tag: `reminder-${r.id}`,
      })
      // Mark as notified so it doesn't fire again
      await prisma.reminder.update({ where: { id: r.id }, data: { isNotified: true } }).catch(() => {})
    }

    for (const t of dueSoonTodos) {
      const due = t.dueDate ? new Date(t.dueDate) : null
      const timeStr = due ? due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) : ''
      await sendPushToAll({
        title: '✅ Todo due soon',
        body: timeStr ? `"${t.content}" — due at ${timeStr}` : t.content,
        url: '/todos',
        tag: `todo-${t.id}`,
      })
    }

    return NextResponse.json({
      ok: true,
      sent: subCount,
      body: nudgeBody,
      remindersNotified: dueSoonReminders.length,
      todosNotified: dueSoonTodos.length,
    })
  } catch (err) {
    console.error('[cron/nudge]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
