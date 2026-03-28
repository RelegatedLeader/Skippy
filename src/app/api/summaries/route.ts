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

    // Fetch notes, concluded debates, completed todos, AND language sessions in parallel
    const [notes, debates, todos, langSessions] = await Promise.all([
      prisma.note.findMany({
        where: { updatedAt: { gte: start, lte: end } },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.debate.findMany({
        where: { status: 'concluded', updatedAt: { gte: start, lte: end } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        include: {
          rounds: { orderBy: { roundNumber: 'asc' } },
        },
      }),
      prisma.todo.findMany({
        where: {
          isDone: true,
          completedAt: { gte: start, lte: end },
        },
        orderBy: { completedAt: 'asc' },
        take: 50,
      }),
      prisma.langSession.findMany({
        where: { createdAt: { gte: start, lte: end } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])

    if (notes.length === 0 && debates.length === 0 && todos.length === 0 && langSessions.length === 0) {
      return NextResponse.json(
        { error: 'No notes, todos, debates, or language sessions found in this period.' },
        { status: 400 }
      )
    }

    const periodLabel = period === 'daily' ? 'today'
      : period === 'weekly' ? 'this week'
      : period === 'monthly' ? 'this month'
      : period === 'yearly' ? 'this year'
      : 'all time'

    // Build note content block (decrypt + strip HTML)
    const noteTexts = notes.length > 0
      ? notes.map((n) => {
          const plainContent = decrypt(n.content)
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 800)
          const tags = JSON.parse(n.tags || '[]') as string[]
          return `### ${n.title}${tags.length ? ` [${tags.join(', ')}]` : ''}\n${plainContent}`
        }).join('\n\n---\n\n')
      : ''

    // Build debate content block
    const debateTexts = debates.length > 0
      ? debates.map((d) => {
          const outcome = d.winner === 'user' ? 'User won'
            : d.winner === 'ai' ? 'Skippy won' : 'Draw'
          const lastRound = d.rounds[d.rounds.length - 1]
          const scoreNote = lastRound
            ? `Final confidence: You ${lastRound.userScore}% · Skippy ${lastRound.aiScore}%`
            : ''
          return [
            `### Debate: "${d.topic}" — ${outcome} (${d.rounds.length} round${d.rounds.length !== 1 ? 's' : ''})`,
            `User argued: ${d.userStance}`,
            `Skippy argued: ${d.aiStance}`,
            scoreNote,
            d.conclusion ? `Verdict: ${d.conclusion}` : '',
          ].filter(Boolean).join('\n')
        }).join('\n\n---\n\n')
      : ''

    const hasDebates = debates.length > 0
    const hasNotes = notes.length > 0
    const hasTodos = todos.length > 0
    const hasLang = langSessions.length > 0

    // Build todo content block
    const PRIO_LABEL: Record<string, string> = { urgent: '🔴 Urgent', high: '🟠 High', normal: '🔵 Normal', low: '⚪ Low' }
    const todoTexts = hasTodos
      ? todos.map(t => {
          const prio = PRIO_LABEL[t.priority] || 'Normal'
          const doneAt = t.completedAt ? new Date(t.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
          return `- [${prio}] ${t.content}${doneAt ? ` (completed ${doneAt})` : ''}`
        }).join('\n')
      : ''

    // Build language learning block
    const langText = hasLang
      ? (() => {
          const totalWords = langSessions.reduce((s, r) => s + r.wordsReviewed, 0)
          const totalCorrect = langSessions.reduce((s, r) => s + r.correctCount, 0)
          const totalXP = langSessions.reduce((s, r) => s + r.xpEarned, 0)
          const accuracy = totalWords > 0 ? Math.round(totalCorrect / totalWords * 100) : 0
          return `Chinese (Mandarin): ${langSessions.length} session${langSessions.length !== 1 ? 's' : ''}, ${totalWords} words reviewed, ${accuracy}% accuracy, ${totalXP} XP earned`
        })()
      : ''

    const sourceList = [
      hasNotes && `${notes.length} note${notes.length !== 1 ? 's' : ''}`,
      hasTodos && `${todos.length} completed todo${todos.length !== 1 ? 's' : ''}`,
      hasDebates && `${debates.length} debate${debates.length !== 1 ? 's' : ''}`,
      hasLang && `${langSessions.length} language session${langSessions.length !== 1 ? 's' : ''}`,
    ].filter(Boolean).join(', ')

    const prompt = `You are Skippy, a deeply personal AI assistant. The user has ${sourceList} from ${periodLabel}.

Analyze this activity and produce a concise, insightful summary with:
1. **Key Themes** — 3-5 bullet points of the dominant topics, decisions, or patterns
2. **What Got Done** — Highlight the most meaningful completed tasks and accomplishments${hasTodos ? ' (reference specific todos where relevant)' : ''}
3. **Notable Insights** — 2-3 interesting observations or connections across the content
4. **Action Items** — Up to 3 concrete next steps or open loops worth addressing
5. **Mood / Energy** — A one-sentence read on the user's overall state during this period${hasDebates ? '\n6. **Debate Insights** — What these debates reveal about how this person thinks, decides, and argues under pressure' : ''}${hasLang ? '\n7. **Language Progress** — Comment on the Chinese study sessions: consistency, accuracy, and momentum' : ''}

Keep the tone warm, direct, and personal. Reference specific note titles, todo items, or debate topics when relevant.${hasTodos ? `\n\nCOMPLETED TODOS:\n${todoTexts}` : ''}${hasNotes ? `\n\nNOTES:\n${noteTexts}` : ''}${hasDebates ? `\n\nDEBATES:\n${debateTexts}` : ''}${hasLang ? `\n\nLANGUAGE LEARNING:\n${langText}` : ''}`

    const response = await grok.chat.completions.create({
      model: GROK_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 900,
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
        debateCount: debates.length,
        todoCount: todos.length,
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
