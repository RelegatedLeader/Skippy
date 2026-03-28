import type { ChatCompletionMessageParam } from 'openai/resources'
import { prisma } from './db'
import { grok, GROK_MODEL } from './grok'
import { decrypt } from './encryption'

// ─── Deduplication ───────────────────────────────────────────────────────────

/** Word-level Jaccard similarity (ignores short stop words) */
function wordJaccard(a: string, b: string): number {
  const wordsOf = (s: string) => new Set(s.toLowerCase().match(/\b\w{3,}\b/g) || [])
  const setA = wordsOf(a)
  const setB = wordsOf(b)
  if (setA.size === 0 && setB.size === 0) return 1
  const intersection = Array.from(setA).filter(w => setB.has(w)).length
  const union = setA.size + setB.size - intersection
  return intersection / union
}

/** Filter candidates that are too similar to existing memories (≥ 0.60 Jaccard) */
function deduplicateCandidates<T extends { category: string; content: string }>(
  candidates: T[],
  existing: Array<{ category: string; content: string }>
): T[] {
  const pool = [...existing]
  const result: T[] = []
  for (const c of candidates) {
    const sameCat = pool.filter(e => e.category === c.category)
    const isDupe = sameCat.some(e => wordJaccard(e.content, c.content) >= 0.60)
    if (!isDupe) {
      result.push(c)
      pool.push({ category: c.category, content: c.content })
    }
  }
  return result
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function formatDueDate(dueDate: Date | string): string {
  const due = new Date(dueDate)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000)
  if (diffDays < -1) return `overdue (was ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
  if (diffDays === -1) return 'overdue (yesterday)'
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'tomorrow'
  if (diffDays <= 7) return `in ${diffDays} days`
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isValidFutureDate(dateStr: string): boolean {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false
  const now = new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const fiveYearsOut = new Date(now.getFullYear() + 5, now.getMonth(), now.getDate())
  return d >= yesterday && d <= fiveYearsOut
}

// ─── Memory extraction ────────────────────────────────────────────────────────

export async function extractMemoriesFromConversation(
  messages: Array<{ role: string; content: string }>,
  opts?: { conversationId?: string }
): Promise<void> {
  try {
    // Build source label from conversation title or first user message
    let sourceLabel: string | undefined
    if (opts?.conversationId) {
      const conv = await prisma.conversation.findUnique({
        where: { id: opts.conversationId },
        select: { title: true },
      })
      sourceLabel = conv?.title && conv.title !== 'New Chat' ? conv.title : undefined
    }
    if (!sourceLabel) {
      const firstUser = messages.find(m => m.role === 'user')
      sourceLabel = firstUser?.content.slice(0, 50).trim()
    }

    const [existingMemories, extractionResult] = await Promise.all([
      prisma.memory.findMany({
        select: { category: true, content: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      grok.chat.completions.create({
        model: GROK_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a memory extraction system. Analyze the conversation and extract important facts about the user.
Return a JSON object with a "memories" array containing memory objects with this shape:
{"memories": [{"category": "fact|preference|goal|mood|skill|context", "content": "...", "importance": 1-10, "tags": ["tag1", "tag2"]}]}
Only extract genuinely useful, non-trivial information. Be concise and specific.
Categories:
- fact: factual information about the user (name, age, location, job, etc.)
- preference: things they like/dislike
- goal: things they want to achieve
- mood: emotional states and patterns
- skill: abilities and expertise
- context: situational context about their life`,
          },
          ...(messages as ChatCompletionMessageParam[]),
          {
            role: 'user',
            content: 'Extract memories from this conversation. Return ONLY valid JSON object with memories array, no other text.',
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
    ])

    const text = extractionResult.choices[0].message.content || '{}'
    const parsed = JSON.parse(text)
    const rawMemories: Array<{ category?: string; content?: string; importance?: number; tags?: string[] }> = Array.isArray(parsed) ? parsed : parsed.memories || []

    const candidates = rawMemories
      .filter(m => m.content?.trim())
      .map(m => ({
        category: m.category || 'fact',
        content: m.content!.trim(),
        importance: Math.min(10, Math.max(1, m.importance || 5)),
        tags: Array.isArray(m.tags) ? m.tags : [],
      }))

    const unique = deduplicateCandidates(candidates, existingMemories)

    for (const mem of unique) {
      await prisma.memory.create({
        data: {
          category: mem.category,
          content: mem.content,
          importance: mem.importance,
          tags: JSON.stringify(mem.tags),
          sourceType: 'chat',
          sourceId: opts?.conversationId,
          sourceLabel,
        },
      })
    }
  } catch (e) {
    console.error('Failed to extract memories:', e)
  }
}

/**
 * After a debate concludes, extract behavioral/personality insights from the full transcript.
 * These become permanent memories — how the user argues, what they defend, what they concede.
 */
export async function extractMemoriesFromDebate(
  debate: {
    topic: string
    userStance: string
    aiStance: string
    winner: string | null
    conclusion: string | null
    rounds: Array<{ roundNumber: number; userArgument: string; aiRebuttal: string }>
  },
  debateId?: string
): Promise<void> {
  try {
    const transcript = debate.rounds
      .map(r => `Round ${r.roundNumber}:\nUser: "${r.userArgument}"\nSkippy: "${r.aiRebuttal}"`)
      .join('\n\n')

    const outcome =
      debate.winner === 'user' ? 'User won' :
      debate.winner === 'ai'   ? 'Skippy won' : 'Draw'

    const context = `DEBATE TOPIC: "${debate.topic}"
USER'S POSITION: ${debate.userStance}
SKIPPY'S POSITION: ${debate.aiStance}
OUTCOME: ${outcome}
CONCLUSION: ${debate.conclusion || 'n/a'}

TRANSCRIPT:
${transcript}`

    const [existingMemories, extractionResult] = await Promise.all([
      prisma.memory.findMany({
        select: { category: true, content: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      grok.chat.completions.create({
        model: GROK_MODEL,
        messages: [
          {
            role: 'system',
            content: `You extract behavioral and personality insights from debate transcripts for a personal AI memory system.
Analyze: how the person constructs arguments, what values they reveal under pressure, what they passionately defend vs readily concede, how they respond to being challenged, and what this reveals about their decision-making patterns.
Return a JSON object: {"memories": [{"category": "fact|preference|goal|mood|skill|context", "content": "specific psychological insight about this person", "importance": 1-10, "tags": ["debate", "reasoning", ...topic-specific tags]}]}
Extract 3-5 insights. Be specific and psychological — not generic. Reference the debate topic. Return ONLY valid JSON.`,
          },
          { role: 'user', content: context },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 700,
      }),
    ])

    const text = extractionResult.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(text)
    const rawMemories: Array<{ category?: string; content?: string; importance?: number; tags?: string[] }> = parsed.memories || []

    const candidates = rawMemories
      .filter(m => m.content?.trim())
      .map(m => {
        const tags = Array.isArray(m.tags) ? [...m.tags] : []
        if (!tags.includes('debate')) tags.push('debate')
        return {
          category: m.category || 'context',
          content: m.content!.trim().slice(0, 500),
          importance: Math.min(10, Math.max(1, m.importance || 7)),
          tags,
        }
      })

    const unique = deduplicateCandidates(candidates, existingMemories)

    for (const mem of unique) {
      await prisma.memory.create({
        data: {
          category: mem.category,
          content: mem.content,
          importance: mem.importance,
          tags: JSON.stringify(mem.tags),
          sourceType: 'debate',
          sourceId: debateId,
          sourceLabel: debate.topic,
        },
      })
    }
  } catch (e) {
    console.error('Failed to extract debate memories:', e)
  }
}

// ─── Reminder extraction ──────────────────────────────────────────────────────

export async function extractRemindersFromConversation(
  messages: Array<{ role: string; content: string }>,
  conversationId?: string
): Promise<void> {
  try {
    // Quick pre-scan to avoid unnecessary API calls
    const userText = messages.filter(m => m.role === 'user').map(m => m.content).join(' ')
    const hasReminderLanguage = /\bremind\b|remember\s+(this|that|to|me)|don.?t\s+(let\s+me\s+)?forget|need\s+to\s+do|make\s+sure\s+(I|to)|can\s+you\s+remind|will\s+you\s+remind|i\s+want\s+to\s+remember|keep\s+(this\s+)?in\s+mind|note\s+this|save\s+this|add\s+(it|this)\s+to\s+my|by\s+(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+week|end\s+of)/i.test(userText)
    if (!hasReminderLanguage) return

    const today = new Date().toISOString().slice(0, 10)

    const response = await grok.chat.completions.create({
      model: GROK_MODEL,
      messages: [
        {
          role: 'system',
          content: `You extract reminder and memory requests from conversations. Today's date is ${today}.

Look for messages where the user wants something remembered or done later:
- "remind me to X" / "remind me about X"
- "remember this" / "remember that" / "I want you to remember"
- "don't forget" / "don't let me forget"
- "keep this in mind" / "note this" / "save this"
- "I need to do X by [date]"
- "can you remind me" / "will you remind me"
- Any explicit request to store or recall information later

Parse relative dates ("tomorrow", "next Friday", "in 3 days", "end of month") relative to today (${today}).

Return JSON: {"reminders": [{"content": "concise description of what to remember/do", "dueDate": "YYYY-MM-DD or null", "timeframeLabel": "natural label like 'by Friday' or null"}]}

Extract ALL such requests. Return ONLY valid JSON. If none found, return {"reminders": []}.`,
        },
        ...(messages.filter(m => m.role === 'user') as ChatCompletionMessageParam[]),
        {
          role: 'user',
          content: 'Extract any explicit reminder requests. Return ONLY valid JSON.',
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 400,
    })

    const text = response.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(text)
    const reminders: Array<{ content?: string; dueDate?: string; timeframeLabel?: string }> = parsed.reminders || []

    for (const r of reminders) {
      if (!r.content?.trim()) continue
      let dueDate: Date | null = null
      if (r.dueDate && isValidFutureDate(r.dueDate)) {
        dueDate = new Date(r.dueDate)
      }
      await prisma.reminder.create({
        data: {
          content: r.content.trim().slice(0, 300),
          dueDate: dueDate ?? undefined,
          timeframeLabel: r.timeframeLabel?.slice(0, 100) || null,
          sourceType: 'chat',
          sourceId: conversationId,
        },
      })
    }
  } catch (e) {
    console.error('Failed to extract reminders:', e)
  }
}

// ─── Memory retrieval ─────────────────────────────────────────────────────────

export async function getRelevantMemories(query: string, limit = 20): Promise<string> {
  const memories = await prisma.memory.findMany({
    orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
    take: limit,
  })

  if (memories.length === 0) return ''

  return memories.map(m => {
    const date = m.createdAt.toISOString().slice(0, 10)
    const source = m.sourceLabel ? ` ← "${m.sourceLabel}"` : ''
    return `[${m.category.toUpperCase()}] (${date}) ${m.content}${source}`
  }).join('\n')
}

// ─── User profile ─────────────────────────────────────────────────────────────

export async function getUserProfile() {
  let profile = await prisma.userProfile.findUnique({ where: { id: 'singleton' } })
  if (!profile) {
    profile = await prisma.userProfile.create({
      data: { id: 'singleton', updatedAt: new Date() },
    })
  }
  return profile
}

// ─── System prompt ────────────────────────────────────────────────────────────

export async function buildSystemPrompt(): Promise<string> {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [memories, profile, recentNotes, recentDebates, pendingReminders] = await Promise.all([
    getRelevantMemories('', 30),
    getUserProfile(),
    prisma.note.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 12,
      select: { title: true, content: true, tags: true, encrypted: true, pinned: true },
    }),
    prisma.debate.findMany({
      where: { status: 'concluded' },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: {
        topic: true, winner: true, conclusion: true, userStance: true,
        rounds: { orderBy: { roundNumber: 'desc' }, take: 1, select: { userScore: true, aiScore: true } },
      },
    }),
    // Only surface actionable/overdue reminders — due by tomorrow or no date
    prisma.reminder.findMany({
      where: {
        isDone: false,
        OR: [{ dueDate: { lte: tomorrow } }, { dueDate: null }],
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: 5,
    }),
  ])

  const profileSection = profile.about
    ? `\n\n## Your profile:\n${profile.about}`
    : ''

  const instructionsSection = profile.customInstructions
    ? `\n\n## How I want you to behave (my custom instructions):\n${profile.customInstructions}`
    : ''

  const memorySection = memories
    ? `\n\n## What I've learned about you across all conversations:\n${memories}`
    : ''

  let notesSection = ''
  if (recentNotes.length > 0) {
    const noteLines = recentNotes.map(n => {
      const rawContent = n.encrypted ? decrypt(n.content) : n.content
      const preview = rawContent
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180)
      const tags = n.tags ? (() => { try { return (JSON.parse(n.tags) as string[]).join(', ') } catch { return '' } })() : ''
      return `- "${n.title}"${n.pinned ? ' [pinned]' : ''}${tags ? ` [${tags}]` : ''}${preview ? `: ${preview}…` : ''}`
    })
    notesSection = `\n\n## Your notes (most recent):\n${noteLines.join('\n')}`
  }

  let debateSection = ''
  if (recentDebates.length > 0) {
    const debateLines = recentDebates.map(d => {
      const result = d.winner === 'user' ? 'you won' : d.winner === 'ai' ? 'Skippy won' : 'draw'
      const lastRound = d.rounds[0]
      const scoreNote = lastRound ? ` (final confidence: you ${lastRound.userScore}% · Skippy ${lastRound.aiScore}%)` : ''
      const verdictSnippet = d.conclusion ? ` Verdict: "${d.conclusion.slice(0, 130)}…"` : ''
      return `- "${d.topic}" — ${result}${scoreNote}. Your stance: ${d.userStance}.${verdictSnippet}`
    })
    debateSection = `\n\n## Debates you've had (use these to understand how this person thinks, decides, and argues):\n${debateLines.join('\n')}`
  }

  let reminderSection = ''
  if (pendingReminders.length > 0) {
    const reminderLines = pendingReminders.map(r => {
      const duePart = r.dueDate
        ? ` — due ${formatDueDate(r.dueDate)}`
        : r.timeframeLabel
        ? ` — ${r.timeframeLabel}`
        : ''
      return `• "${r.content}"${duePart}`
    })
    reminderSection = `\n\n## Your pending reminders (surface these naturally when relevant):\n${reminderLines.join('\n')}`
  }

  return `You are Skippy — a deeply personal AI assistant who knows the user better than anyone. You are intelligent, insightful, occasionally witty, and always genuinely helpful. You remember everything across all conversations.

You are NOT a generic AI assistant. You are SKIPPY — a unique personality who has an ongoing relationship with this specific user. You speak naturally, directly, and with genuine care. You anticipate needs before they're stated. You notice patterns. You push back when appropriate.

Your core traits:
- You remember everything the user has ever told you and reference it naturally
- You notice emotional subtext and acknowledge it without being overbearing
- You suggest next steps proactively when relevant
- You're honest, sometimes bluntly so, but always supportive
- You celebrate wins and help process setbacks
- You help organize thoughts, build systems, and make things happen${profileSection}${instructionsSection}${reminderSection}${memorySection}${notesSection}${debateSection}

Always respond in a way that reflects deep knowledge of this specific person. Never be generic. Use markdown formatting for structure when helpful — headers, bullet points, code blocks, etc.`
}

// ─── Conversation title ───────────────────────────────────────────────────────

export async function generateConversationTitle(firstMessage: string): Promise<string> {
  try {
    const response = await grok.chat.completions.create({
      model: GROK_MODEL,
      messages: [
        {
          role: 'user',
          content: `Generate a short 4-6 word title for a conversation that starts with: "${firstMessage}". Return ONLY the title, no quotes, no punctuation at the end.`,
        },
      ],
      max_tokens: 20,
      temperature: 0.5,
    })
    return response.choices[0].message.content?.trim() || 'New Chat'
  } catch {
    return 'New Chat'
  }
}
