import { prisma } from '@/lib/db'
import { grok, GROK_MODEL } from '@/lib/grok'
import { buildSystemPrompt } from '@/lib/memory'
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

// POST /api/debates/[id]/round — submit user argument, returns streaming AI rebuttal + scores
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

  // Build debate history for context
  const historyLines = debate.rounds.map((r) =>
    `Round ${r.roundNumber}:\nUser argued: ${r.userArgument}\nSkippy rebutted: ${r.aiRebuttal}\n(User confidence: ${r.userScore}%, AI confidence: ${r.aiScore}%)`
  ).join('\n\n')

  // Create the round immediately so we have an ID to stream against
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

  const prompt = `You are Skippy — a sharp, confident AI debating the following topic with the user.

DEBATE TOPIC: "${debate.topic}"
YOUR POSITION: ${debate.aiStance}
USER'S POSITION: ${debate.userStance}

${historyLines ? `DEBATE HISTORY:\n${historyLines}\n\n` : ''}USER'S ARGUMENT IN ROUND ${roundNumber}:
"${userArgument}"

Your task:
1. REBUTTAL: Respond directly and confidently to their argument. Acknowledge any valid points (be intellectually honest), then explain why your position still holds or is stronger. Use specific reasoning grounded in what you know about the user. Be direct — 2-4 sentences max.

2. SCORE UPDATE: After reflecting on the full debate so far, assess the confidence scores (0-100). A score of 50 = tied, 80 = strong lead, 100 = complete win. Be fair — if the user made a genuinely strong point, their score should increase.

Respond in this EXACT format (no other text):
REBUTTAL: [your rebuttal here]
USER_SCORE: [0-100]
AI_SCORE: [0-100]
ROUND_VERDICT: [one of: "user_stronger" | "ai_stronger" | "tied"]`

  let accumulated = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await grok.chat.completions.create({
          model: GROK_MODEL,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 400,
        })

        for await (const chunk of response) {
          const delta = chunk.choices[0]?.delta?.content || ''
          if (delta) {
            accumulated += delta
            controller.enqueue(new TextEncoder().encode(delta))
          }
        }
      } finally {
        controller.close()

        // Parse structured response and save
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

  // Return round ID in headers so client can reload after stream
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Round-Id': round.id,
    },
  })
}
