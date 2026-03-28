import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { updateSM2 } from '@/lib/srs'

/**
 * PATCH /api/learn/words/[id]
 * Updates SM-2 state for a single word after an exercise.
 * Body: { language, quality (0-5), correct (bool) }
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const wordId = params.id
  const { language = 'zh', quality, correct } = await req.json() as {
    language?: string
    quality: number
    correct: boolean
  }

  try {
    // Find or create the progress record
    const existing = await prisma.langWordProgress.findUnique({
      where: { wordId_language: { wordId, language } },
    })

    const card = existing ?? {
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
    }

    const result = updateSM2(card, quality)

    const updated = await prisma.langWordProgress.upsert({
      where: { wordId_language: { wordId, language } },
      create: {
        wordId,
        language,
        easeFactor: result.easeFactor,
        interval: result.interval,
        repetitions: result.repetitions,
        nextReview: result.nextReview,
        totalCorrect: correct ? 1 : 0,
        totalAttempts: 1,
      },
      update: {
        easeFactor: result.easeFactor,
        interval: result.interval,
        repetitions: result.repetitions,
        nextReview: result.nextReview,
        totalCorrect: correct ? { increment: 1 } : undefined,
        totalAttempts: { increment: 1 },
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Word progress PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update word progress' }, { status: 500 })
  }
}
