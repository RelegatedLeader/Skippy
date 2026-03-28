import { prisma } from '@/lib/db'
import { grok, GROK_MODEL } from '@/lib/grok'
import { anthropic, CLAUDE_MODEL, claudeAvailable } from '@/lib/claude'
import { buildSystemPrompt } from '@/lib/memory'
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userArgument } = await req.json()
  if (!userArgument?.trim()) return new Response('Missing userArgument', { status: 400 })

  const debate = await prisma.debate.findUnique({
    where: { id: params.id },
    include: { rounds: { orderBy: { roundNumber: 'asc' } } },
  })
  if (!debate) return new Response('Debate not found', { status: 404 })
  if (debate.status === 'concluded') return new Response('Debate already concluded', { status: 400 })

  const roundNumber = debate.rounds.length + 1
  const systemPrompt = await buildSystemPrompt()
  const model = debate.model || 'grok'

  const historyLines = debate.rounds.map((r) =>
    `Round ${r.roundNumber}:\nUser argued: ${r.userArgument}\nSkippy rebutted: ${r.aiRebuttal}\n(Confidence → User ${r.userScore}%, Skippy ${r.aiScore}%)`
  ).join('\n\n')

  const round = await prisma.debateRound.create({
    data: {
      debateId: debate.id,
      roundNumber,
      userArgument,
      aiRebuttal: '',
      userScore: debate.rounds.length > 0 ? debate.rounds[debate.rounds.length - 1].userScore : 50,
      aiScore: debate.rounds.length > 0 ? debate.rounds[debate.rounds.length - 1].aiScore : 50,
    },
  })

  const prompt = `You are Skippy — a sharp, deeply personal AI debating the following topic with the user.

DEBATE TOPIC: "${debate.topic}"
YOUR POSITION: ${debate.aiStance}
USER'S POSITION: ${debate.userStance}

${historyLines ? `DEBATE HISTORY:\n${historyLines}\n\n` : ''}USER'S ARGUMENT IN ROUND ${roundNumber}:
"${userArgument}"

Your task:

1. REBUTTAL: Respond directly and confidently to their argument. Ground your reasoning in WHO this person is — their character, emotional patterns, relationship history, values, and how they've made decisions across their life. Do NOT lean on what projects or tools they've been building lately; look at the deeper patterns of who they are as a person. Acknowledge any valid points honestly, then explain why your position still holds or is stronger. Be specific and personal — 2-4 sentences, no fluff.

2. SCORE UPDATE: Assess confidence scores (0-100) based on the full debate so far. 50 = tied, 80 = strong lead. Be fair — genuinely strong arguments must move the scores.

Respond in this EXACT format (no other text, no preamble):
REBUTTAL: [your rebuttal here]
USER_SCORE: [0-100]
AI_SCORE: [0-100]
ROUND_VERDICT: [one of: "user_stronger" | "ai_stronger" | "tied"]`

  let accumulated = ''
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (model === 'claude' && claudeAvailable()) {
          const claudeStream = anthropic.messages.stream({
            model: CLAUDE_MODEL,
            max_tokens: 500,
            system: systemPrompt,
            messages: [{ role: 'user', content: prompt }],
          })
          for await (const event of claudeStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              accumulated += event.delta.text
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
        } else {
          const response = await grok.chat.completions.create({
            model: GROK_MODEL,
            stream: true,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 500,
          })
          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta?.content || ''
            if (delta) {
              accumulated += delta
              controller.enqueue(encoder.encode(delta))
            }
          }
        }
      } finally {
        controller.close()

        try {
          const rebMatch = accumulated.match(/REBUTTAL:\s*([\s\S]*?)(?=USER_SCORE:|$)/)
          const userScoreMatch = accumulated.match(/USER_SCORE:\s*(\d+)/)
          const aiScoreMatch = accumulated.match(/AI_SCORE:\s*(\d+)/)

          const rebuttal = rebMatch ? rebMatch[1].trim() : accumulated
          const userScore = Math.min(100, Math.max(0, parseInt(userScoreMatch?.[1] || '50')))
          const aiScore = Math.min(100, Math.max(0, parseInt(aiScoreMatch?.[1] || '50')))

          await prisma.debateRound.update({
            where: { id: round.id },
            data: { aiRebuttal: rebuttal, userScore, aiScore },
          })
          await prisma.debate.update({
            where: { id: debate.id },
            data: { updatedAt: new Date() },
          })
        } catch (e) {
          console.error('Failed to save debate round:', e)
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Round-Id': round.id,
    },
  })
}
