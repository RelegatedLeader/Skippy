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

// ─── Memory health + topic intelligence ───────────────────────────────────────

/**
 * Composite health score (0–1) for a single memory.
 * Weights: importance 35%, decay 30%, confidence 25%, access frequency 10%.
 */
export function computeHealthScore(m: {
  importance: number; decayScore: number; confidence: number; accessCount: number
}): number {
  const accessBoost = Math.min(2.0, 1 + Math.log10(m.accessCount + 1))
  return Math.min(1.0,
    (m.importance / 10) * 0.35 +
    m.decayScore         * 0.30 +
    m.confidence         * 0.25 +
    (accessBoost / 2)    * 0.10
  )
}

/**
 * Returns per-category importance boost multipliers based on the current
 * conversation topic. Used by getRelevantMemories to surface relevant categories.
 */
function detectTopicCategoryBoost(query: string): Record<string, number> {
  if (!query.trim()) return {}
  const q = query.toLowerCase()
  const boost: Record<string, number> = {}
  if (/gym|workout|exercise|fitness|health|sick|doctor|diet|sleep|weight|calories|training|running|steps/.test(q))
    { boost.health = 1.8; boost.routine = 0.6 }
  if (/money|finance|budget|spend|cost|pay|salary|income|debt|save|invest|bank|credit/.test(q))
    { boost.finance = 1.8 }
  if (/family|friend|partner|girlfriend|boyfriend|wife|husband|sister|brother|mom|dad|relationship|dating|parents/.test(q))
    { boost.relationship = 1.8 }
  if (/work|job|career|project|task|deadline|meeting|boss|client|startup|business|office|company/.test(q))
    { boost.project = 1.2; boost.context = 0.6; boost.goal = 0.5 }
  if (/believe|think|opinion|values|ethics|politics|religion|philosophy|principles/.test(q))
    { boost.belief = 1.8; boost.identity = 0.7 }
  if (/learn|study|skill|practice|improve|course|language|chinese|mandarin|code|programming/.test(q))
    { boost.skill = 1.5 }
  if (/feel|emotion|mood|sad|happy|stressed|anxious|excited|depressed|overwhelmed/.test(q))
    { boost.mood = 1.8; boost.pattern = 0.7 }
  if (/habit|routine|schedule|daily|morning|night|every|wake|sleep|meal|ritual/.test(q))
    { boost.routine = 1.5; boost.health = 0.4 }
  if (/myself|identity|personality|character|who i am|life philosophy/.test(q))
    { boost.identity = 1.8; boost.belief = 0.6; boost.pattern = 0.6 }
  if (/goal|aspire|dream|plan|future|want to|trying to|aiming|target/.test(q))
    { boost.goal = 1.5; boost.project = 0.5 }
  if (/event|birthday|anniversary|trip|travel|vacation|appointment/.test(q))
    { boost.event = 1.8 }
  return boost
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
        take: 300,
      }),
      callAI([
        {
          role: 'system',
          content: `You are a comprehensive memory extraction system for a personal AI. Analyze the conversation and extract EVERY useful, non-trivial detail about the user.
Be liberal — extract more rather than less. Aim for 8-20 memories per substantial conversation.
Return a JSON object: {"memories": [{"category": "...", "content": "...", "importance": 1-10, "confidence": 0.1-1.0, "emotionalValence": -1.0 to 1.0 or null, "tags": ["tag1"]}]}

CATEGORIES (pick the most specific fit):
- fact: verifiable info — name, age, location, job, education, family structure, nationality
- preference: likes/dislikes — food, music, hobbies, communication style, aesthetics
- goal: future aspirations, targets, plans, timelines
- mood: emotional states, energy patterns, mental health patterns, what lifts/drains them
- skill: abilities, expertise, languages, tools they use, things they're learning
- context: current circumstances — living situation, active projects, current status of ongoing things
- identity: core self-concept, personality traits, how they describe themselves, life philosophy
- relationship: specific named people (friend X, sister Y, boss Z) — who they are, dynamics
- health: physical/mental health details, fitness habits, medical info, diet, sleep
- finance: money situation, financial goals, spending habits, salary context, debt/savings
- routine: daily/weekly habits, rituals, schedules, recurring activities
- event: specific past/upcoming events with dates — trips, milestones, deadlines, anniversaries
- belief: worldviews, political/ethical opinions, values they argue for, what they believe in
- pattern: behavioral tendencies you observe — how they handle stress, procrastinate, make decisions, react to feedback
- project: named ongoing projects with details, status, goals, collaborators

IMPORTANCE scale (be honest):
1-3: minor / might change soon
4-6: useful, remember for context
7-8: defines them or is actively relevant
9-10: core fact about who they are

CONFIDENCE: how certain you are (1.0 = explicitly stated, 0.7 = strongly implied, 0.4 = inferred)
EMOTIONAL_VALENCE: only set if emotional content — positive (+0.5 to +1.0), negative (-0.5 to -1.0), neutral null

Extract specific, concrete details. "User likes hiking in the mountains near their city" beats "user likes outdoors".
Capture names, numbers, dates, relationships. These make memories powerful.`,
        },
        ...messages,
        {
          role: 'user',
          content: 'Extract all meaningful memories from this conversation. Return ONLY valid JSON.',
        },
      ], { json: true, temperature: 0.3, max_tokens: 2000 }),
    ])
    const parsed = JSON.parse(text)
    const rawMemories: Array<{ category?: string; content?: string; importance?: number; confidence?: number; emotionalValence?: number | null; tags?: string[] }> = Array.isArray(parsed) ? parsed : parsed.memories || []

    const candidates = rawMemories
      .filter(m => m.content?.trim())
      .map(m => ({
        category: m.category || 'fact',
        content: m.content!.trim(),
        importance: Math.min(10, Math.max(1, m.importance || 5)),
        confidence: Math.min(1, Math.max(0.1, m.confidence ?? 0.8)),
        emotionalValence: (m.emotionalValence != null && Math.abs(m.emotionalValence) <= 1) ? m.emotionalValence : null,
        tags: Array.isArray(m.tags) ? m.tags : [],
      }))

    const unique = deduplicateCandidates(candidates, existingMemories)

    for (const mem of unique) {
      await prisma.memory.create({
        data: {
          category: mem.category,
          content: mem.content,
          importance: mem.importance,
          confidence: mem.confidence,
          emotionalValence: mem.emotionalValence ?? undefined,
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
Return a JSON object: {"memories": [{"category": "fact|preference|goal|mood|skill|context|identity|belief|pattern", "content": "specific psychological insight about this person", "importance": 1-10, "confidence": 0.1-1.0, "tags": ["debate", "reasoning", ...topic-specific tags]}]}
Extract 4-7 insights. Be specific and psychological — not generic. Reference the debate topic. Return ONLY valid JSON.`,
        },
        { role: 'user', content: context },
      ], { json: true, temperature: 0.3, max_tokens: 700 }),
    ])
    const parsed = JSON.parse(text)
    const rawMemories: Array<{ category?: string; content?: string; importance?: number; confidence?: number; tags?: string[] }> = parsed.memories || []

    const candidates = rawMemories
      .filter(m => m.content?.trim())
      .map(m => {
        const tags = Array.isArray(m.tags) ? [...m.tags] : []
        if (!tags.includes('debate')) tags.push('debate')
        return {
          category: m.category || 'context',
          content: m.content!.trim().slice(0, 500),
          importance: Math.min(10, Math.max(1, m.importance || 7)),
          confidence: Math.min(1, Math.max(0.1, m.confidence ?? 0.85)),
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
          confidence: mem.confidence,
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
    const hasReminderLanguage =
      /\bremin(d(er)?s?)?\b/i.test(userText) ||
      /remember\s+(this|that|to|me)/i.test(userText) ||
      /don.?t\s+(let\s+me\s+)?forget/i.test(userText) ||
      /make\s+sure\s+(I|to)/i.test(userText) ||
      /set\s+a\s+(reminder|alert|alarm)/i.test(userText) ||
      /i\s+want\s+to\s+remember/i.test(userText) ||
      /keep\s+(this\s+)?in\s+mind/i.test(userText) ||
      /\b(alert|notify|ping|nudge)\s+me\b/i.test(userText) ||
      // Time-bearing add/schedule requests should also become reminders:
      /\b(add|put|schedule|book|plan)\b.{0,80}\b(tomorrow|tonight|this (morning|afternoon|evening|night)|next (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)|by (the\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at \d|in \d+ (minute|hour|day)s?|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(userText) ||
      /\badd.{0,80}to\s+(my\s+)?reminders?\b/i.test(userText) ||
      /by\s+(tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+week|end\s+of)/i.test(userText)
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

// ─── Task intelligence helpers ────────────────────────────────────────────────

/**
 * Returns true if the task description implies same-day execution when no explicit
 * date is given. "VR session", "gym", "lunch" → due today when added without a date.
 */
function isSameDayActivityTask(content: string): boolean {
  const c = content.toLowerCase()
  return (
    /\b(vr|vr session|virtual reality|gym|workout|exercise|run(ning)?|jog(ging)?|walk(ing)?|swim(ming)?|yoga|pilates|lift(ing)?|weights|boxing|cycling|stretching|meditation|training session|crossfit|hiit)\b/.test(c) ||
    /\b(coffee|lunch|dinner|breakfast|brunch|drinks|happy hour|date night?|meetup|hang(ing)?\s*out|catch up)\b/.test(c) ||
    /\b(call|phone\s*call|video\s*call|appointment|errand|groceries|shopping)\b/.test(c) ||
    /\b(today|tonight|this\s*(morning|afternoon|evening|night)|right now|in a bit|shortly|soon)\b/.test(c)
  )
}

/**
 * Scans content + original user message for explicit priority signals,
 * returning a hard priority override when found.
 */
function inferTaskPriorityFromSignals(content: string, userMsg: string): 'low' | 'normal' | 'high' | 'urgent' {
  const combined = `${content} ${userMsg}`.toLowerCase()
  if (/\b(urgent|asap|immediately|emergency|deadline|overdue|critical|must (do|finish|complete|handle)|right now|cannot wait|time-?sensitive)\b/.test(combined)) return 'urgent'
  if (/\b(important|high[- ]priority|need to|have to|by tonight|by tomorrow|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|by next week|don.t forget|can't forget|cannot forget)\b/.test(combined)) return 'high'
  if (/\b(whenever|eventually|no rush|low[- ]priority|not urgent|can wait|when (i have|you have) time|someday|maybe|if i get to it|at some point)\b/.test(combined)) return 'low'
  return 'normal'
}

/** Loads learned behavior patterns so the extraction AI understands this specific user. */
async function loadUserTodoBehaviorContext(): Promise<string> {
  try {
    const patterns = await prisma.memory.findMany({
      where: { category: 'pattern', tags: { contains: '"todo-behavior"' }, isArchived: false },
      orderBy: { importance: 'desc' },
      take: 8,
      select: { content: true },
    })
    if (patterns.length === 0) return ''
    return `\nLearned patterns for this user:\n${patterns.map(p => `- ${p.content}`).join('\n')}`
  } catch { return '' }
}

// ─── Todo extraction from chat ────────────────────────────────────────────────

/**
 * When the user explicitly asks Skippy to add something to their to-do list,
 * extract the task(s) and create them directly in the database.
 */
export async function extractTodosFromConversation(
  messages: Array<{ role: string; content: string }>,
  conversationId?: string,
  tzOffsetMinutes = 0,
): Promise<void> {
  try {
    // Only scan the most recent user message to avoid re-extracting prior turns.
    const lastUserMsg = messages.filter(m => m.role === 'user').slice(-1)[0]?.content ?? ''
    if (!lastUserMsg) return

    // Broad pre-scan — catch explicit adds, scheduling language, and implicit "I need to" patterns.
    const hasTodoLanguage =
      /\bto[\s-]?do\b|\btodo\b/i.test(lastUserMsg) ||
      /\b(add|put|create|make|save|drop|throw|stick)\b.{0,100}\b(task|tasks|list|queue|agenda)\b/i.test(lastUserMsg) ||
      /\b(add|put)\b.{0,120}\bmy\s+(list|tasks?|todos?|to[\s-]?do|queue|agenda)\b/i.test(lastUserMsg) ||
      /\badd\b.{0,120}\bto\s+(my|the)\b/i.test(lastUserMsg) ||
      /\b(create|add)\s+a\s+(new\s+)?(task|todo|item)\b/i.test(lastUserMsg) ||
      /\b(schedule|book|plan)\b.{0,60}\b(for|on|at|tomorrow|today|tonight|next|this)\b/i.test(lastUserMsg) ||
      /\b(remind me to|don.?t (let me )?forget to|i (need|have|want|gotta|got)\s+to)\b/i.test(lastUserMsg) ||
      /\bkeep (in mind|note|track)\b.{0,60}\b(to|that)\b/i.test(lastUserMsg) ||
      /\btask:\s*.+/i.test(lastUserMsg)
    if (!hasTodoLanguage) return

    const now = new Date()
    const localNow = new Date(now.getTime() - tzOffsetMinutes * 60 * 1000)
    const today = localNow.toISOString().slice(0, 10)
    const tomorrowDate = new Date(localNow)
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
    const tomorrow = tomorrowDate.toISOString().slice(0, 10)
    const localDayName = localNow.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })

    // Fetch in parallel: existing pending todos (dedup) + user's learned behavior patterns.
    const [existingTodos, behaviorContext] = await Promise.all([
      prisma.todo.findMany({
        where: { isDone: false },
        select: { content: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      loadUserTodoBehaviorContext(),
    ])
    const existingContents = existingTodos.map(t => t.content)
    const recentMessages = messages.slice(-6)

    const text = await callAI([
      {
        role: 'system',
        content: `You are a smart task extraction assistant for a personal AI called Skippy.
Today is ${localDayName}, ${today}. Tomorrow is ${tomorrow}.${behaviorContext}

LIBERALLY extract ANY task or action item the user wants added to their list. If in doubt, extract it.

PRIORITY INFERENCE:
- "urgent", "asap", "emergency", "deadline", "right now", "must do today", "cannot wait" → urgent
- "important", "need to", "have to", "by tomorrow", "by [specific day]", "don't forget" → high
- "whenever", "eventually", "no rush", "low priority", "sometime" → low
- Everything else → normal

DUE DATE INFERENCE (be smart and contextual):
- "today", "tonight", "this morning/afternoon/evening" → ${today}
- "tomorrow", "tomorrow morning/afternoon/evening/night" → ${tomorrow}
- "next [weekday]" → compute that exact date from ${today}
- "in X days/weeks" → compute from ${today}
- "by [date]" → that date at end of day
- ACTIVITY TYPES with NO explicit date (gym, workout, VR session, vr, yoga, run, jog, boxing, coffee, lunch, dinner, call, appointment, errand, groceries, shopping, date, meetup) → assume ${today} (these are typically same-day tasks when added without a date)
- No time or day signal → null

Return JSON: {"todos": [{"content": "action-oriented task (e.g. Go to gym, Call dentist, Buy groceries)", "priority": "low|normal|high|urgent", "dueDate": "YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss or null"}]}

Examples:
- "add vr session to my to do list" → [{"content":"VR session","priority":"normal","dueDate":"${today}"}]
- "add call the dentist to my todos" → [{"content":"Call the dentist","priority":"normal","dueDate":null}]
- "put gym on my list" → [{"content":"Go to gym","priority":"normal","dueDate":"${today}"}]
- "add buy groceries to my list" → [{"content":"Buy groceries","priority":"normal","dueDate":"${today}"}]
- "add finish the report by friday" → [{"content":"Finish the report","priority":"high","dueDate":"[next friday from ${today}]"}]
- "I need to call mom" → [{"content":"Call mom","priority":"high","dueDate":null}]
- "remind me to buy a birthday gift for Sarah by next Saturday" → [{"content":"Buy birthday gift for Sarah","priority":"high","dueDate":"[next saturday]"}]
- "task: update my resume" → [{"content":"Update resume","priority":"normal","dueDate":null}]
- "don't let me forget to pay rent" → [{"content":"Pay rent","priority":"high","dueDate":null}]

Return {"todos": []} ONLY if there is absolutely nothing task-like in the latest message.`,
      },
      ...recentMessages.filter(m => m.role !== 'system'),
      { role: 'user', content: 'Extract tasks from the most recent user message. Return ONLY valid JSON.' },
    ], { json: true, temperature: 0.1, max_tokens: 600 })

    const parsed = JSON.parse(text)
    const todos: Array<{ content?: string; priority?: string; dueDate?: string }> = parsed.todos || []
    if (todos.length === 0) return

    const XP_BY_PRIORITY: Record<string, number> = { low: 5, normal: 10, high: 15, urgent: 25 }

    for (const t of todos) {
      if (!t.content?.trim()) continue
      const normalized = t.content.trim().slice(0, 500)

      // Dynamic dedup threshold: short tasks need higher word overlap to be considered dupes.
      const dedupThreshold = normalized.length < 20 ? 0.7 : 0.55
      const isDupe = existingContents.some(c => wordJaccard(c, normalized) >= dedupThreshold)
      if (isDupe) continue

      // Priority: take AI suggestion, but override with hard keyword signals.
      let priority = t.priority && ['low', 'normal', 'high', 'urgent'].includes(t.priority) ? t.priority : 'normal'
      const heuristic = inferTaskPriorityFromSignals(normalized, lastUserMsg)
      if (heuristic === 'urgent' || heuristic === 'low') priority = heuristic
      else if (priority === 'normal') priority = heuristic

      // Due date: use AI result first, then same-day heuristic.
      let dueDate: Date | null = null
      if (t.dueDate) {
        const d = new Date(t.dueDate)
        if (!isNaN(d.getTime())) {
          const hasTime = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0
          // Date-only → apply tz offset so toRelativeLabel shows the correct local day.
          dueDate = hasTime ? d : new Date(d.getTime() + tzOffsetMinutes * 60 * 1000)
        }
      }
      // If AI gave no date but this is a same-day activity type → set to today.
      if (!dueDate && isSameDayActivityTask(normalized)) {
        dueDate = new Date(`${today}T00:00:00.000Z`)
      }

      await prisma.todo.create({
        data: {
          content: normalized,
          priority,
          dueDate: dueDate ?? undefined,
          tags: JSON.stringify([]),
          xpReward: XP_BY_PRIORITY[priority] ?? 10,
        },
      })
      existingContents.push(normalized)

      // If the todo has a specific time-of-day, auto-create a matching reminder.
      if (dueDate && (dueDate.getUTCHours() !== 0 || dueDate.getUTCMinutes() !== 0)) {
        const reminderContent = `Do: ${normalized}`
        const existingReminder = await prisma.reminder.findFirst({
          where: { content: reminderContent, isDone: false },
        })
        if (!existingReminder) {
          await prisma.reminder.create({
            data: {
              content: reminderContent.slice(0, 300),
              dueDate,
              timeframeLabel: 'Auto-reminder from task',
              sourceType: 'chat',
              sourceId: conversationId,
            },
          }).catch(() => {})
        }
      }

      // Learn: record non-default patterns so future extraction is smarter.
      if (priority !== 'normal' || (dueDate && isSameDayActivityTask(normalized))) {
        const patternContent = `"${lastUserMsg.slice(0, 80)}" → task "${normalized}" (${priority}${dueDate && isSameDayActivityTask(normalized) ? ', same-day' : ''})`
        const alreadyKnown = await prisma.memory.findFirst({
          where: { category: 'pattern', tags: { contains: '"todo-behavior"' }, content: { contains: normalized.slice(0, 25) } },
        })
        if (!alreadyKnown) {
          await prisma.memory.create({
            data: {
              category: 'pattern',
              content: patternContent,
              importance: 3,
              confidence: 0.7,
              tags: JSON.stringify(['todo-behavior']),
              sourceType: 'todo',
              sourceId: conversationId,
            },
          }).catch(() => {})
        }
      }
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
    const hasCompletionLanguage = /\b(done|finished|completed|i did|i've done|already did|just did|crossed off|checked off|mark.{0,10}done|i.m done with|done with|took care of|handled|knocked out|got it done|wrapped up|all done|got done|nailed it|finished up|done and done|took care|dealt with|sorted out|got through|knocked off)\b/i.test(recentUser)
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

export async function getRelevantMemories(query: string, limit = 50): Promise<string> {
  // Pull a wide pool so JS scoring can find the truly relevant — not just highest importance
  const pool = await prisma.memory.findMany({
    where: { isArchived: false },
    orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
    take: 300,
  })
  if (pool.length === 0) return ''

  // Score every memory against the current query
  const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length >= 3)
  const catBoosts  = detectTopicCategoryBoost(query)

  type ScoredMemory = typeof pool[number] & { _score: number }
  const scored: ScoredMemory[] = pool.map(m => {
    // Base: importance × decay × confidence × access frequency
    const accessBoost = Math.min(2.0, 1 + Math.log10(m.accessCount + 1))
    const base = (m.importance / 10) * m.decayScore * m.confidence * accessBoost

    // Keyword relevance: fraction of query words that hit the content (max 2.5× boost)
    let relevance = 0
    if (queryWords.length > 0) {
      const content = m.content.toLowerCase()
      const hits    = queryWords.filter(qw => content.includes(qw)).length
      relevance     = (hits / queryWords.length) * 2.5
    }

    // Category affinity from topic detection
    const catBoost = catBoosts[m.category] || 0

    // Recency signal: fades linearly over 180 days
    const ageDays  = (Date.now() - new Date(m.updatedAt).getTime()) / 86_400_000
    const recency  = Math.max(0, 1 - ageDays / 180) * 0.4

    // Soft penalty for memories flagged for review
    const reviewPenalty = m.needsReview ? 0.6 : 1.0

    return { ...m, _score: (base + relevance + catBoost + recency) * reviewPenalty }
  })

  scored.sort((a, b) => b._score - a._score)
  const top = scored.slice(0, limit)

  // Track access (fire-and-forget, non-critical)
  const now = new Date()
  prisma.memory.updateMany({
    where: { id: { in: top.map(m => m.id) } },
    data: { accessCount: { increment: 1 }, lastAccessedAt: now },
  }).catch(() => {})

  // Group by category, strongest category first
  const grouped: Record<string, ScoredMemory[]> = {}
  for (const m of top) {
    if (!grouped[m.category]) grouped[m.category] = []
    grouped[m.category].push(m)
  }
  const catOrder = Object.entries(grouped)
    .sort((a, b) => (b[1][0]?._score || 0) - (a[1][0]?._score || 0))

  const lines: string[] = []
  for (const [cat, mems] of catOrder) {
    lines.push(`[${cat.toUpperCase()}]`)
    for (const m of mems) {
      const date    = m.createdAt.toISOString().slice(0, 10)
      const source  = m.sourceLabel ? ` ← "${m.sourceLabel}"` : ''
      const conf    = m.confidence < 0.6 ? ' (uncertain)' : ''
      const review  = m.needsReview ? ' ⚠' : ''
      lines.push(`  • (${date}) ${m.content}${source}${conf}${review}`)
    }
  }
  return lines.join('\n')
}

// ─── Note search for context ──────────────────────────────────────────────────

/**
 * Search user's notes by keyword — used when Skippy needs to find a specific note.
 * Returns formatted note excerpts for inclusion in AI context.
 */
export async function searchUserNotes(query: string, limit = 5): Promise<string> {
  if (!query.trim()) return ''
  const q = query.toLowerCase()
  const notes = await prisma.note.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: { id: true, title: true, content: true, tags: true, encrypted: true, pinned: true, updatedAt: true },
  })
  const matches = notes
    .map(n => {
      const raw = n.encrypted ? decrypt(n.content) : n.content
      const plain = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      const score = (n.title.toLowerCase().includes(q) ? 3 : 0) +
                    (plain.toLowerCase().includes(q) ? 2 : 0) +
                    (n.pinned ? 1 : 0)
      return { ...n, plain, score }
    })
    .filter(n => n.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  if (matches.length === 0) return ''
  return matches.map(n => {
    const date = n.updatedAt.toISOString().slice(0, 10)
    const preview = n.plain.slice(0, 500)
    return `NOTE "${n.title}" [${date}]:\n${preview}…`
  }).join('\n\n')
}

// ─── Memory consolidation ─────────────────────────────────────────────────────

/**
 * Merge near-duplicate memories across all categories, reinforce high-access memories,
 * and apply time-based decay to stale low-importance memories.
 * Safe to run as a background job.
 */
export async function consolidateMemories(): Promise<{ merged: number; decayed: number }> {
  let merged = 0
  let decayed = 0
  try {
    const allMemories = await prisma.memory.findMany({
      orderBy: [{ importance: 'desc' }, { createdAt: 'asc' }],
    })

    // 1. Find and merge near-duplicates (same category, Jaccard ≥ 0.65)
    const processed = new Set<string>()
    for (const mem of allMemories) {
      if (processed.has(mem.id)) continue
      const sameCat = allMemories.filter(m => m.category === mem.category && m.id !== mem.id && !processed.has(m.id))
      for (const other of sameCat) {
        if (wordJaccard(mem.content, other.content) >= 0.65) {
          // Keep the higher-importance one; delete the other
          const keep = mem.importance >= other.importance ? mem : other
          const drop = keep.id === mem.id ? other : mem
          await prisma.memory.update({
            where: { id: keep.id },
            data: {
              importance: Math.min(10, Math.max(keep.importance, drop.importance)),
              confidence: Math.min(1, (keep.confidence + drop.confidence) / 2 + 0.05),
              accessCount: keep.accessCount + drop.accessCount,
            },
          })
          await prisma.memory.delete({ where: { id: drop.id } })
          processed.add(drop.id)
          merged++
        }
      }
      processed.add(mem.id)
    }

    // 2. Apply decay to memories not accessed in 30+ days with low importance
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const stale = allMemories.filter(m =>
      m.importance <= 4 &&
      (!m.lastAccessedAt || m.lastAccessedAt < thirtyDaysAgo) &&
      m.decayScore > 0.2
    )
    for (const m of stale) {
      const newDecay = Math.max(0.1, m.decayScore * 0.85)
      await prisma.memory.update({ where: { id: m.id }, data: { decayScore: newDecay } })
      decayed++
    }

    // 3. Recompute health scores for every active memory
    await updateAllHealthScores().catch(() => {})

  } catch (e) {
    console.error('Memory consolidation error:', e)
  }
  return { merged, decayed }
}

// ─── Memory health engine ─────────────────────────────────────────────────────

/** Recompute and persist healthScore for every non-archived memory in batches. */
async function updateAllHealthScores(): Promise<void> {
  const memories = await prisma.memory.findMany({
    where: { isArchived: false },
    select: { id: true, importance: true, decayScore: true, confidence: true, accessCount: true },
  })
  const BATCH = 50
  for (let i = 0; i < memories.length; i += BATCH) {
    const batch = memories.slice(i, i + BATCH)
    await Promise.all(batch.map(m =>
      prisma.memory.update({ where: { id: m.id }, data: { healthScore: computeHealthScore(m) } })
    ))
  }
}

/** Soft-archive memories whose health dropped below the threshold (spares manual entries). */
async function archiveUnhealthyMemories(): Promise<number> {
  const dying = await prisma.memory.findMany({
    where: { isArchived: false, healthScore: { lt: 0.05 }, sourceType: { not: 'manual' } },
    select: { id: true },
  })
  if (dying.length === 0) return 0
  await prisma.memory.updateMany({
    where: { id: { in: dying.map(m => m.id) } },
    data: { isArchived: true },
  })
  return dying.length
}

// ─── Self-reflection engine ───────────────────────────────────────────────────

/**
 * SKIPPY'S INTERNAL MEMORY AUDITOR.
 *
 * Autonomously reviews the entire memory bank, detects contradictions and stale
 * data, synthesises new high-order insights, rebalances importance/confidence
 * scores, identifies knowledge gaps, then archives dead memories.
 *
 * Designed to run on a schedule (daily) or on-demand from the Memory Vault page.
 */
export async function runMemorySelfReflection(triggeredBy = 'manual'): Promise<{
  memoriesReviewed: number
  contradictionsFound: number
  memoriesUpdated: number
  memoriesArchived: number
  newMemoriesCreated: number
  insights: string
  gaps: string[]
}> {
  const result = {
    memoriesReviewed:    0,
    contradictionsFound: 0,
    memoriesUpdated:     0,
    memoriesArchived:    0,
    newMemoriesCreated:  0,
    insights:            '',
    gaps:                [] as string[],
  }

  try {
    const [allMemories, recentSummaries] = await Promise.all([
      prisma.memory.findMany({
        where: { isArchived: false },
        orderBy: [{ importance: 'desc' }, { createdAt: 'asc' }],
      }),
      prisma.conversation.findMany({
        where: { summary: { not: null } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { summary: true, updatedAt: true },
      }),
    ])

    result.memoriesReviewed = allMemories.length
    if (allMemories.length === 0) return result

    // Send top 200 by importance — keeps the prompt manageable at scale
    const topMemories = allMemories.slice(0, 200)
    const memoryDump  = topMemories.map(m =>
      `[${m.id}] (${m.category}, imp:${m.importance}, conf:${Math.round(m.confidence * 100)}%, age:${Math.round((Date.now() - new Date(m.createdAt).getTime()) / 86_400_000)}d) ${m.content}`
    ).join('\n')

    const ctxSummaries = recentSummaries
      .map(s => `[${s.updatedAt.toISOString().slice(0, 10)}] ${s.summary}`)
      .join('\n')

    const auditRaw = await callAI([
      {
        role: 'system',
        content: `You are SKIPPY's internal Memory Auditor — an autonomous AI subsystem that reviews and improves the memory bank.

Your task: audit memories about the user, find problems, synthesise deeper insights, and return precise correction instructions.

AUDIT TASKS:
1. CONTRADICTIONS — Find pairs that directly contradict each other (e.g. "loves coffee" vs "doesn't drink caffeine"). Only flag clear, direct contradictions.
2. STALE — Identify memories likely outdated by newer information or age (e.g. "currently job hunting" from 90+ days ago). Only flag when confident.
3. SYNTHESIS — Write 3-8 NEW high-value memories that synthesise what the individual memories REALLY reveal about this person. Focus on:
   • Behavioral patterns only visible across multiple memories
   • Core drives and values that keep recurring
   • Tensions or blind spots apparent only at the aggregate level
   • The current life chapter: what phase is this person in right now?
   These MUST be original — not paraphrases of existing memories.
4. UPDATES — Suggest importance/confidence corrections for clearly mis-rated memories.
5. GAPS — Name 4-6 important things you DON'T know that a close personal AI should. Make them specific and actionable (things Skippy can ask naturally in conversation).
6. INSIGHTS — Write a concise 4-6 sentence internal briefing: who is this person at their core, what drives them, what is their current life state, what tensions should Skippy always hold in mind?

RULES:
• Only reference memory IDs that appear in the dump below.
• Synthesis memories must be genuinely novel — not repetitions.
• Be forensic. A single memory means little; patterns across 20 are gold.
• Be honest about uncertainty (lower confidence = inferred not stated).
• Return ONLY valid JSON.

JSON schema:
{
  "contradictions": [{"id1": "...", "id2": "...", "reason": "..."}],
  "stale": [{"id": "...", "reason": "..."}],
  "synthesis": [{"category": "...", "content": "...", "importance": 1-10, "confidence": 0.1-1.0, "tags": [...]}],
  "updates": [{"id": "...", "importance": 1-10, "confidence": 0.1-1.0}],
  "gaps": ["...", "..."],
  "insights": "..."
}`,
      },
      {
        role: 'user',
        content: `MEMORY BANK (${topMemories.length} of ${allMemories.length} total):\n${memoryDump}\n\nRECENT CONVERSATION SUMMARIES:\n${ctxSummaries || 'Not yet available.'}\n\nAudit. Return ONLY valid JSON.`,
      },
    ], { json: true, temperature: 0.2, max_tokens: 3500 })

    let audit: {
      contradictions?: Array<{ id1: string; id2: string; reason: string }>
      stale?: Array<{ id: string; reason: string }>
      synthesis?: Array<{ category?: string; content?: string; importance?: number; confidence?: number; tags?: string[] }>
      updates?: Array<{ id: string; importance?: number; confidence?: number }>
      gaps?: string[]
      insights?: string
    }
    try { audit = JSON.parse(auditRaw) } catch { audit = {} }

    // ── Apply contradictions ───────────────────────────────────────────────
    for (const { id1, id2, reason } of (audit.contradictions || [])) {
      try {
        const [m1, m2] = await Promise.all([
          prisma.memory.findUnique({ where: { id: id1 } }),
          prisma.memory.findUnique({ where: { id: id2 } }),
        ])
        if (m1 && m2) {
          await Promise.all([
            prisma.memory.update({ where: { id: id1 }, data: {
              needsReview: true,
              contradicts: JSON.stringify(Array.from(new Set([...(JSON.parse(m1.contradicts || '[]') as string[]), id2]))),
              reflectionNote: `Contradicts: "${m2.content.slice(0, 100)}" — ${reason}`,
            }}),
            prisma.memory.update({ where: { id: id2 }, data: {
              needsReview: true,
              contradicts: JSON.stringify(Array.from(new Set([...(JSON.parse(m2.contradicts || '[]') as string[]), id1]))),
              reflectionNote: `Contradicts: "${m1.content.slice(0, 100)}" — ${reason}`,
            }}),
          ])
          result.contradictionsFound++
        }
      } catch { /* skip invalid IDs */ }
    }

    // ── Apply stale flags ──────────────────────────────────────────────────
    for (const { id, reason } of (audit.stale || [])) {
      try {
        const m = allMemories.find(x => x.id === id)
        if (m) {
          await prisma.memory.update({ where: { id }, data: {
            importance:     Math.max(1, m.importance - 2),
            confidence:     Math.max(0.1, m.confidence - 0.15),
            needsReview:    true,
            reflectionNote: `Possibly stale: ${reason}`,
          }})
          result.memoriesUpdated++
        }
      } catch { /* skip */ }
    }

    // ── Create synthesis memories ──────────────────────────────────────────
    const existingPool = allMemories.map(m => ({ category: m.category, content: m.content }))
    for (const s of (audit.synthesis || [])) {
      if (!s.content?.trim()) continue
      const tags = Array.isArray(s.tags) ? s.tags : []
      const unique = deduplicateCandidates(
        [{ category: s.category || 'pattern', content: s.content, importance: s.importance || 7, confidence: s.confidence || 0.8, tags, emotionalValence: null }],
        existingPool
      )
      if (unique.length === 0) continue // deduplicated away — skip
      try {
        await prisma.memory.create({ data: {
          category:      s.category || 'pattern',
          content:       s.content.trim().slice(0, 500),
          importance:    Math.min(10, Math.max(1, s.importance || 7)),
          confidence:    Math.min(1,  Math.max(0.1, s.confidence || 0.8)),
          tags:          JSON.stringify(['synthesis', 'reflection', ...tags]),
          sourceType:    'reflection',
          sourceLabel:   `Self-audit ${new Date().toISOString().slice(0, 10)}`,
        }})
        existingPool.push({ category: s.category || 'pattern', content: s.content })
        result.newMemoriesCreated++
      } catch { /* skip */ }
    }

    // ── Apply importance/confidence updates ────────────────────────────────
    for (const { id, importance, confidence } of (audit.updates || [])) {
      try {
        const updates: Record<string, unknown> = {}
        if (importance !== undefined) updates.importance = Math.min(10, Math.max(1, importance))
        if (confidence !== undefined) updates.confidence = Math.min(1,  Math.max(0.1, confidence))
        if (Object.keys(updates).length > 0) {
          await prisma.memory.update({ where: { id }, data: updates })
          result.memoriesUpdated++
        }
      } catch { /* skip invalid IDs */ }
    }

    result.gaps    = (audit.gaps    || []).slice(0, 10).filter((g): g is string => typeof g === 'string')
    result.insights = typeof audit.insights === 'string' ? audit.insights : ''

    // ── Health recompute + archive dead memories ───────────────────────────
    await updateAllHealthScores()
    result.memoriesArchived += await archiveUnhealthyMemories()

    // ── Persist reflection log ─────────────────────────────────────────────
    await prisma.memoryReflection.create({ data: {
      memoriesReviewed:    result.memoriesReviewed,
      contradictionsFound: result.contradictionsFound,
      memoriesUpdated:     result.memoriesUpdated,
      memoriesArchived:    result.memoriesArchived,
      newMemoriesCreated:  result.newMemoriesCreated,
      insights:            result.insights,
      gaps:                JSON.stringify(result.gaps),
      triggeredBy,
    }})

  } catch (e) {
    console.error('[MemoryReflection] Error:', e)
  }

  return result
}

// ─── Memory compressor ────────────────────────────────────────────────────────

/**
 * AI-powered cluster compression.
 * Takes a dense category (10+ entries) and synthesises it into 3-6 richer, more
 * comprehensive memories — then archives the originals that were fully absorbed.
 * Keeps the bank lean without losing information.
 */
export async function compressMemoryCluster(category: string): Promise<{ compressed: number; created: number }> {
  const memories = await prisma.memory.findMany({
    where: { category, isArchived: false },
    orderBy: { importance: 'desc' },
  })
  if (memories.length < 10) return { compressed: 0, created: 0 }

  const dump = memories.map(m =>
    `[${m.id}] (imp:${m.importance}, src:${m.sourceType || '?'}) ${m.content}`
  ).join('\n')

  let created = 0
  const toArchive = new Set<string>()

  try {
    const raw = await callAI([
      {
        role: 'system',
        content: `You compress a personal AI memory category into fewer, higher-quality entries.
You receive ${memories.length} memories in the "${category}" category.
Synthesise them into 3-6 rich, comprehensive memories — each one capturing MORE than any single original.
For each synthesis, include the IDs of originals it FULLY replaces (all their information is preserved).
Only replace non-critical originals; manual/high-importance entries can stay.
Return ONLY valid JSON: {"synthesis": [{"content": "...", "importance": 1-10, "confidence": 0.1-1.0, "tags": [...], "replaces": ["id1", "id2"]}]}`,
      },
      { role: 'user', content: dump + '\n\nCompress. Return ONLY valid JSON.' },
    ], { json: true, temperature: 0.25, max_tokens: 1500 })

    const parsed = JSON.parse(raw) as { synthesis?: Array<{ content?: string; importance?: number; confidence?: number; tags?: unknown; replaces?: string[] }> }
    const existingPool = memories.map(m => ({ category, content: m.content }))

    for (const s of (parsed.synthesis || [])) {
      if (!s.content?.trim()) continue
      const tags   = Array.isArray(s.tags) ? s.tags as string[] : []
      const unique = deduplicateCandidates(
        [{ category, content: s.content, importance: s.importance || 7, confidence: s.confidence || 0.85, tags, emotionalValence: null }],
        existingPool
      )
      if (unique.length === 0) continue

      await prisma.memory.create({ data: {
        category,
        content:     s.content.trim().slice(0, 500),
        importance:  Math.min(10, Math.max(1, s.importance || 7)),
        confidence:  Math.min(1,  Math.max(0.1, s.confidence || 0.85)),
        tags:        JSON.stringify(['compressed', 'synthesis', ...tags]),
        sourceType:  'reflection',
        sourceLabel: `Compressed ${new Date().toISOString().slice(0, 10)}`,
      }})
      existingPool.push({ category, content: s.content })
      created++

      for (const id of (s.replaces || [])) {
        const m = memories.find(x => x.id === id)
        if (m && m.sourceType !== 'manual' && m.importance < 9) toArchive.add(id)
      }
    }
  } catch (e) {
    console.error(`[compressMemoryCluster:${category}]`, e)
  }

  if (toArchive.size > 0) {
    await prisma.memory.updateMany({
      where: { id: { in: Array.from(toArchive) } },
      data: { isArchived: true },
    })
  }

  return { compressed: toArchive.size, created }
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

export async function buildSystemPrompt(tzOffsetMinutes = 0, recentUserMessages: string[] = []): Promise<string> {
  // Compute the user's local date/time (server runs UTC on Vercel)
  const serverNow = new Date()
  const localNow = new Date(serverNow.getTime() - tzOffsetMinutes * 60 * 1000)
  const localDateStr = localNow.toISOString().slice(0, 10)          // YYYY-MM-DD
  const localDayName = localNow.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  const localTimeStr = localNow.toISOString().slice(11, 16)          // HH:MM

  // Helper: turn a stored UTC dueDate into a human-readable label relative to user's local today
  function toRelativeLabel(dueDateInput: Date | string): string {
    const due = new Date(dueDateInput)

    // Date-only values (e.g. todo due "March 29") are stored as midnight UTC with no
    // timezone shift applied. Subtracting the user's offset would roll them back to the
    // previous evening, making today's todos look overdue. So: if the stored time is
    // exactly UTC midnight, treat the UTC calendar date as the intended local calendar date.
    //
    // Timed values (reminders, todos with a specific time) ARE stored with the timezone
    // offset applied (e.g., 8pm EST stored as 01:00 UTC next day), so we shift those back.
    const isStoredMidnight =
      due.getUTCHours() === 0 && due.getUTCMinutes() === 0 && due.getUTCSeconds() === 0
    // dueLocal: the instant expressed in the user's local wall clock
    const dueLocal = isStoredMidnight
      ? due  // already the local calendar date — no shift needed
      : new Date(due.getTime() - tzOffsetMinutes * 60 * 1000)

    const dueDay = dueLocal.toISOString().slice(0, 10)
    const diffMs = new Date(dueDay).getTime() - new Date(localDateStr).getTime()
    const diffDays = Math.round(diffMs / 86_400_000)

    // hasTime: true only if there is a meaningful local time (not midnight)
    const localH = dueLocal.getUTCHours()
    const localM = dueLocal.getUTCMinutes()
    const hasTime = localH !== 0 || localM !== 0
    // timeLabel uses dueLocal (already in local-wall-clock frame) so it shows "8:00 PM" not "1:00 AM"
    const timeLabel = hasTime
      ? ` at ${dueLocal.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })}`
      : ''

    if (diffDays < -1) return `OVERDUE (was ${dueLocal.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}${timeLabel})`
    if (diffDays === -1) return `OVERDUE (yesterday${timeLabel})`
    if (diffDays === 0) return `TODAY${timeLabel}`
    if (diffDays === 1) return `tomorrow${timeLabel}`
    if (diffDays <= 6) return `${dueLocal.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}${timeLabel}`
    return `${dueLocal.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}${timeLabel}`
  }

  // Build a context query from recent user messages — used for relevance-scored memory retrieval
  // and smart note loading (fewer notes when the conversation isn't note-related)
  const _contextQuery = recentUserMessages.slice(-2).join(' ')
  const _noteRelated  = /note|wrote|saved|journal|log|record|wrote down/i.test(_contextQuery)

  const [memories, profile, allNotes, recentDebates, pendingReminders, recentConversations, pendingTodos, langProgress, learnedWordsList, completedTodos, completedReminders, todoBehaviorPatterns] = await Promise.all([
    getRelevantMemories(_contextQuery, 50),
    getUserProfile(),
    // Smart note loading: full 30 when the conversation references notes; 15 otherwise
    prisma.note.findMany({
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: _noteRelated ? 30 : 15,
      select: { title: true, content: true, tags: true, encrypted: true, pinned: true, updatedAt: true },
    }),
    prisma.debate.findMany({
      where: { status: 'concluded' },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: {
        topic: true, winner: true, conclusion: true, userStance: true,
        rounds: { orderBy: { roundNumber: 'desc' }, take: 1, select: { userScore: true, aiScore: true } },
      },
    }),
    // ALL pending reminders, sorted by urgency
    prisma.reminder.findMany({
      where: { isDone: false },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: 30,
    }),
    // Recent conversations with summaries — the core continuity mechanism
    prisma.conversation.findMany({
      where: { summary: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: { id: true, title: true, summary: true, updatedAt: true },
    }),
    // ALL pending todos — Skippy should know everything on the list
    prisma.todo.findMany({
      where: { isDone: false },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
      take: 50,
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
    // Completed todos (last 14 days) — so Skippy can celebrate progress & see momentum
    prisma.todo.findMany({
      where: { isDone: true, completedAt: { gte: new Date(Date.now() - 14 * 86400 * 1000) } },
      orderBy: { completedAt: 'desc' },
      take: 30,
      select: { content: true, priority: true, completedAt: true },
    }).catch(() => [] as Array<{ content: string; priority: string; completedAt: Date | null }>),
    // Completed reminders (last 7 days) — continuity context
    prisma.reminder.findMany({
      where: { isDone: true, completedAt: { gte: new Date(Date.now() - 7 * 86400 * 1000) } },
      orderBy: { completedAt: 'desc' },
      take: 20,
      select: { content: true, completedAt: true },
    }).catch(() => [] as Array<{ content: string; completedAt: Date | null }>),
    // Behavior patterns — how this user phrases and prioritizes tasks
    prisma.memory.findMany({
      where: { category: 'pattern', tags: { contains: '"todo-behavior"' }, isArchived: false },
      orderBy: { importance: 'desc' },
      take: 6,
      select: { content: true },
    }).catch(() => [] as Array<{ content: string }>),
  ])

  const profileSection = profile.about
    ? `\n\n## Your profile:\n${profile.about}`
    : ''

  const instructionsSection = profile.customInstructions
    ? `\n\n## How I want you to behave (my custom instructions):\n${profile.customInstructions}`
    : ''

  const memorySection = memories
    ? `\n\n## What I've learned about you across all conversations (organized by category):\n${memories}`
    : ''

  let notesSection = ''
  if (allNotes.length > 0) {
    const noteLines = allNotes.map(n => {
      const rawContent = n.encrypted ? decrypt(n.content) : n.content
      const plain = rawContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      const tags = n.tags ? (() => { try { return (JSON.parse(n.tags) as string[]).join(', ') } catch { return '' } })() : ''
      const date = n.updatedAt.toISOString().slice(0, 10)
      // Pinned notes get up to 400 chars; others get 200
      const previewLen = n.pinned ? 400 : 200
      const preview = plain.slice(0, previewLen)
      return `- "${n.title}"${n.pinned ? ' 📌' : ''}${tags ? ` [${tags}]` : ''} [${date}]${preview ? `: ${preview}${plain.length > previewLen ? '…' : ''}` : ''}`
    })
    notesSection = `\n\n## Your notes (${allNotes.length} total — you can reference any of these by title):\n${noteLines.join('\n')}`
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
    // Group by priority
    const byPriority: Record<string, typeof pendingTodos> = {}
    for (const t of pendingTodos) {
      const p = t.priority || 'normal'
      if (!byPriority[p]) byPriority[p] = []
      byPriority[p].push(t)
    }
    const todoLines: string[] = []
    for (const prio of ['urgent', 'high', 'normal', 'low']) {
      if (!byPriority[prio]) continue
      for (const t of byPriority[prio]) {
        const icon = PRIO[prio] || '🔵'
        const due = t.dueDate ? ` [due ${toRelativeLabel(t.dueDate)}]` : ''
        todoLines.push(`- ${icon} ${t.content}${due}`)
      }
    }
    todoSection = `\n\n## Your complete todo list (${pendingTodos.length} items, today is ${localDayName} ${localDateStr}):\n${todoLines.join('\n')}`
  }

  // Completed todos section — celebrate progress and show momentum
  let completedTodosSection = ''
  if (completedTodos.length > 0) {
    const lines = completedTodos.map(t => {
      const when = t.completedAt ? ` [${toRelativeLabel(t.completedAt)}]` : ''
      const icon = t.priority === 'urgent' ? '🔴' : t.priority === 'high' ? '🟠' : '✓'
      return `- ${icon} ${t.content}${when}`
    })
    completedTodosSection = `\n\n## Recently completed tasks (last 14 days — ${completedTodos.length} done — reference these to celebrate wins and spot patterns):\n${lines.join('\n')}`
  }

  // Completed reminders section
  let completedRemindersSection = ''
  if (completedReminders.length > 0) {
    const lines = completedReminders.map(r => {
      const when = r.completedAt ? ` [${toRelativeLabel(r.completedAt)}]` : ''
      return `- ✓ ${r.content}${when}`
    })
    completedRemindersSection = `\n\n## Recently dismissed reminders (last 7 days):\n${lines.join('\n')}`
  }

  // Behavior patterns section — teaches Skippy how this user talks
  let behaviorPatternSection = ''
  if (todoBehaviorPatterns.length > 0) {
    behaviorPatternSection = `\n\n## Learned task patterns (how this user assigns and phrases tasks — use for smarter priority/date inference):\n${todoBehaviorPatterns.map(p => `- ${p.content}`).join('\n')}`
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
    const now = new Date()
    const urgent: string[] = []
    const upcoming: string[] = []
    const anytime: string[] = []

    for (const r of pendingReminders) {
      const duePart = r.dueDate
        ? ` — due ${toRelativeLabel(r.dueDate)}`
        : r.timeframeLabel
        ? ` — ${r.timeframeLabel}`
        : ''
      const line = `• "${r.content}"${duePart}`

      if (!r.dueDate) {
        anytime.push(line)
      } else {
        const hoursUntil = (new Date(r.dueDate).getTime() - now.getTime()) / 3_600_000
        if (hoursUntil < 0 || hoursUntil <= 24) urgent.push(line)
        else upcoming.push(line)
      }
    }

    const parts: string[] = []
    if (urgent.length) parts.push(`**Urgent/today:**\n${urgent.join('\n')}`)
    if (upcoming.length) parts.push(`**Upcoming:**\n${upcoming.join('\n')}`)
    if (anytime.length) parts.push(`**Anytime:**\n${anytime.join('\n')}`)
    reminderSection = `\n\n## Your pending reminders (${pendingReminders.length} total — surface these when relevant):\n${parts.join('\n\n')}`
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

Your capabilities (always available — never say you "can't" do these):
- When the user asks you to "write a daily note", "log what I did today", "save this as a note", or anything similar, write the full reflection in your response and let them know it's being saved automatically
- **Todo creation** (critical — this ALWAYS works): When the user says "add X to my list/todos/to-do", "put X on my tasks", "create a task for X", "task: X", "I need to do X", "don't forget to X", "schedule X for [date]" → confirm it in your response AND it is being added to their database automatically. Be specific: repeat the task name and any due date back to them.
  - Activity-type tasks with NO date (gym, workout, VR session, yoga, run, coffee, lunch, dinner, call, appointment, errand, groceries) → Skippy knows these are same-day tasks and sets them due TODAY automatically.
  - Explicit due dates ("by Friday", "tomorrow") → set accordingly.
  - Urgency signals ("asap", "urgent", "deadline") → set as high/urgent priority.
- **Reminder creation**: "remind me to X at Y", "set a reminder for X", "don't let me forget X by Z" → confirm it and it's being set automatically. Always state the time/date back.
- **Marking complete**: When user says "I finished X", "I did X", "done with X", "I took care of X", "knocked out X" → acknowledge warmly, specific to the item, and it's being checked off automatically.
- **You know the full list**: You see EVERY pending todo AND every recently completed item. Reference completion history to celebrate streaks and momentum ("you've knocked out X tasks this week!").
- **Pattern awareness**: You have learned how this user talks. A casual "add gym" means same-day urgent, "add X eventually" means low priority. Apply these patterns intelligently.
- You know every note they've written — if they say "find my note about X", reference the matching note from the notes section below
- You know their full todo list, ALL their reminders, their complete memory history, and their recently completed tasks — reference specific items when relevant${profileSection}${instructionsSection}${reminderSection}${todoSection}${completedTodosSection}${completedRemindersSection}${behaviorPatternSection}${conversationSection}${memorySection}${notesSection}${debateSection}${langSection}

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
