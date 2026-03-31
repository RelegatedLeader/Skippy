import { NextResponse, NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json() as {
      isDone?: boolean
      content?: string
      dueDate?: string | null
      timeframeLabel?: string | null
      isNotified?: boolean
    }

    const existing = await prisma.reminder.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const data: Record<string, unknown> = {}

    if (typeof body.isDone === 'boolean') {
      data.isDone = body.isDone
      data.completedAt = body.isDone ? new Date() : null
    }
    if (body.content !== undefined) {
      data.content = body.content.trim().slice(0, 300)
    }
    if ('dueDate' in body) {
      if (body.dueDate === null) {
        data.dueDate = null
        data.isNotified = false // reset so notification fires if rescheduled
      } else if (body.dueDate) {
        const d = new Date(body.dueDate)
        if (!isNaN(d.getTime())) {
          data.dueDate = d
          data.isNotified = false // new due date = notify again
        }
      }
    }
    if ('timeframeLabel' in body) {
      data.timeframeLabel = body.timeframeLabel ? body.timeframeLabel.slice(0, 100) : null
    }
    if (typeof body.isNotified === 'boolean') {
      data.isNotified = body.isNotified
    }

    const updated = await prisma.reminder.update({ where: { id: params.id }, data })

    // Award XP if just completed
    if (body.isDone === true && !existing.isDone) {
      const xp = existing.xpReward || 10
      fetch('/api/user-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xp, type: 'reminder' }),
      }).catch(() => {})
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Failed to update reminder:', err)
    return NextResponse.json({ error: 'Failed to update reminder' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.reminder.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete reminder:', err)
    return NextResponse.json({ error: 'Failed to delete reminder' }, { status: 500 })
  }
}
