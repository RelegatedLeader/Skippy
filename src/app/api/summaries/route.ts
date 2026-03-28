import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { grok, GROK_MODEL } from '@/lib/grok'
import { decrypt } from '@/lib/encryption'

function serializeSummary(s: Record<string, unknown>) {
  return { ...s, categories: JSON.parse((s.categories as string) || '[]') }
}

export async function GET() {
  try {
    const summaries = await prisma.summary.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(summaries.map((s) => serializeSummary(s as Record<string, unknown>)))
  } catch (err) {
    console.error('Failed to fetch summaries:', err)
    return NextResponse.json({ error: 'Failed to fetch summaries' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { period, categories = [], startDate, endDate } = body as {
      period: string
      categories?: string[]
      startDate?: string
      endDate?: string
    }

    // Determine date range
    const now = new Date()
    let start: Date
    let end: Date = now

    if (startDate && endDate) {
      start = new Date(startDate)
      end = new Date(endDate)
    } else {
      switch (period) {
        case 'daily':
          start = new Date(now); start.setHours(0, 0, 0, 0); break
        case 'weekly':
          start = new Date(now); start.setDate(start.getDate() - 7); break
        case 'monthly':
          start = new Date(now); start.setMonth(start.getMonth() - 1); break
        case 'yearly':
          start = new Date(now); start.setFullYear(start.getFullYear() - 1); break
        default:
          start = new Date(0) // all time
      }
    }

    // Fetch notes in range
    const notes = await prisma.note.findMany({
      where: { updatedAt: { gte: start, lte: end } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    })

    if (notes.length === 0) {
      return NextResponse.json({ error: 'No notes found in this period.' }, { status: 400 })
    }

    // Build note content for Grok (decrypt + strip HTML)
    const noteTexts = notes.map((n) => {
      const plainContent = decrypt(n.content)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 800)
      const tags = JSON.parse(n.tags || '[]') as string[]
      return `### ${n.title}${tags.length ? ` [${tags.join(', ')}]` : ''}\n${plainContent}`
    }).join('\n\n---\n\n')

    const periodLabel = period === 'daily' ? 'today'
      : period === 'weekly' ? 'this week'
      : period === 'monthly' ? 'this month'
      : period === 'yearly' ? 'this year'
      : 'all time'

    const prompt = `You are Skippy, a deeply personal AI assistant. The user has ${notes.length} notes from ${periodLabel}.

Analyze these notes and produce a concise, insightful summary with:
1. **Key Themes** — 3-5 bullet points of the dominant topics or patterns
2. **Notable Insights** — 2-3 interesting observations or connections across notes
3. **Action Items** — Up to 3 concrete next steps or open loops worth addressing
4. **Mood / Energy** — A one-sentence read on the user's overall state during this period

Keep the tone warm, direct, and personal. Reference specific note titles when relevant.

NOTES:
${noteTexts}`

    const response = await grok.chat.completions.create({
      model: GROK_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
    })

    const summaryContent = response.choices[0]?.message?.content || ''
    const startFormatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const title = period === 'daily'
      ? `Daily Summary — ${startFormatted}`
      : period === 'weekly'
      ? `Weekly Summary — ${startFormatted}`
      : period === 'monthly'
      ? `Monthly Summary — ${startFormatted}`
      : period === 'yearly'
      ? `Year in Review — ${new Date(start).getFullYear()}`
      : `Summary — ${startFormatted} to ${endFormatted}`

    const summary = await prisma.summary.create({
      data: {
        period,
        title,
        content: summaryContent,
        noteCount: notes.length,
        categories: JSON.stringify(categories),
        startDate: start,
        endDate: end,
      },
    })

    return NextResponse.json(serializeSummary(summary as Record<string, unknown>), { status: 201 })
  } catch (err) {
    console.error('Failed to generate summary:', err)
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 })
  }
}
