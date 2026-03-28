import { prisma } from '@/lib/db'
import { buildSystemPrompt } from '@/lib/memory'
import { getAICompletion, type AIModel } from '@/lib/ai'

export async function GET() {
  const debates = await prisma.debate.findMany({
    orderBy: { createdAt: 'desc' },
    include: { rounds: { orderBy: { roundNumber: 'asc' } } },
  })
  return Response.json(debates)
}

export async function POST(req: Request) {
  const { topic, userStance, model = 'grok' } = await req.json()
  if (!topic || !userStance) return new Response('Missing topic or userStance', { status: 400 })

  const systemPrompt = await buildSystemPrompt()

  const aiStance = await getAICompletion(model as AIModel, {
    systemPrompt,
    userMessage: `We are about to debate the following topic: "${topic}".
The user's stance is: "${userStance}".

Generate Skippy's opening position — the opposing or challenging viewpoint. Ground your position in what you know about this specific person: their values, emotional patterns, relationship history, and how they've made decisions in the past. Be specific to who they are, not generic. Give 2-3 clear reasons. Be direct and confident, not wishy-washy. Keep it to 3-4 sentences max.

Return ONLY the opening statement, no preamble.`,
    temperature: 0.75,
    maxTokens: 300,
  })

  const debate = await prisma.debate.create({
    data: { topic, userStance, aiStance: aiStance || 'I challenge that position.', model },
    include: { rounds: true },
  })

  return Response.json(debate, { status: 201 })
}
