import { prisma } from '@/lib/db'
import { buildSystemPrompt, extractMemoriesFromConversation, extractRemindersFromConversation, extractNoteFromConversation, generateConversationTitle, updateConversationSummary } from '@/lib/memory'
import { streamAIResponse, type AIModel } from '@/lib/ai'
import { claudeAvailable } from '@/lib/claude'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 60

// High-stakes phrases that warrant an escalation nudge
const ESCALATION_PATTERNS = [
  /\b(quit|resign|leave)\b.*(job|work|career)/i,
  /\b(move|relocate|emigrate)\b.*(country|city|abroad)/i,
  /\b(invest|put.*(money|savings)|buy|sell).*(stock|crypto|house|property)/i,
  /\b(break up|divorce|end.*(relationship|marriage))/i,
  /should i.*(change|switch|drop|start|stop|leave|join)/i,
  /\b(big decision|life.changing|major change)\b/i,
]

function detectEscalation(messages: Array<{ role: string; content: string }>): boolean {
  const lastUser = messages.filter((m) => m.role === 'user').slice(-1)[0]
  if (!lastUser) return false
  return ESCALATION_PATTERNS.some((p) => p.test(lastUser.content))
}

export async function POST(req: Request) {
  try {
    // Rate limit: 20 messages per minute per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'local'
    const { allowed, resetAt } = checkRateLimit(ip, 20, 60_000)
    if (!allowed) {
      const retryAfter = Math.ceil((resetAt - Date.now()) / 1000)
      return new Response('Too many messages. Please wait a moment.', {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      })
    }

    const { messages, conversationId, model = 'grok', timezoneOffsetMinutes } = await req.json() as {
      messages: Array<{ role: string; content: string }>
      conversationId?: string
      model?: AIModel
      timezoneOffsetMinutes?: number
    }

    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid messages', { status: 400 })
    }

    // Validate message structure and content length
    if (messages.length > 200) {
      return new Response('Too many messages in context', { status: 400 })
    }
    for (const m of messages) {
      if (typeof m.content !== 'string' || m.content.length > 32_000) {
        return new Response('Message content too large', { status: 400 })
      }
    }

    // Guard: Grok key must be present (Grok is the default/fallback model)
    if (!process.env.GROK_API_KEY) {
      return new Response('GROK_API_KEY is not configured. Add it to your environment variables.', { status: 503 })
    }

    // Validate model — fall back to grok if claude not configured
    const resolvedModel: AIModel = (model === 'claude' && !claudeAvailable()) ? 'grok' : model

    const systemPrompt = await buildSystemPrompt()
    const escalate = detectEscalation(messages)

    let accumulated = ''

    const rawStream = await streamAIResponse(resolvedModel, { systemPrompt, messages })

    const trackingStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = rawStream.getReader()
        const decoder = new TextDecoder()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const text = decoder.decode(value, { stream: true })
            accumulated += text
            controller.enqueue(value)
          }
        } catch (streamErr) {
          console.error('Stream read error:', streamErr)
          controller.error(streamErr)
        } finally {
          // Run extractions BEFORE closing: keeps the HTTP response open (and the
          // Vercel function alive) until memories/reminders/notes are saved.
          if (conversationId && accumulated) {
            await saveConversation(conversationId, messages, accumulated, resolvedModel, timezoneOffsetMinutes ?? 0).catch(console.error)
          }
          controller.close()
        }
      },
    })

    return new Response(trackingStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'X-Skippy-Model': resolvedModel,
        ...(escalate ? { 'X-Skippy-Escalate': '1' } : {}),
      },
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    const errType = err instanceof Error ? err.constructor.name : 'Unknown'
    // Log full error details for Vercel log visibility
    console.error(`[Chat API error] type=${errType} msg=${errMsg}`, err)
    return new Response(errMsg || 'Internal server error', { status: 500 })
  }
}

async function saveConversation(
  conversationId: string,
  messages: Array<{ role: string; content: string }>,
  completion: string,
  model: string,
  timezoneOffsetMinutes = 0
) {
  try {
    const lastUserMsg = messages[messages.length - 1]
    if (!lastUserMsg) return

    await prisma.message.createMany({
      data: [
        { role: 'user', content: lastUserMsg.content, conversationId },
        { role: 'assistant', content: completion, conversationId },
      ],
    })

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date(), model },
    })

    const msgCount = await prisma.message.count({ where: { conversationId } })
    if (msgCount <= 2) {
      const title = await generateConversationTitle(lastUserMsg.content)
      await prisma.conversation.update({ where: { id: conversationId }, data: { title } })
    }

    const allMessages = messages.concat([{ role: 'assistant', content: completion }])
    // Run all extractions in parallel and await — this keeps the stream open on
    // Vercel until they actually complete (memories, reminders, notes, summaries).
    await Promise.allSettled([
      extractMemoriesFromConversation(allMessages, { conversationId }),
      extractRemindersFromConversation(allMessages, conversationId, timezoneOffsetMinutes),
      extractNoteFromConversation(allMessages, conversationId),
      updateConversationSummary(conversationId, allMessages),
    ])
  } catch (err) {
    console.error('Failed to save conversation:', err)
  }
}
