import { NextResponse, NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json() as {
      isDone?: boolean
      content?: string
      priority?: string
      dueDate?: string | null
    }

    const todo = await prisma.todo.findUnique({ where: { id: params.id } })
    if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const data: Record<string, unknown> = {}
    if (typeof body.isDone === 'boolean') {
      data.isDone = body.isDone
      data.completedAt = body.isDone ? new Date() : null
    }
    if (body.content !== undefined) data.content = body.content.trim().slice(0, 500)
    if (body.priority && ['low', 'normal', 'high', 'urgent'].includes(body.priority)) {
      data.priority = body.priority
    }
    if ('dueDate' in body) {
      if (body.dueDate === null) {
        data.dueDate = null
      } else if (body.dueDate) {
        const d = new Date(body.dueDate)
        if (!isNaN(d.getTime())) data.dueDate = d
      }
    }

    const updated = await prisma.todo.update({ where: { id: params.id }, data })

    // Award XP if just completed (not already done)
    if (body.isDone === true && !todo.isDone) {
      fetch('/api/user-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xp: updated.xpReward || 1, type: 'todo' }),
      }).catch(() => {})
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Failed to update todo:', err)
    return NextResponse.json({ error: 'Failed to update todo' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.todo.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete todo:', err)
    return NextResponse.json({ error: 'Failed to delete todo' }, { status: 500 })
  }
}
