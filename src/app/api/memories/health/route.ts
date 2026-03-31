import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const [
      totalActive,
      totalArchived,
      needsReview,
      synthesized,
      healthBuckets,
      categoryHealth,
      reflections,
    ] = await Promise.all([
      prisma.memory.count({ where: { isArchived: false } }),
      prisma.memory.count({ where: { isArchived: true } }),
      prisma.memory.count({ where: { isArchived: false, needsReview: true } }),
      prisma.memory.count({ where: { isArchived: false, sourceType: 'reflection' } }),
      // Health distribution buckets
      Promise.all([
        prisma.memory.count({ where: { isArchived: false, healthScore: { gte: 0.6 } } }),
        prisma.memory.count({ where: { isArchived: false, healthScore: { gte: 0.3, lt: 0.6 } } }),
        prisma.memory.count({ where: { isArchived: false, healthScore: { lt: 0.3 } } }),
      ]),
      // Per-category health averages
      prisma.memory.groupBy({
        by: ['category'],
        where: { isArchived: false },
        _count: { id: true },
        _avg:   { healthScore: true, importance: true, confidence: true },
      }),
      // Last 5 reflection runs
      prisma.memoryReflection.findMany({
        orderBy: { runAt: 'desc' },
        take: 5,
      }),
    ])

    const [healthy, moderate, weak] = healthBuckets

    return NextResponse.json({
      totalMemories:    totalActive,
      archivedMemories: totalArchived,
      needsReview,
      synthesized,
      healthDistribution: { healthy, moderate, weak },
      categoryHealth: categoryHealth
        .map(c => ({
          category:    c.category,
          count:       c._count.id,
          avgHealth:   Number((c._avg.healthScore ?? 0).toFixed(3)),
          avgImportance: Number((c._avg.importance  ?? 0).toFixed(1)),
          avgConfidence: Number((c._avg.confidence  ?? 0).toFixed(2)),
        }))
        .sort((a, b) => b.count - a.count),
      lastReflection: reflections[0] ?? null,
      recentReflections: reflections.map(r => ({
        ...r,
        gaps: r.gaps ? (JSON.parse(r.gaps) as string[]) : [],
      })),
    })
  } catch (err) {
    console.error('[GET /api/memories/health]', err)
    return NextResponse.json({ error: 'Failed to fetch health data' }, { status: 500 })
  }
}
