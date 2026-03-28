import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const pending = searchParams.get('pending')

    const reminders = await prisma.reminder.findMany({
      where: pending === 'true' ? { isDone: false } : {},
      orderBy: [{ isDone: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json(reminders)
  } catch (err) {
    console.error('Failed to fetch reminders:', err)
    return NextResponse.json({ error: 'Failed to fetch reminders' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { content, dueDate, timeframeLabel } = await req.json() as {
      content?: string
      dueDate?: string
      timeframeLabel?: string
    }

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    let parsedDate: Date | null = null
    if (dueDate) {
      const d = new Date(dueDate)
      if (!isNaN(d.getTime())) parsedDate = d
    }

    const reminder = await prisma.reminder.create({
      data: {
        content: content.trim().slice(0, 300),
        dueDate: parsedDate ?? undefined,
        timeframeLabel: timeframeLabel?.slice(0, 100) || null,
        sourceType: 'manual',
      },
    })

    return NextResponse.json(reminder, { status: 201 })
  } catch (err) {
    console.error('Failed to create reminder:', err)
    return NextResponse.json({ error: 'Failed to create reminder' }, { status: 500 })
  }
}
