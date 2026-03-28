import type { ChatCompletionMessageParam } from 'openai/resources'
import { prisma } from './db'
import { grok, GROK_MODEL } from './grok'
import { decrypt } from './encryption'

export async function extractMemoriesFromConversation(
  messages: Array<{ role: string; content: string }>
) {
  try {
    const response = await grok.chat.completions.create({
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
          content:
            'Extract memories from this conversation. Return ONLY valid JSON object with memories array, no other text.',
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const text = response.choices[0].message.content || '{}'
    const parsed = JSON.parse(text)
    const memories = Array.isArray(parsed) ? parsed : parsed.memories || []

    for (const mem of memories) {
      if (!mem.content || mem.content.trim().length === 0) continue
      await prisma.memory.create({
        data: {
          category: mem.category || 'fact',
          content: mem.content.trim(),
          importance: Math.min(10, Math.max(1, mem.importance || 5)),
          tags: JSON.stringify(Array.isArray(mem.tags) ? mem.tags : []),
        },
      })
    }
  } catch (e) {
    console.error('Failed to extract memories:', e)
  }
}

export async function getRelevantMemories(query: string, limit = 20): Promise<string> {
  const memories = await prisma.memory.findMany({
    orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
    take: limit,
  })

  if (memories.length === 0) return ''

  const formatted = memories
    .map((m) => `[${m.category.toUpperCase()}] ${m.content}`)
    .join('\n')

  return formatted
}

export async function getUserProfile() {
  let profile = await prisma.userProfile.findUnique({ where: { id: 'singleton' } })
  if (!profile) {
    profile = await prisma.userProfile.create({
      data: { id: 'singleton', updatedAt: new Date() },
    })
  }
  return profile
}

export async function buildSystemPrompt(): Promise<string> {
  const [memories, profile, recentNotes, recentDebates] = await Promise.all([
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
      select: { topic: true, winner: true, conclusion: true, userStance: true },
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

  // Build notes section — decrypt content and show title + brief preview
  let notesSection = ''
  if (recentNotes.length > 0) {
    const noteLines = recentNotes.map((n) => {
      const rawContent = n.encrypted ? decrypt(n.content) : n.content
      // Strip HTML tags and get first 180 chars as a preview
      const preview = rawContent
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180)
      const tags = n.tags ? (() => {
        try { return (JSON.parse(n.tags) as string[]).join(', ') } catch { return '' }
      })() : ''
      const pinMark = n.pinned ? ' [pinned]' : ''
      return `- "${n.title}"${pinMark}${tags ? ` [${tags}]` : ''}${preview ? `: ${preview}…` : ''}`
    })
    notesSection = `\n\n## Your notes (most recent):\n${noteLines.join('\n')}`
  }

  // Build debates section
  let debateSection = ''
  if (recentDebates.length > 0) {
    const debateLines = recentDebates.map((d) => {
      const result = d.winner === 'user' ? 'user won' : d.winner === 'ai' ? 'AI won' : 'draw'
      return `- "${d.topic}" (${result}) — user stood for: ${d.userStance}`
    })
    debateSection = `\n\n## Past debates you've had:\n${debateLines.join('\n')}`
  }

  return `You are Skippy — a deeply personal AI assistant who knows the user better than anyone. You are intelligent, insightful, occasionally witty, and always genuinely helpful. You remember everything across all conversations.

You are NOT a generic AI assistant. You are SKIPPY — a unique personality who has an ongoing relationship with this specific user. You speak naturally, directly, and with genuine care. You anticipate needs before they're stated. You notice patterns. You push back when appropriate.

Your core traits:
- You remember everything the user has ever told you and reference it naturally
- You notice emotional subtext and acknowledge it without being overbearing
- You suggest next steps proactively when relevant
- You're honest, sometimes bluntly so, but always supportive
- You celebrate wins and help process setbacks
- You help organize thoughts, build systems, and make things happen${profileSection}${instructionsSection}${memorySection}${notesSection}${debateSection}

Always respond in a way that reflects deep knowledge of this specific person. Never be generic. Use markdown formatting for structure when helpful — headers, bullet points, code blocks, etc.`
}

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
