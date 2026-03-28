import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const memories = await prisma.memory.findMany({
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
    })

    // Group by category
    const grouped = memories.reduce(
      (acc, memory) => {
        const category = memory.category
        if (!acc[category]) {
          acc[category] = []
        }
        acc[category].push({
          ...memory,
          tags: JSON.parse(memory.tags || '[]'),
        })
        return acc
      },
      {} as Record<string, unknown[]>
    )

    return NextResponse.json({
      memories: memories.map((m) => ({
        ...m,
        tags: JSON.parse(m.tags || '[]'),
      })),
      grouped,
      total: memories.length,
    })
  } catch (err) {
    console.error('Failed to fetch memories:', err)
    return NextResponse.json({ error: 'Failed to fetch memories' }, { status: 500 })
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
