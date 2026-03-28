/**
 * Unified AI streaming factory.
 * Routes to Grok (OpenAI-compat) or Claude (Anthropic) based on model param.
 * Always returns a raw ReadableStream of plain text chunks.
 */
import { grok, GROK_MODEL } from './grok'
import { anthropic, CLAUDE_MODEL, claudeAvailable } from './claude'

export type AIModel = 'grok' | 'claude'

export interface StreamOptions {
  systemPrompt: string
  messages: Array<{ role: string; content: string }>
  onChunk?: (chunk: string) => void
}

export async function streamAIResponse(
  model: AIModel,
  options: StreamOptions
): Promise<ReadableStream<Uint8Array>> {
  const { systemPrompt, messages } = options
  const encoder = new TextEncoder()

  if (model === 'claude') {
    if (!claudeAvailable()) {
      throw new Error('Claude API key not configured. Add ANTHROPIC_API_KEY to .env')
    }

    return new ReadableStream({
      async start(controller) {
        try {
          const stream = anthropic.messages.stream({
            model: CLAUDE_MODEL,
            max_tokens: 2048,
            system: systemPrompt,
            messages: messages
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          })

          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
        } finally {
          controller.close()
        }
      },
    })
  }

  // Default: Grok
  const response = await grok.chat.completions.create({
    model: GROK_MODEL,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ] as Parameters<typeof grok.chat.completions.create>[0]['messages'],
    temperature: 0.8,
    max_tokens: 2048,
  })

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of response) {
          const delta = chunk.choices[0]?.delta?.content || ''
          if (delta) controller.enqueue(encoder.encode(delta))
        }
      } finally {
        controller.close()
      }
    },
  })
}

export { claudeAvailable }
