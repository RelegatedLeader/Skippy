import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { grok, GROK_MODEL } from '@/lib/grok'

export async function POST(req: Request) {
  try {
    const { question } = await req.json() as { question?: string }

    if (!question?.trim()) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    const [memories, reminders] = await Promise.all([
      prisma.memory.findMany({
        orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
        take: 50,
      }),
      prisma.reminder.findMany({
        where: { isDone: false },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      }),
    ])

    const memoryContext = memories
      .map(m => {
        const date = m.createdAt.toISOString().slice(0, 10)
        const source = m.sourceLabel ? ` [source: "${m.sourceLabel}"]` : ''
        const tags = JSON.parse(m.tags || '[]') as string[]
        const tagStr = tags.length > 0 ? ` (${tags.join(', ')})` : ''
        return `[${m.category.toUpperCase()}] (${date}) ${m.content}${tagStr}${source}`
      })
      .join('\n')

    const reminderContext = reminders
      .map(r => {
        const duePart = r.dueDate
          ? ` [due: ${new Date(r.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}]`
          : r.timeframeLabel
          ? ` [${r.timeframeLabel}]`
          : ''
        return `[REMINDER] ${r.content}${duePart}`
      })
      .join('\n')

    const fullContext = [
      memoryContext ? `MEMORIES:\n${memoryContext}` : '',
      reminderContext ? `\nREMINDERS:\n${reminderContext}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    if (!fullContext.trim()) {
      return NextResponse.json({
        answer: "You don't have any memories or reminders stored yet. Start chatting with Skippy and your key facts, preferences, and goals will be remembered automatically.",
        sources: [],
      })
    }

    const response = await grok.chat.completions.create({
      model: GROK_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are Skippy's memory oracle. Answer the user's question based ONLY on the memories and reminders provided below.

Be specific — explicitly reference which memories or reminders support your answer (quote short snippets or mention their source). If you have limited information on a topic, say so honestly rather than guessing.

Format your answer clearly using markdown. If the question is "what did I ask you to remember?" or similar, list ALL reminders and any memory entries that sound like things the user wanted to keep track of.`,
        },
        {
          role: 'user',
          content: `QUESTION: "${question}"\n\n${fullContext}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 800,
    })

    const answer =
      response.choices[0]?.message?.content?.trim() ||
      'I could not find relevant information in your memories.'

    // Find most relevant source memories by keyword overlap with the question
    const questionWords = new Set(question.toLowerCase().match(/\b\w{3,}\b/g) || [])
    const sources = memories
      .map(m => {
        const memWords = new Set(m.content.toLowerCase().match(/\b\w{3,}\b/g) || [])
          const overlap = Array.from(questionWords).filter(w => memWords.has(w)).length
        return { memory: m, overlap }
      })
      .filter(x => x.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 5)
      .map(x => ({ ...x.memory, tags: JSON.parse(x.memory.tags || '[]') }))

    return NextResponse.json({ answer, sources })
  } catch (err) {
    console.error('Failed to answer memory question:', err)
    return NextResponse.json({ error: 'Failed to answer question' }, { status: 500 })
  }
}
