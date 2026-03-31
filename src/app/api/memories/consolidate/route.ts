import { NextResponse } from 'next/server'
import { consolidateMemories, compressMemoryCluster } from '@/lib/memory'
import { prisma } from '@/lib/db'

export const runtime    = 'nodejs'
export const maxDuration = 120

export async function POST() {
  try {
    // 1. Standard merge + decay pass
    const { merged, decayed } = await consolidateMemories()

    // 2. Compress categories with many entries
    const categorySizes = await prisma.memory.groupBy({
      by: ['category'],
      where: { isArchived: false },
      _count: { id: true },
    })

    let totalCompressed = 0
    let totalCreated    = 0
    const compressionLog: Array<{ category: string; compressed: number; created: number }> = []

    for (const { category, _count } of categorySizes) {
      if (_count.id >= 12) {
        const result = await compressMemoryCluster(category)
        if (result.compressed > 0 || result.created > 0) {
          compressionLog.push({ category, ...result })
          totalCompressed += result.compressed
          totalCreated    += result.created
        }
      }
    }

    return NextResponse.json({
      ok: true,
      merged,
      decayed,
      compressed: totalCompressed,
      synthesized: totalCreated,
      compressionLog,
      runAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[POST /api/memories/consolidate]', err)
    return NextResponse.json({ error: 'Consolidation failed' }, { status: 500 })
  }
}
