import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export function getLevel(xp: number): { level: number; name: string; nextXP: number; currentXP: number } {
  const thresholds = [0, 100, 250, 500, 1000, 2000]
  const names = ['Starter', 'Apprentice', 'Focused', 'Consistent', 'Master', 'Legend']
  let idx = 0
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (xp >= thresholds[i]) { idx = i; break }
  }
  return {
    level: idx + 1,
    name: names[idx],
    nextXP: idx < 5 ? thresholds[idx + 1] : thresholds[5],
    currentXP: thresholds[idx],
  }
}

export async function GET() {
  try {
    const stats = await prisma.userStats.findUnique({ where: { id: 'singleton' } })
    const xp = stats?.totalXP ?? 0
    const levelInfo = getLevel(xp)
    return NextResponse.json({ ...(stats ?? { id: 'singleton', totalXP: 0, currentStreak: 0, longestStreak: 0, lastActivityDate: '', remindersCompleted: 0, todosCompleted: 0 }), ...levelInfo })
  } catch (err) {
    console.error('Failed to get user stats:', err)
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { xp = 10, type }: { xp?: number; type?: 'reminder' | 'todo' } = await req.json()
    const today = new Date().toISOString().slice(0, 10)
    const existing = await prisma.userStats.findUnique({ where: { id: 'singleton' } })

    let newStreak = 1
    let longestStreak = existing?.longestStreak ?? 0

    if (existing?.lastActivityDate === today) {
      newStreak = existing.currentStreak
    } else if (existing?.lastActivityDate) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      if (existing.lastActivityDate === yesterday.toISOString().slice(0, 10)) {
        newStreak = (existing.currentStreak ?? 0) + 1
      }
    }
    longestStreak = Math.max(longestStreak, newStreak)

    const updated = await prisma.userStats.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        totalXP: xp,
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: today,
        remindersCompleted: type === 'reminder' ? 1 : 0,
        todosCompleted: type === 'todo' ? 1 : 0,
      },
      update: {
        totalXP: { increment: xp },
        currentStreak: newStreak,
        longestStreak,
        lastActivityDate: today,
        remindersCompleted: type === 'reminder' ? { increment: 1 } : undefined,
        todosCompleted: type === 'todo' ? { increment: 1 } : undefined,
      },
    })

    const levelInfo = getLevel(updated.totalXP)
    return NextResponse.json({ ...updated, ...levelInfo, xpEarned: xp })
  } catch (err) {
    console.error('Failed to award XP:', err)
    return NextResponse.json({ error: 'Failed to award XP' }, { status: 500 })
  }
}
