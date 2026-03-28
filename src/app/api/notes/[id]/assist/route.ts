import { prisma } from '@/lib/db'
import { buildSystemPrompt } from '@/lib/memory'
import { streamAIResponse, type AIModel } from '@/lib/ai'
import { decrypt } from '@/lib/encryption'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'local'
    const { allowed, resetAt } = checkRateLimit(ip, 20, 60_000)
    if (!allowed) {
      const retryAfter = Math.ceil((resetAt - Date.now()) / 1000)
      return new Response('Too many requests. Please wait.', {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      })
    }

    const { messages, model = 'grok' } = (await req.json()) as {
      messages: Array<{ role: string; content: string }>
      model?: AIModel
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response('Invalid messages', { status: 400 })
    }

    const note = await prisma.note.findUnique({ where: { id: params.id } })
    if (!note) return new Response('Note not found', { status: 404 })

    const noteContent = decrypt(note.content)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const tags = (() => {
      try { return (JSON.parse(note.tags) as string[]).join(', ') } catch { return '' }
    })()

    const basePrompt = await buildSystemPrompt()

    const systemPrompt = `${basePrompt}

## Active Note — you are helping write, expand, and refine this note
Title: "${note.title}"
${tags ? `Tags: ${tags}` : ''}
Created: ${note.createdAt.toISOString().slice(0, 10)}

Content:
${noteContent || '(note is empty — help the user start writing)'}

---
You are acting as an intelligent writing partner embedded directly in the note editor.
- When asked to expand, add, or write content, produce clean, well-structured markdown text the user can insert directly into the note.
- When summarising the day, research, or feelings — draw on the user's memories, past notes, and debates you have in context.
- Be specific. Reference the actual content of the note and what you know about the user.
- Keep responses focused and actionable.`

    const stream = await streamAIResponse(model as AIModel, { systemPrompt, messages })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    console.error('Note assist error:', err)
    return new Response('Internal server error', { status: 500 })
  }
}
