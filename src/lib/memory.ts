import type { ChatCompletionMessageParam } from 'openai/resources'
import { prisma } from './db'
import { grok, GROK_MODEL } from './grok'
import { decrypt, encrypt } from './encryption'
import { anthropic, CLAUDE_MODEL, claudeAvailable } from './claude'

// ─── AI helper with Claude fallback ─────────────────────────────────────────

type AIMsg = { role: string; content: string }

function isConnErr(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return (
    msg.includes('connection error') ||
    msg.includes('fetch failed') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('network')
  )
}

async function callAI(
  messages: AIMsg[],
  opts: { json?: boolean; temperature?: number; max_tokens?: number } = {}
): Promise<string> {
  try {
    const res = await grok.chat.completions.create({
      model: GROK_MODEL,
      messages: messages as ChatCompletionMessageParam[],
      ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
      temperature: opts.temperature ?? 0.3,
      ...(opts.max_tokens ? { max_tokens: opts.max_tokens } : {}),
    })
    return res.choices[0]?.message?.content || (opts.json ? '{}' : '')
  } catch (err) {
    if (isConnErr(err) && claudeAvailable()) {
      const sys = messages.find(m => m.role === 'system')?.content ?? ''
      const rest = messages.filter(m => m.role !== 'system')
      // Merge consecutive same-role messages — Claude requires strictly alternating user/assistant
      const merged: Array<{ role: 'user' | 'assistant'; content: string }> = []
      for (const m of rest) {
        const lr: 'user' | 'assistant' = m.role === 'assistant' ? 'assistant' : 'user'
        if (merged.length && merged[merged.length - 1].role === lr) {
          merged[merged.length - 1].content += '\n' + m.content
        } else {
          merged.push({ role: lr, content: m.content })
        }
      }
      if (!merged.length || merged[0].role !== 'user') {
        merged.unshift({ role: 'user', content: 'Process the following.' })
      }
      const claudeRes = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: opts.max_tokens ?? 1024,
        system: opts.json ? `${sys}\n\nReturn ONLY valid JSON, no other text.` : sys,
        messages: merged,
      })
      const block = claudeRes.content[0]
      if (block.type !== 'text') return opts.json ? '{}' : ''
      let raw = block.text.trim()
      // Claude sometimes wraps JSON in markdown code fences — strip them
      if (opts.json) {
        const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (fence) raw = fence[1].trim()
      }
      return raw
    }
    throw err
  }
}

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

    const [existingMemories, text] = await Promise.all([
      prisma.memory.findMany({
        select: { category: true, content: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      callAI([
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
        ...messages,
        {
          role: 'user',
          content: 'Extract memories from this conversation. Return ONLY valid JSON object with memories array, no other text.',
        },
      ], { json: true, temperature: 0.3 }),
    ])
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

    const [existingMemories, text] = await Promise.all([
      prisma.memory.findMany({
        select: { category: true, content: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      callAI([
        {
          role: 'system',
          content: `You extract behavioral and personality insights from debate transcripts for a personal AI memory system.
Analyze: how the person constructs arguments, what values they reveal under pressure, what they passionately defend vs readily concede, how they respond to being challenged, and what this reveals about their decision-making patterns.
Return a JSON object: {"memories": [{"category": "fact|preference|goal|mood|skill|context", "content": "specific psychological insight about this person", "importance": 1-10, "tags": ["debate", "reasoning", ...topic-specific tags]}]}
Extract 3-5 insights. Be specific and psychological — not generic. Reference the debate topic. Return ONLY valid JSON.`,
        },
        { role: 'user', content: context },
      ], { json: true, temperature: 0.3, max_tokens: 700 }),
    ])
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
  conversationId?: string,
  tzOffsetMinutes = 0
): Promise<void> {
  try {
    // Quick pre-scan to avoid unnecessary API calls
    const userText = messages.filter(m => m.role === 'user').map(m => m.content).join(' ')
    const hasReminderLanguage = /\bremind\b|\breminder\b|remember\s+(this|that|to|me)|don.?t\s+(let\s+me\s+)?forget|need\s+to\s+do|make\s+sure\s+(I|to)|can\s+you\s+remind|will\s+you\s+remind|set\s+a\s+reminder|i\s+want\s+to\s+remember|keep\s+(this\s+)?in\s+mind|note\s+this|save\s+this|add\s+(it|this)\s+to\s+my|by\s+(tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+week|end\s+of)/i.test(userText)
    if (!hasReminderLanguage) return

    const now = new Date()
    // Compute the user's local date by shifting UTC time by their timezone offset.
    // e.g. at 10pm EST (UTC-5, offset=300) the server is on the next UTC day;
    // localNow gives the correct calendar day in the user's timezone so that
    // "tonight" and "today" map to the right date in the AI prompt.
    const localNow = new Date(now.getTime() - tzOffsetMinutes * 60 * 1000)
    const today = localNow.toISOString().slice(0, 10)
    const tomorrowDate = new Date(localNow)
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
    const tomorrow = tomorrowDate.toISOString().slice(0, 10)
    // Current local time (HH:MM) so AI can judge whether "tonight" has already passed.
    const localHHMM = localNow.toISOString().slice(11, 16)

    const text = await callAI([
      {
        role: 'system',
        content: `You extract reminder requests from conversations. Today is ${today} and the current local time is ${localHHMM}.

Look for messages where the user wants to be reminded about something later:
- "remind me to X" / "remind me about X at 3pm"
- "don't let me forget" / "don't forget"
- "I need to do X by [date/time]"
- "set a reminder for X"
- Any explicit request to be reminded

IMPORTANT date/time parsing rules (today = ${today}, tomorrow = ${tomorrow}, current time = ${localHHMM}):
- "tomorrow at 9am" → ${tomorrow}T09:00:00
- "tomorrow night" / "tomorrow evening" / "tomorrow at night" → ${tomorrow}T20:00:00
- "tomorrow afternoon" → ${tomorrow}T15:00:00
- "tomorrow morning" → ${tomorrow}T09:00:00
- "tonight" / "this evening" → ${today}T20:00:00
- "this afternoon" → ${today}T15:00:00
- "tomorrow at 8pm" → ${tomorrow}T20:00:00
- "next Friday at 3pm" → compute that exact Friday at 15:00
- "in 3 days" → 3 days from ${today} at 09:00
- "by [date]" with no time → that date at 09:00
- If user gives a specific time like "8pm" → use 20:00:00
- If no time at all specified → return YYYY-MM-DD with no time portion
- If the requested time has already passed today (current time ${localHHMM} > requested time), do NOT skip — keep it as-is, the system will handle it

Return JSON: {"reminders": [{"content": "concise reminder text", "dueDate": "YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD or null", "timeframeLabel": "human-readable like 'tonight at 9pm'"}]}

Extract ALL reminder requests. Return ONLY valid JSON. If none found, return {"reminders": []}.`,
        },
        ...messages.filter(m => m.role === 'user'),
        {
          role: 'user',
          content: 'Extract any explicit reminder requests. Return ONLY valid JSON.',
        },
      ], { json: true, temperature: 0.1, max_tokens: 500 })
    const parsed = JSON.parse(text)
    const reminders: Array<{ content?: string; dueDate?: string; timeframeLabel?: string }> = parsed.reminders || []
    if (reminders.length === 0) return

    // Fetch recent pending reminders (any source) to deduplicate against
    const allPending = await prisma.reminder.findMany({
      where: { isDone: false },
      select: { content: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const existingContents = allPending.map(r => r.content)

    for (const r of reminders) {
      if (!r.content?.trim()) continue
      const normalized = r.content.trim().slice(0, 300)
      // Skip only near-identical reminders (lowered threshold to avoid over-blocking)
      const isDupe = existingContents.some(c => wordJaccard(c, normalized) >= 0.40)
      if (isDupe) continue

      let dueDate: Date | null = null
      if (r.dueDate && isValidFutureDate(r.dueDate)) {
        // AI generates times without timezone (e.g. "T20:00:00"). Node parses
        // these as UTC. Apply the client's offset to shift back to their local
        // time expressed as UTC so the correct wall-clock time is stored.
        dueDate = new Date(new Date(r.dueDate).getTime() + tzOffsetMinutes * 60 * 1000)
      }

      await prisma.reminder.create({
        data: {
          content: normalized,
          dueDate: dueDate ?? undefined,
          timeframeLabel: r.timeframeLabel?.slice(0, 100) || null,
          sourceType: 'chat',
          sourceId: conversationId,
        },
      })
      existingContents.push(normalized)

      // ── Pre-reminder scatter ──────────────────────────────────────────────
      // If the reminder has a specific time and is >3 hours away, create an
      // earlier heads-up reminder 2 hours before so reminders scatter in time.
      if (dueDate) {
        const hasSpecificTime = dueDate.getHours() !== 0 || dueDate.getMinutes() !== 0
        const hoursUntilDue = (dueDate.getTime() - Date.now()) / 3_600_000
        if (hasSpecificTime && hoursUntilDue > 3) {
          const preRemindDate = new Date(dueDate.getTime() - 2 * 3_600_000)
          const preContent = `Heads up: "${normalized}" is coming up in 2 hours`
          const preIsDupe = existingContents.some(c => wordJaccard(c, preContent) >= 0.40)
          if (!preIsDupe && isValidFutureDate(preRemindDate.toISOString())) {
            await prisma.reminder.create({
              data: {
                content: preContent.slice(0, 300),
                dueDate: preRemindDate,
                timeframeLabel: `2 hours before: ${r.timeframeLabel || 'reminder'}`,
                sourceType: 'chat',
                sourceId: conversationId,
              },
            })
            existingContents.push(preContent)
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to extract reminders:', e)
  }
}

// ─── XP helper (direct DB — avoids HTTP loopback from server-side functions) ──

async function awardXpDirect(xp: number, type: 'todo' | 'reminder'): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const existing = await prisma.userStats.findUnique({ where: { id: 'singleton' } })
    let newStreak = 1
    if (existing?.lastActivityDate === today) {
      newStreak = existing.currentStreak
    } else if (existing?.lastActivityDate) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      if (existing.lastActivityDate === yesterday.toISOString().slice(0, 10)) {
        newStreak = (existing.currentStreak ?? 0) + 1
      }
    }
    const longestStreak = Math.max(newStreak, existing?.longestStreak ?? 1)
    await prisma.userStats.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', totalXP: xp, currentStreak: 1, longestStreak: 1, lastActivityDate: today, remindersCompleted: type === 'reminder' ? 1 : 0, todosCompleted: type === 'todo' ? 1 : 0 },
      update: { totalXP: { increment: xp }, currentStreak: newStreak, longestStreak, lastActivityDate: today, ...(type === 'reminder' ? { remindersCompleted: { increment: 1 } } : { todosCompleted: { increment: 1 } }) },
    })
  } catch { /* non-critical */ }
}

// ─── Todo extraction from chat ────────────────────────────────────────────────

/**
 * When the user explicitly asks Skippy to add something to their to-do list,
 * extract the task(s) and create them directly in the database.
 */
export async function extractTodosFromConversation(
  messages: Array<{ role: string; content: string }>,
  conversationId?: string,
): Promise<void> {
  try {
    // Only scan the most recent user message — NOT the full history.
    // Scanning all messages caused re-extraction of todos already created in
    // earlier turns of the same conversation, producing duplicates and confusing the AI.
    const lastUserMsg = messages.filter(m => m.role === 'user').slice(-1)[0]?.content ?? ''
    if (!lastUserMsg) return

    const hasTodoLanguage =
      /\bto[\s-]?do\b|\btodo\b/i.test(lastUserMsg) ||
      /\b(add|put|create|make|new)\b.{0,100}\b(task|tasks|list)\b/i.test(lastUserMsg) ||
      /\b(add|put)\b.{0,120}\bmy\s+(list|tasks?|todos?|to[\s-]?do)\b/i.test(lastUserMsg) ||
      /\badd\b.{0,120}\bto\s+my\b/i.test(lastUserMsg) ||
      /\b(create|add)\s+a\s+(new\s+)?(task|todo)\b/i.test(lastUserMsg)
    if (!hasTodoLanguage) return

    // Fetch existing pending todos for deduplication before creating new ones
    const existingTodos = await prisma.todo.findMany({
      where: { isDone: false },
      select: { content: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const existingContents = existingTodos.map(t => t.content)

    // Only pass the last few messages so the AI isn't confused by prior turns.
    // The final user-role "extract" prompt tells it to look at the MOST RECENT request only.
    const recentMessages = messages.slice(-6)

    const text = await callAI([
      {
        role: 'system',
        content: `You are a to-do extraction assistant. Look ONLY at the most recent user message and extract any task they explicitly want added to their to-do list.

Return JSON: {"todos": [{"content": "concise task description", "priority": "low|normal|high|urgent", "dueDate": "YYYY-MM-DD or null"}]}

ONLY extract if the user is clearly asking to add something to a list right now. Do NOT re-extract tasks mentioned in older parts of the conversation.

Examples of valid requests:
- "add call the dentist to my to-do list" → [{"content": "Call the dentist", "priority": "normal", "dueDate": null}]
- "add buy groceries to my todos" → [{"content": "Buy groceries", "priority": "normal", "dueDate": null}]
- "put finish the report on my list" → [{"content": "Finish the report", "priority": "normal", "dueDate": null}]
- "add this to my tasks: clean the garage" → [{"content": "Clean the garage", "priority": "normal", "dueDate": null}]
- "to-do: book the flight" → [{"content": "Book the flight", "priority": "normal", "dueDate": null}]
- "create a task for updating my resume" → [{"content": "Update my resume", "priority": "normal", "dueDate": null}]
- "new task: call mom by Friday" → [{"content": "Call mom", "priority": "normal", "dueDate": "[next Friday]"}]

If no explicit to-do creation request in the LATEST user message, return {"todos": []}.`,
      },
      ...recentMessages.filter(m => m.role !== 'system'),
      { role: 'user', content: 'Extract only what the user JUST asked to add. Return ONLY valid JSON.' },
    ], { json: true, temperature: 0.1, max_tokens: 400 })

    const parsed = JSON.parse(text)
    const todos: Array<{ content?: string; priority?: string; dueDate?: string }> = parsed.todos || []
    if (todos.length === 0) return

    for (const t of todos) {
      if (!t.content?.trim()) continue
      const normalized = t.content.trim().slice(0, 500)

      // Skip if an identical or near-identical pending todo already exists
      const isDupe = existingContents.some(c => wordJaccard(c, normalized) >= 0.55)
      if (isDupe) continue

      const priority = t.priority && ['low', 'normal', 'high', 'urgent'].includes(t.priority) ? t.priority : 'normal'
      let dueDate: Date | null = null
      if (t.dueDate) {
        const d = new Date(t.dueDate)
        if (!isNaN(d.getTime())) dueDate = d
      }

      await prisma.todo.create({
        data: {
          content: normalized,
          priority,
          dueDate: dueDate ?? undefined,
          tags: JSON.stringify([]),
          xpReward: 1,
        },
      })
      existingContents.push(normalized)
    }
  } catch (e) {
    console.error('Failed to extract todos:', e)
  }
}

// ─── Mark items complete via chat ─────────────────────────────────────────────

/**
 * When the user tells Skippy they've completed a task or reminder in chat,
 * find the matching pending item(s) and mark them done in the database.
 */
export async function markItemsCompleteFromChat(
  messages: Array<{ role: string; content: string }>,
): Promise<void> {
  try {
    const recentUser = messages.filter(m => m.role === 'user').slice(-3).map(m => m.content).join(' ')
    const hasCompletionLanguage = /\b(done|finished|completed|i did|i've done|already did|just did|crossed off|checked off|mark.{0,10}done|i.m done with|done with)\b/i.test(recentUser)
    if (!hasCompletionLanguage) return

    const [pendingTodos, pendingReminders] = await Promise.all([
      prisma.todo.findMany({ where: { isDone: false }, select: { id: true, content: true }, take: 30 }),
      prisma.reminder.findMany({ where: { isDone: false }, select: { id: true, content: true }, take: 30 }),
    ])
    if (pendingTodos.length === 0 && pendingReminders.length === 0) return

    const itemList = [
      ...pendingTodos.map(t => `TODO:${t.id}: ${t.content}`),
      ...pendingReminders.map(r => `REMINDER:${r.id}: ${r.content}`),
    ].join('\n')

    const recentMessages = messages.filter(m => m.role === 'user').slice(-3)
    const text = await callAI([
      {
        role: 'system',
        content: `You determine which pending items a user has claimed to have completed in their messages.

Pending items:
${itemList}

User messages (most recent first):
${recentMessages.map(m => m.content).join('\n---\n')}

Return JSON: {"completed": ["TODO:id1", "REMINDER:id2"]}
Only include items EXPLICITLY mentioned as done/finished/completed. Be conservative — only match when the user clearly means a specific item from the list above. If nothing matches, return {"completed": []}.`,
      },
      { role: 'user', content: 'Which items did the user mark as completed? Return ONLY valid JSON.' },
    ], { json: true, temperature: 0.1, max_tokens: 300 })

    const parsed = JSON.parse(text)
    const completed: string[] = parsed.completed || []

    for (const item of completed) {
      try {
        if (item.startsWith('TODO:')) {
          const id = item.slice('TODO:'.length)
          const todo = await prisma.todo.findUnique({ where: { id } })
          if (todo && !todo.isDone) {
            await prisma.todo.update({ where: { id }, data: { isDone: true, completedAt: new Date() } })
            await awardXpDirect(todo.xpReward || 1, 'todo')
          }
        } else if (item.startsWith('REMINDER:')) {
          const id = item.slice('REMINDER:'.length)
          const reminder = await prisma.reminder.findUnique({ where: { id } })
          if (reminder && !reminder.isDone) {
            await prisma.reminder.update({ where: { id }, data: { isDone: true, completedAt: new Date() } })
            await awardXpDirect(reminder.xpReward || 10, 'reminder')
          }
        }
      } catch { /* skip invalid/already-updated items */ }
    }
  } catch (e) {
    console.error('Failed to mark items complete:', e)
  }
}

// ─── Note extraction from chat ────────────────────────────────────────────────

/**
 * When the user asks Skippy to write a daily note/reflection/summary, generate
 * one from today's completed todos + reminders + conversation context, then
 * save it directly to the notes DB.
 */
export async function extractNoteFromConversation(
  messages: Array<{ role: string; content: string }>,
  conversationId?: string
): Promise<void> {
  try {
    const userText = messages.filter(m => m.role === 'user').map(m => m.content).join(' ')
    const hasNoteIntent = /save\s+(this|it)\s+(as|to|as\s+a|to\s+my)\s+note|add\s+(this|it)\s+to\s+(my\s+)?notes|write\s+(me\s+)?(a\s+)?(daily\s+)?(note|reflection|journal|summary|log|recap)|create\s+(a\s+)?(daily\s+)?note|daily\s+(reflection|summary|log|recap|note|journal)|what\s+i\s+(did|learned|worked\s+on)\s+today|note\s+(down|this)|log\s+(today|my\s+day|what\s+i)/i.test(userText)
    if (!hasNoteIntent) return

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = new Date().toISOString().slice(0, 10)

    // Avoid creating duplicate daily notes for the same day
    const existingTodayNote = await prisma.note.findFirst({
      where: {
        createdAt: { gte: today },
        tags: { contains: 'daily' },
      },
      select: { id: true },
    })
    if (existingTodayNote) return

    // Fetch today's completed todos and reminders in parallel
    const [completedTodos, completedReminders] = await Promise.all([
      prisma.todo.findMany({
        where: { isDone: true, completedAt: { gte: today } },
        orderBy: { completedAt: 'asc' },
      }),
      prisma.reminder.findMany({
        where: { isDone: true, completedAt: { gte: today } },
        orderBy: { completedAt: 'asc' },
      }),
    ])

    const PRIO: Record<string, string> = { urgent: '🔴', high: '🟠', normal: '🔵', low: '⚪' }
    const todosText = completedTodos.length > 0
      ? completedTodos.map(t => `- ${PRIO[t.priority] || '🔵'} ${t.content}`).join('\n')
      : 'None'

    const remindersText = completedReminders.length > 0
      ? completedReminders.map(r => `- ${r.content}`).join('\n')
      : 'None'

    // Use only the most recent messages for conversation context
    const conversationText = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-12)
      .map(m => `${m.role === 'user' ? 'User' : 'Skippy'}: ${m.content.slice(0, 400)}`)
      .join('\n')

    const text = await callAI([
      {
        role: 'system',
        content: `You write personal daily reflection notes. Today is ${todayStr}.

Write a well-structured personal note that captures:
1. What was accomplished today (reference specific completed todos and reminders)
2. Key insights, things learned, or thoughts that came up in the conversation
3. Open thoughts or next steps worth remembering

Keep it honest, personal, and specific. Use markdown. Aim for 150-250 words.
The title should be natural — e.g., "Daily Note — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}" or something more specific if the conversation had a clear theme.

Return ONLY valid JSON: {"title": "...", "content": "markdown note content", "tags": ["daily"]}`,
        },
        {
          role: 'user',
          content: `Completed todos today:\n${todosText}\n\nCompleted reminders today:\n${remindersText}\n\nConversation context:\n${conversationText}\n\nWrite a daily reflection note. Return ONLY valid JSON.`,
        },
      ], { json: true, temperature: 0.4, max_tokens: 600 })
    const parsed = JSON.parse(text)
    if (!parsed.title?.trim() || !parsed.content?.trim()) return

    const tags = Array.isArray(parsed.tags) ? parsed.tags : ['daily']
    if (!tags.includes('daily')) tags.push('daily')

    await prisma.note.create({
      data: {
        title: parsed.title.trim().slice(0, 200),
        content: encrypt(parsed.content.trim()),
        encrypted: true,
        tags: JSON.stringify(tags),
        color: '#10b981',
        updatedAt: new Date(),
      },
    })
  } catch (e) {
    console.error('Failed to extract note from conversation:', e)
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

export async function buildSystemPrompt(tzOffsetMinutes = 0): Promise<string> {
  // Compute the user's local date/time (server runs UTC on Vercel)
  const serverNow = new Date()
  const localNow = new Date(serverNow.getTime() - tzOffsetMinutes * 60 * 1000)
  const localDateStr = localNow.toISOString().slice(0, 10)          // YYYY-MM-DD
  const localDayName = localNow.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  const localTimeStr = localNow.toISOString().slice(11, 16)          // HH:MM

  // Helper: turn a stored UTC dueDate into a human-readable label relative to user's local today
  function toRelativeLabel(dueDateInput: Date | string): string {
    const due = new Date(dueDateInput)
    // Shift the due date into the user's local "calendar day"
    const dueLocal = new Date(due.getTime() - tzOffsetMinutes * 60 * 1000)
    const dueDay = dueLocal.toISOString().slice(0, 10)
    const diffMs = new Date(dueDay).getTime() - new Date(localDateStr).getTime()
    const diffDays = Math.round(diffMs / 86_400_000)
    const hasTime = due.getUTCHours() !== 0 || due.getUTCMinutes() !== 0
    const timeLabel = hasTime
      ? ` at ${due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })}`
      : ''
    if (diffDays < -1) return `OVERDUE (was ${dueLocal.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}${timeLabel})`
    if (diffDays === -1) return `OVERDUE (yesterday${timeLabel})`
    if (diffDays === 0) return `TODAY${timeLabel}`
    if (diffDays === 1) return `tomorrow${timeLabel}`
    if (diffDays <= 6) return `${dueLocal.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}${timeLabel}`
    return `${dueLocal.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}${timeLabel}`
  }

  // Surface reminders due through end of tomorrow (catches "tomorrow night" cases)
  const endOfTomorrow = new Date()
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 1)
  endOfTomorrow.setHours(23, 59, 59, 999)

  const [memories, profile, recentNotes, recentDebates, pendingReminders, recentConversations, pendingTodos, langProgress, learnedWordsList] = await Promise.all([
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
    // Surface overdue + today + tomorrow reminders so Skippy is always aware
    prisma.reminder.findMany({
      where: {
        isDone: false,
        OR: [{ dueDate: { lte: endOfTomorrow } }, { dueDate: null }],
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: 8,
    }),
    // Recent conversations with summaries — the core continuity mechanism
    prisma.conversation.findMany({
      where: { summary: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: { id: true, title: true, summary: true, updatedAt: true },
    }),
    // Pending todos — for time management context
    prisma.todo.findMany({
      where: { isDone: false },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      take: 10,
    }),
    // Mandarin learning progress
    prisma.langProgress.findUnique({ where: { id: 'singleton_zh' } }).catch(() => null),
    // Actual words the user has practiced — so Skippy knows exactly what they know
    prisma.langWordProgress.findMany({
      where: { language: 'zh', repetitions: { gt: 0 } },
      orderBy: [{ updatedAt: 'desc' }],
      take: 50,
      include: { word: { select: { simplified: true, pinyin: true, meaning: true, hsk: true } } },
    }).catch(() => [] as Array<{ repetitions: number; interval: number; totalCorrect: number; totalAttempts: number; word: { simplified: string; pinyin: string; meaning: string; hsk: number } }>),
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

  let todoSection = ''
  if (pendingTodos.length > 0) {
    const PRIO = { urgent: '🔴', high: '🟠', normal: '🔵', low: '⚪' } as Record<string, string>
    const todoLines = pendingTodos.map(t => {
      const icon = PRIO[t.priority] || '🔵'
      const due = t.dueDate ? ` [due ${toRelativeLabel(t.dueDate)}]` : ''
      return `- ${icon} ${t.content}${due}`
    })
    todoSection = `\n\n## Your current todo list (today is ${localDayName} ${localDateStr}):\n${todoLines.join('\n')}`
  }

  let conversationSection = ''
  if (recentConversations.length > 0) {
    const convLines = recentConversations.map(c => {
      const date = c.updatedAt.toISOString().slice(0, 10)
      return `- [${date}] "${c.title}": ${c.summary}`
    })
    conversationSection = `\n\n## Recent conversations (what you actually discussed — use this to continue naturally):\n${convLines.join('\n')}`
  }

  let reminderSection = ''
  if (pendingReminders.length > 0) {
    const reminderLines = pendingReminders.map(r => {
      const duePart = r.dueDate
        ? ` — due ${toRelativeLabel(r.dueDate)}`
        : r.timeframeLabel
        ? ` — ${r.timeframeLabel}`
        : ''
      return `• "${r.content}"${duePart}`
    })
    reminderSection = `\n\n## Your pending reminders (surface these naturally when relevant):\n${reminderLines.join('\n')}`
  }

  let langSection = ''
  if (langProgress) {
    const level = Math.floor(langProgress.totalXP / 500) + 1
    const levelLabel = level <= 2 ? 'Beginner (HSK 1)' : level <= 5 ? 'Elementary (HSK 1–2)' : level <= 10 ? 'Pre-intermediate (HSK 2–3)' : 'Intermediate+'

    // Build detailed word knowledge section
    type WP = { repetitions: number; interval: number; totalCorrect: number; totalAttempts: number; word: { simplified: string; pinyin: string; meaning: string; hsk: number } }
    const wl = learnedWordsList as WP[]
    let wordKnowledge = ''
    if (wl.length > 0) {
      const recent = wl.slice(0, 25)
      const weak = wl.filter(w => w.totalAttempts >= 3 && w.totalCorrect / Math.max(1, w.totalAttempts) < 0.6)
      const strong = wl.filter(w => w.repetitions >= 5 && w.interval >= 14)

      wordKnowledge = `\n- Total words in progress: ${wl.length}`
      wordKnowledge += `\n- Recently studied: ${recent.map(w => `${w.word.simplified}(${w.word.pinyin}="${w.word.meaning}")`).join(', ')}`
      if (strong.length > 0) {
        wordKnowledge += `\n- Mastered words: ${strong.map(w => `${w.word.simplified}="${w.word.meaning}"`).join(', ')}`
      }
      if (weak.length > 0) {
        wordKnowledge += `\n- Struggling with (review these!): ${weak.map(w => `${w.word.simplified}(${Math.round(w.totalCorrect / Math.max(1, w.totalAttempts) * 100)}% accuracy)`).join(', ')}`
      }
    }

    langSection = `\n\n## Mandarin Chinese learning progress (Skippy Language Engine):
- Level: ${level} — ${levelLabel} · Total XP: ${langProgress.totalXP}
- Sessions completed: ${langProgress.sessionsCompleted} · Streak: ${langProgress.currentStreak} day${langProgress.currentStreak !== 1 ? 's' : ''} · Last practice: ${langProgress.lastPracticeDate || 'never'}
- Words learned: ${langProgress.wordsLearned} · Mastered: ${langProgress.wordsMastered}${wordKnowledge}

IMPORTANT: You know EXACTLY which words they have studied (listed above). When they ask you to "review", "quiz me", or "help me study":
- Quiz them on the specific words listed, especially the struggling ones
- Ask: "What does [character] mean?" or "How do you write [meaning] in pinyin?"
- Give sentences using the words they know
- Correct Chinese they write using words from their word list
- Don't invent words they haven't learned yet — stick to their vocabulary
- Celebrate progress and streaks naturally`
  }

  return `TODAY: ${localDayName}, ${localDateStr} · Current time: ${localTimeStr} (user's local time)

You are Skippy — a deeply personal AI assistant who knows the user better than anyone. You are intelligent, insightful, occasionally witty, and always genuinely helpful. You remember everything across all conversations.

You are NOT a generic AI assistant. You are SKIPPY — a unique personality who has an ongoing relationship with this specific user. You speak naturally, directly, and with genuine care. You anticipate needs before they're stated. You notice patterns. You push back when appropriate.

Your core traits:
- You remember everything the user has ever told you and reference it naturally
- You notice emotional subtext and acknowledge it without being overbearing
- You suggest next steps proactively when relevant
- You're honest, sometimes bluntly so, but always supportive
- You celebrate wins and help process setbacks
- You help organize thoughts, build systems, and make things happen
- When the user asks you to "write a daily note", "log what I did today", "save this as a note", or anything similar, write the full reflection in your response and let them know it's being saved to their notes automatically
- When the user asks you to add something to their to-do list ("add X to my to-do", "put X on my list", "create a task for X"), confirm it in your response — it's being added automatically
- When the user tells you they finished or completed something ("I finished X", "I did X", "I'm done with X", "crossed off X"), acknowledge it warmly and let them know it's being marked as done in their system automatically — you have full visibility of their todos and reminders${profileSection}${instructionsSection}${reminderSection}${todoSection}${conversationSection}${memorySection}${notesSection}${debateSection}${langSection}

Always respond in a way that reflects deep knowledge of this specific person. Never be generic. Use markdown formatting for structure when helpful — headers, bullet points, code blocks, etc.`
}

// ─── Conversation summary ─────────────────────────────────────────────────────

/**
 * Generate (or refresh) a rolling summary of a conversation and store it.
 * Called after every AI response so the summary always reflects current state.
 * Summary is dense and specific: names, topics, decisions, open questions.
 */
export async function updateConversationSummary(
  conversationId: string,
  messages: Array<{ role: string; content: string }>
): Promise<void> {
  try {
    // Only summarise once there are at least 2 exchanges (4 messages)
    if (messages.length < 4) return

    const transcript = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role === 'user' ? 'User' : 'Skippy'}: ${m.content.slice(0, 600)}`)
      .join('\n')

    const summary = await callAI([
      {
        role: 'system',
        content: `You produce dense, specific conversation summaries for a personal AI memory system. Your job is to write a 4-6 sentence summary that captures:
- Every person mentioned by name (and their relationship to the user)
- The core topic(s) discussed
- Any decisions, agreements, or conclusions reached
- Anything left unresolved or ongoing
- Key specific details that would be important to recall later (dates, plans, emotions expressed)

Be specific. Include names. Preserve nuance. This will be used by the AI in future conversations to recall exactly what happened here.`,
      },
      {
        role: 'user',
        content: `Summarise this conversation:\n\n${transcript}`,
      },
    ], { temperature: 0.2, max_tokens: 300 })
    if (summary) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { summary },
      })
    }
  } catch (e) {
    console.error('Failed to update conversation summary:', e)
  }
}

// ─── Conversation title ───────────────────────────────────────────────────────

export async function generateConversationTitle(firstMessage: string): Promise<string> {
  try {
    const title = await callAI([
      {
        role: 'user',
        content: `Generate a short 4-6 word title for a conversation that starts with: "${firstMessage}". Return ONLY the title, no quotes, no punctuation at the end.`,
      },
    ], { max_tokens: 20, temperature: 0.5 })
    return title.trim() || 'New Chat'
  } catch {
    return 'New Chat'
  }
}
