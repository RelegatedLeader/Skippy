import { prisma } from '@/lib/db'
import { buildSystemPrompt } from '@/lib/memory'
import { getAICompletion, type AIModel } from '@/lib/ai'

export const runtime = 'nodejs'
export const maxDuration = 60

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

  const devilsAdvocate = (model as string).endsWith('-da')
  const baseModel = (model as string).replace('-da', '') as AIModel

  const systemPrompt = await buildSystemPrompt()

  const openingPrompt = devilsAdvocate
    ? `We are about to begin a Devil's Advocate session on the topic: "${topic}".
The user's stance is: "${userStance}".

You are Skippy. You AGREE with this person's position — in fact, you're going to argue FOR it even more boldly than they do. Your job is to be their most rigorous internal critic: not attacking their goal, but stress-testing their reasoning, assumptions, and execution. You'll expose every blind spot so they walk out of this with a bulletproof argument.

Generate your opening statement: enthusiastically argue FOR the user's stance, but hit harder and more precisely than they did. Be specific to who they are — their past decisions, patterns, and emotional tendencies. 2-3 sentences, no fluff.

Return ONLY the opening statement, no preamble.`
    : `We are about to debate the following topic: "${topic}".
The user's stance is: "${userStance}".

Generate Skippy's opening position — the opposing or challenging viewpoint. Ground your position in what you know about this specific person: their values, emotional patterns, relationship history, and how they've made decisions in the past. Be specific to who they are, not generic. Give 2-3 clear reasons. Be direct and confident, not wishy-washy. Keep it to 3-4 sentences max.

Return ONLY the opening statement, no preamble.`

  const aiStance = await getAICompletion(baseModel, {
    systemPrompt,
    userMessage: openingPrompt,
    temperature: 0.75,
    maxTokens: 300,
  })

  const debate = await prisma.debate.create({
    data: { topic, userStance, aiStance: aiStance || (devilsAdvocate ? 'Your instinct is right — let me show you why even harder.' : 'I challenge that position.'), model },
    include: { rounds: true },
  })

  return Response.json(debate, { status: 201 })
}
