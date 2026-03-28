import { prisma } from '@/lib/db'
import { grok, GROK_MODEL } from '@/lib/grok'
import { buildSystemPrompt } from '@/lib/memory'

export async function GET() {
  const debates = await prisma.debate.findMany({
    orderBy: { createdAt: 'desc' },
    include: { rounds: { orderBy: { roundNumber: 'asc' } } },
  })
  return Response.json(debates)
}

export async function POST(req: Request) {
  const { topic, userStance } = await req.json()
  if (!topic || !userStance) return new Response('Missing topic or userStance', { status: 400 })

  const systemPrompt = await buildSystemPrompt()

  // Generate Skippy's initial opposing stance
  const aiStanceRes = await grok.chat.completions.create({
    model: GROK_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `We are about to debate the following topic: "${topic}".
The user's stance is: "${userStance}".

Generate Skippy's opening position on this topic — the opposing or challenging viewpoint. Be specific, grounded in what you know about the user, and give 2-3 clear reasons for your position. Be direct and confident, not wishy-washy. Keep it to 3-4 sentences max.

Return ONLY the opening statement, no preamble.`,
      },
    ],
    temperature: 0.75,
    max_tokens: 300,
  })

  const aiStance = aiStanceRes.choices[0].message.content?.trim() || 'I challenge that position.'

  const debate = await prisma.debate.create({
    data: { topic, userStance, aiStance },
    include: { rounds: true },
  })

  return Response.json(debate, { status: 201 })
}
