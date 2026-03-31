import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') // "pending" | "done" | null (all)
    const priority = searchParams.get('priority')

    const where: Record<string, unknown> = {}
    if (status === 'pending') where.isDone = false
    else if (status === 'done') where.isDone = true
    if (priority) where.priority = priority

    const todos = await prisma.todo.findMany({
      where,
      orderBy: [
        { isDone: 'asc' },
        { priority: 'desc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json(todos)
  } catch (err) {
    console.error('Failed to fetch todos:', err)
    return NextResponse.json({ error: 'Failed to fetch todos' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { content, priority, dueDate, tags } = await req.json() as {
      content?: string
      priority?: string
      dueDate?: string
      tags?: string[]
    }

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const PRIORITY_XP: Record<string, number> = { low: 5, normal: 10, high: 15, urgent: 25 }
    const p = priority && ['low', 'normal', 'high', 'urgent'].includes(priority) ? priority : 'normal'

    let parsedDate: Date | null = null
    if (dueDate) {
      const d = new Date(dueDate)
      if (!isNaN(d.getTime())) parsedDate = d
    }

    const todo = await prisma.todo.create({
      data: {
        content: content.trim().slice(0, 500),
        priority: p,
        dueDate: parsedDate ?? undefined,
        tags: JSON.stringify(Array.isArray(tags) ? tags : []),
        xpReward: PRIORITY_XP[p] ?? 10,
      },
    })

    return NextResponse.json(todo, { status: 201 })
  } catch (err) {
    console.error('Failed to create todo:', err)
    return NextResponse.json({ error: 'Failed to create todo' }, { status: 500 })
  }
}
