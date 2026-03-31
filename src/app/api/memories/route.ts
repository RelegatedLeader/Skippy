import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

function parseMemory(m: {
  id: string; category: string; content: string; importance: number
  confidence: number; accessCount: number; lastAccessedAt: Date | null
  decayScore: number; emotionalValence: number | null
  sourceType: string | null; sourceId: string | null; sourceLabel: string | null
  createdAt: Date; updatedAt: Date; tags: string
  healthScore: number; contradicts: string; linkedIds: string
  needsReview: boolean; reflectionNote: string | null; isArchived: boolean
}) {
  return {
    ...m,
    tags:       JSON.parse(m.tags       || '[]') as string[],
    contradicts: JSON.parse(m.contradicts || '[]') as string[],
    linkedIds:   JSON.parse(m.linkedIds   || '[]') as string[],
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q               = searchParams.get('q')?.toLowerCase().trim()
    const category        = searchParams.get('category')?.toLowerCase().trim()
    const source          = searchParams.get('source')?.toLowerCase().trim()
    const includeArchived = searchParams.get('includeArchived') === 'true'

    const memories = await prisma.memory.findMany({
      where: { isArchived: includeArchived ? undefined : false },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
    })

    const filtered = memories.filter(m => {
      const tags = JSON.parse(m.tags || '[]') as string[]
      const matchQ = !q || (
        m.content.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        (m.sourceLabel?.toLowerCase().includes(q) ?? false) ||
        tags.some(t => t.toLowerCase().includes(q))
      )
      const matchCat = !category || m.category === category
      const matchSrc = !source || m.sourceType === source
      return matchQ && matchCat && matchSrc
    })

    const grouped = filtered.reduce((acc, memory) => {
      if (!acc[memory.category]) acc[memory.category] = []
      acc[memory.category].push(parseMemory(memory))
      return acc
    }, {} as Record<string, ReturnType<typeof parseMemory>[]>)

    // Stats per category
    const categoryStats = Object.entries(grouped).map(([cat, mems]) => ({
      category: cat,
      count: mems.length,
      avgImportance: mems.reduce((s, m) => s + m.importance, 0) / mems.length,
      avgConfidence: mems.reduce((s, m) => s + m.confidence, 0) / mems.length,
      mostRecent: mems[0]?.updatedAt,
    })).sort((a, b) => b.count - a.count)

    return NextResponse.json({
      memories: filtered.map(parseMemory),
      grouped,
      total: filtered.length,
      categoryStats,
    })
  } catch (err) {
    console.error('Failed to fetch memories:', err)
    return NextResponse.json({ error: 'Failed to fetch memories' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { category, content, importance = 5, confidence = 0.8, tags = [] } = await req.json() as {
      category?: string
      content?: string
      importance?: number
      confidence?: number
      tags?: string[]
    }

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const memory = await prisma.memory.create({
      data: {
        category: category || 'fact',
        content: content.trim().slice(0, 500),
        importance: Math.min(10, Math.max(1, importance)),
        confidence: Math.min(1, Math.max(0.1, confidence)),
        tags: JSON.stringify(Array.isArray(tags) ? tags : []),
        sourceType: 'manual',
      },
    })

    return NextResponse.json(parseMemory(memory), { status: 201 })
  } catch (err) {
    console.error('Failed to create memory:', err)
    return NextResponse.json({ error: 'Failed to create memory' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, importance, confidence, category, tags } = await req.json() as {
      id?: string
      importance?: number
      confidence?: number
      category?: string
      tags?: string[]
    }

    if (!id) {
      return NextResponse.json({ error: 'Memory ID required' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (importance !== undefined) data.importance = Math.min(10, Math.max(1, importance))
    if (confidence !== undefined) data.confidence = Math.min(1, Math.max(0.1, confidence))
    if (category !== undefined) data.category = category
    if (tags !== undefined) data.tags = JSON.stringify(Array.isArray(tags) ? tags : [])

    const memory = await prisma.memory.update({ where: { id }, data })
    return NextResponse.json(parseMemory(memory))
  } catch (err) {
    console.error('Failed to update memory:', err)
    return NextResponse.json({ error: 'Failed to update memory' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Memory ID required' }, { status: 400 })
    }

    await prisma.memory.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete memory:', err)
    return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500 })
  }
}
