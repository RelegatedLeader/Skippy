import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.toLowerCase().trim()

    const memories = await prisma.memory.findMany({
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
    })

    const filtered = q
      ? memories.filter(m => {
          const tags = JSON.parse(m.tags || '[]') as string[]
          return (
            m.content.toLowerCase().includes(q) ||
            m.category.toLowerCase().includes(q) ||
            (m.sourceLabel?.toLowerCase().includes(q) ?? false) ||
            tags.some(t => t.toLowerCase().includes(q))
          )
        })
      : memories

    const grouped = filtered.reduce((acc, memory) => {
      if (!acc[memory.category]) acc[memory.category] = []
      acc[memory.category].push({ ...memory, tags: JSON.parse(memory.tags || '[]') })
      return acc
    }, {} as Record<string, unknown[]>)

    return NextResponse.json({
      memories: filtered.map(m => ({ ...m, tags: JSON.parse(m.tags || '[]') })),
      grouped,
      total: filtered.length,
    })
  } catch (err) {
    console.error('Failed to fetch memories:', err)
    return NextResponse.json({ error: 'Failed to fetch memories' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { category, content, importance = 5, tags = [] } = await req.json() as {
      category?: string
      content?: string
      importance?: number
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
        tags: JSON.stringify(Array.isArray(tags) ? tags : []),
        sourceType: 'manual',
      },
    })

    return NextResponse.json({ ...memory, tags: JSON.parse(memory.tags || '[]') }, { status: 201 })
  } catch (err) {
    console.error('Failed to create memory:', err)
    return NextResponse.json({ error: 'Failed to create memory' }, { status: 500 })
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
