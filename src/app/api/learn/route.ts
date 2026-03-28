import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/** GET /api/learn?language=zh — fetch progress stats */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const language = searchParams.get('language') ?? 'zh'
  const id = `singleton_${language}`

  try {
    const [progress, totalWords, learnedWords, masteredWords, recentSessions] =
      await Promise.all([
        prisma.langProgress.findUnique({ where: { id } }),
        prisma.langWord.count({ where: { language } }),
        prisma.langWordProgress.count({
          where: { language, repetitions: { gt: 0 } },
        }),
        prisma.langWordProgress.count({
          where: { language, interval: { gte: 21 } },
        }),
        prisma.langSession.findMany({
          where: { language },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ])

    return NextResponse.json({
      progress: progress ?? {
        id,
        language,
        totalXP: 0,
        wordsLearned: 0,
        wordsMastered: 0,
        sessionsCompleted: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastPracticeDate: '',
      },
      totalWords,
      learnedWords,
      masteredWords,
      recentSessions,
    })
  } catch (err) {
    console.error('Learn GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 })
  }
}

/** PATCH /api/learn — update streak after completing a session */
export async function PATCH(req: Request) {
  const { language = 'zh', xpEarned = 0 } = await req.json()
  const id = `singleton_${language}`
  const today = new Date().toISOString().slice(0, 10)

  try {
    const existing = await prisma.langProgress.findUnique({ where: { id } })

    let newStreak = 1
    let longestStreak = existing?.longestStreak ?? 0

    if (existing?.lastPracticeDate === today) {
      newStreak = existing.currentStreak
    } else if (existing?.lastPracticeDate) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      if (existing.lastPracticeDate === yesterday.toISOString().slice(0, 10)) {
        newStreak = (existing.currentStreak ?? 0) + 1
      }
    }
    longestStreak = Math.max(longestStreak, newStreak)

    const [learnedWords, masteredWords] = await Promise.all([
      prisma.langWordProgress.count({
        where: { language, repetitions: { gt: 0 } },
      }),
      prisma.langWordProgress.count({
        where: { language, interval: { gte: 21 } },
      }),
    ])

    const updated = await prisma.langProgress.upsert({
      where: { id },
      create: {
        id,
        language,
        totalXP: xpEarned,
        wordsLearned: learnedWords,
        wordsMastered: masteredWords,
        sessionsCompleted: 1,
        currentStreak: 1,
        longestStreak: 1,
        lastPracticeDate: today,
      },
      update: {
        totalXP: { increment: xpEarned },
        wordsLearned: learnedWords,
        wordsMastered: masteredWords,
        sessionsCompleted: { increment: 1 },
        currentStreak: newStreak,
        longestStreak,
        lastPracticeDate: today,
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Learn PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 })
  }
}
