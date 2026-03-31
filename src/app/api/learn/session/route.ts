import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * POST /api/learn/session
 * Saves a completed practice session.
 * Body: { language, mode, wordsReviewed, correctCount, xpEarned, duration }
 */
export async function POST(req: Request) {
  const {
    language = 'zh',
    mode = 'mixed',
    wordsReviewed = 0,
    correctCount = 0,
    xpEarned = 0,
    duration = 0,
  } = await req.json()

  try {
    const session = await prisma.langSession.create({
      data: { language, mode, wordsReviewed, correctCount, xpEarned, duration },
    })
    return NextResponse.json(session, { status: 201 })
  } catch (err) {
    console.error('Learn session POST error:', err)
    return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
  }
}

/** GET /api/learn/session?language=zh&days=7 — recent sessions */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const language = searchParams.get('language') ?? 'zh'
  const days = parseInt(searchParams.get('days') ?? '7', 10)

  const since = new Date()
  since.setDate(since.getDate() - days)

  try {
    const sessions = await prisma.langSession.findMany({
      where: { language, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(sessions)
  } catch (err) {
    console.error('Learn session GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }
}
