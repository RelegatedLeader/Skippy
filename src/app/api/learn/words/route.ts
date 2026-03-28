import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { HSK_WORDS } from '@/lib/hsk-data'
import { pickExerciseType } from '@/lib/srs'

const MAX_NEW_PER_SESSION = 5
const MAX_REVIEW_PER_SESSION = 10

/**
 * GET /api/learn/words?language=zh&limit=15
 * Returns a mixed queue of new + due-for-review words.
 * Seeds the vocabulary table on first call if empty.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const language = searchParams.get('language') ?? 'zh'

  try {
    // ── Seed vocabulary if needed ──────────────────────────────────────────
    const wordCount = await prisma.langWord.count({ where: { language } })
    if (wordCount === 0) {
      // Only runs when wordCount === 0, so no duplicates possible
      await prisma.langWord.createMany({
        data: HSK_WORDS.map((w) => ({
          id: w.id,
          language,
          simplified: w.simplified,
          pinyin: w.pinyin,
          meaning: w.meaning,
          hsk: w.hsk,
          pos: w.pos,
          example: w.example,
          exPinyin: w.exPinyin,
          exMeaning: w.exMeaning,
        })),
      })
    }

    // ── Fetch review queue (due words) ─────────────────────────────────────
    const now = new Date()
    const dueProgress = await prisma.langWordProgress.findMany({
      where: { language, nextReview: { lte: now } },
      orderBy: { nextReview: 'asc' },
      take: MAX_REVIEW_PER_SESSION,
      include: { word: true },
    })

    // ── Fetch new words ────────────────────────────────────────────────────
    const seenWordIds = await prisma.langWordProgress.findMany({
      where: { language },
      select: { wordId: true },
    })
    const seenSet = new Set(seenWordIds.map((p) => p.wordId))

    const newWords = await prisma.langWord.findMany({
      where: {
        language,
        id: { notIn: seenSet.size > 0 ? Array.from(seenSet) : ['__none__'] },
      },
      orderBy: [{ hsk: 'asc' }, { id: 'asc' }],
      take: MAX_NEW_PER_SESSION,
    })

    // ── All words for distractor pools ─────────────────────────────────────
    const allWords = await prisma.langWord.findMany({
      where: { language },
      select: { id: true, meaning: true, simplified: true },
    })
    const meaningPool = allWords.map((w) => ({ id: w.id, meaning: w.meaning, simplified: w.simplified }))

    // ── Build session queue ────────────────────────────────────────────────
    type QueueItem = {
      id: string
      simplified: string
      pinyin: string
      meaning: string
      hsk: number
      pos: string
      example: string
      exPinyin: string
      exMeaning: string
      progress: {
        easeFactor: number
        interval: number
        repetitions: number
        totalCorrect: number
        totalAttempts: number
      } | null
      exerciseType: ReturnType<typeof pickExerciseType>
      distractors: string[]
      charDistractors: string[]
    }

    const queue: QueueItem[] = []

    // Add review words
    for (const p of dueProgress) {
      const shuffled = meaningPool
        .filter((w) => w.id !== p.wordId)
        .sort(() => Math.random() - 0.5)

      const distractors = shuffled.slice(0, 3).map((w) => w.meaning)
      const charDistractors = shuffled.slice(3, 6).map((w) => w.simplified)

      queue.push({
        id: p.word.id,
        simplified: p.word.simplified,
        pinyin: p.word.pinyin,
        meaning: p.word.meaning,
        hsk: p.word.hsk,
        pos: p.word.pos,
        example: p.word.example,
        exPinyin: p.word.exPinyin,
        exMeaning: p.word.exMeaning,
        progress: {
          easeFactor: p.easeFactor,
          interval: p.interval,
          repetitions: p.repetitions,
          totalCorrect: p.totalCorrect,
          totalAttempts: p.totalAttempts,
        },
        exerciseType: pickExerciseType(p.repetitions),
        distractors,
        charDistractors,
      })
    }

    // Add new words
    for (const w of newWords) {
      const shuffled = meaningPool
        .filter((m) => m.id !== w.id)
        .sort(() => Math.random() - 0.5)

      const distractors = shuffled.slice(0, 3).map((m) => m.meaning)
      const charDistractors = shuffled.slice(3, 6).map((m) => m.simplified)

      queue.push({
        id: w.id,
        simplified: w.simplified,
        pinyin: w.pinyin,
        meaning: w.meaning,
        hsk: w.hsk,
        pos: w.pos,
        example: w.example,
        exPinyin: w.exPinyin,
        exMeaning: w.exMeaning,
        progress: null,
        exerciseType: pickExerciseType(0),
        distractors,
        charDistractors,
      })
    }

    // Shuffle so new and review words are interleaved
    const shuffled = queue.sort(() => Math.random() - 0.5)

    return NextResponse.json({
      words: shuffled,
      dueCount: dueProgress.length,
      newCount: newWords.length,
    })
  } catch (err) {
    console.error('Learn words GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch words' }, { status: 500 })
  }
}
