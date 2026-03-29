/**
 * Unified AI factory.
 * Routes to Grok (OpenAI-compat), Claude (Anthropic), or Auto (best of both).
 */
import { grok, GROK_MODEL } from './grok'
import { anthropic, CLAUDE_MODEL, claudeAvailable } from './claude'

export type AIModel = 'grok' | 'claude' | 'auto'

export interface StreamOptions {
  systemPrompt: string
  messages: Array<{ role: string; content: string }>
  onChunk?: (chunk: string) => void
}

/** Internal single-model completion — never 'auto' */
async function completionFor(
  model: 'grok' | 'claude',
  options: { systemPrompt: string; userMessage: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  const { systemPrompt, userMessage, temperature = 0.75, maxTokens = 400 } = options

  if (model === 'claude' && claudeAvailable()) {
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })
    const block = res.content[0]
    return block.type === 'text' ? block.text.trim() : ''
  }

  const res = await grok.chat.completions.create({
    model: GROK_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature,
    max_tokens: maxTokens,
  })
  return res.choices[0].message.content?.trim() || ''
}

/**
 * Runs both Grok and Claude in parallel, asks Grok to judge which response is stronger,
 * and returns the winner with a model label.
 */
export async function getBestCompletion(
  options: { systemPrompt: string; userMessage: string; temperature?: number; maxTokens?: number }
): Promise<{ text: string; usedModel: 'grok' | 'claude' }> {
  const [grokResult, claudeResult] = await Promise.all([
    completionFor('grok', options).catch(() => ''),
    claudeAvailable() ? completionFor('claude', options).catch(() => '') : Promise.resolve(''),
  ])

  // Fall back if one model is unavailable
  if (!claudeResult || !claudeAvailable()) return { text: grokResult, usedModel: 'grok' }
  if (!grokResult) return { text: claudeResult, usedModel: 'claude' }

  // Grok judges both responses (fast, and won't systematically favor Claude)
  const judgeRes = await grok.chat.completions.create({
    model: GROK_MODEL,
    messages: [
      { role: 'system', content: 'You are an objective judge. Respond with ONLY the letter "A" or "B".' },
      {
        role: 'user',
        content: `Which response is stronger, more specific, and more insightful?\n\nA:\n${grokResult}\n\nB:\n${claudeResult}\n\nReply ONLY "A" or "B".`,
      },
    ],
    temperature: 0.1,
    max_tokens: 5,
  }).catch(() => null)

  const pick = judgeRes?.choices[0]?.message?.content?.trim().toUpperCase() || 'B'
  const useGrok = pick.startsWith('A')
  return { text: useGrok ? grokResult : claudeResult, usedModel: useGrok ? 'grok' : 'claude' }
}

/** Non-streaming single-turn completion — handles 'auto' by running getBestCompletion */
export async function getAICompletion(
  model: AIModel,
  options: { systemPrompt: string; userMessage: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  if (model === 'auto') {
    const { text } = await getBestCompletion(options)
    return text
  }
  return completionFor(model, options)
}

export async function streamAIResponse(
  model: AIModel,
  options: StreamOptions
): Promise<ReadableStream<Uint8Array>> {
  const { systemPrompt, messages } = options
  const encoder = new TextEncoder()

  // 'auto' streaming: use Claude if available (better for long-form reasoning), else Grok
  const resolvedModel: 'grok' | 'claude' =
    model === 'auto' ? (claudeAvailable() ? 'claude' : 'grok') : model

  if (resolvedModel === 'claude') {
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
        } catch (err) {
          console.error('[Claude stream error]', err)
          controller.error(err)
        } finally {
          controller.close()
        }
      },
    })
  }

  // Default: Grok — with automatic Claude fallback if connection fails
  async function grokStream(): Promise<ReadableStream<Uint8Array>> {
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
        } catch (err) {
          console.error('[Grok stream error]', err)
          controller.error(err)
        } finally {
          controller.close()
        }
      },
    })
  }

  try {
    return await grokStream()
  } catch (grokErr) {
    // If Grok fails with a connection error (e.g. API unreachable from this host)
    // automatically fall back to Claude if available
    const isConnErr = grokErr instanceof Error &&
      (grokErr.message.includes('Connection error') || grokErr.message.includes('fetch failed') || grokErr.message.includes('ECONNREFUSED') || grokErr.message.includes('ENOTFOUND'))
    if (isConnErr && claudeAvailable()) {
      console.warn('[AI] Grok unreachable — falling back to Claude')
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
              if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                controller.enqueue(encoder.encode(event.delta.text))
              }
            }
          } catch (err) {
            console.error('[Claude fallback stream error]', err)
            controller.error(err)
          } finally {
            controller.close()
          }
        },
      })
    }
    throw grokErr
  }
}
