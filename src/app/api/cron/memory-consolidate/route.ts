import { NextResponse } from 'next/server'
import { consolidateMemories, compressMemoryCluster } from '@/lib/memory'
import { prisma } from '@/lib/db'

export const runtime     = 'nodejs'
export const maxDuration = 300

// Weekly cron: Sunday 4 AM UTC
export async function GET() {
  try {
    const { merged, decayed } = await consolidateMemories()

    const categorySizes = await prisma.memory.groupBy({
      by: ['category'],
      where: { isArchived: false },
      _count: { id: true },
    })

    let totalCompressed = 0
    let totalCreated    = 0
    for (const { category, _count } of categorySizes) {
      if (_count.id >= 12) {
        const r = await compressMemoryCluster(category)
        totalCompressed += r.compressed
        totalCreated    += r.created
      }
    }

    console.log('[cron/memory-consolidate] Done:', { merged, decayed, totalCompressed, totalCreated })
    return NextResponse.json({ ok: true, merged, decayed, compressed: totalCompressed, synthesized: totalCreated })
  } catch (err) {
    console.error('[cron/memory-consolidate] Error:', err)
    return NextResponse.json({ error: 'Cron consolidation failed' }, { status: 500 })
  }
}
