import { prisma } from '@/lib/db'
import { buildSystemPrompt, extractMemoriesFromDebate } from '@/lib/memory'
import { getAICompletion, type AIModel } from '@/lib/ai'
import { NextRequest } from 'next/server'

// POST /api/debates/[id]/conclude — end the debate, generate summary, optionally save as note
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { saveAsNote, concededBy } = await req.json()
  // concededBy: "user" | "ai" | undefined (natural end)

  const debate = await prisma.debate.findUnique({
    where: { id: params.id },
    include: { rounds: { orderBy: { roundNumber: 'asc' } } },
  })
  if (!debate) return new Response('Not found', { status: 404 })

  const systemPrompt = await buildSystemPrompt()
  const model = (debate.model as AIModel) || 'grok'

  // Determine winner from final scores
  const lastRound = debate.rounds[debate.rounds.length - 1]
  let winner: 'user' | 'ai' | 'draw' = 'draw'
  if (concededBy === 'user') winner = 'ai'
  else if (concededBy === 'ai') winner = 'user'
  else if (lastRound) {
    const diff = lastRound.aiScore - lastRound.userScore
    if (diff > 10) winner = 'ai'
    else if (diff < -10) winner = 'user'
    else winner = 'draw'
  }

  // Build history for summary
  const historyLines = debate.rounds.map((r) =>
    `Round ${r.roundNumber}:\nUser: "${r.userArgument}"\nSkippy: "${r.aiRebuttal}"\nScores → User ${r.userScore}% / Skippy ${r.aiScore}%`
  ).join('\n\n')

  const conclusion = await getAICompletion(model, {
    systemPrompt,
    userMessage: `Write a concise, objective summary of this debate. Be intellectually honest — acknowledge strong points from both sides. End with a clear takeaway or actionable recommendation for the user.

TOPIC: ${debate.topic}
USER'S POSITION: ${debate.userStance}
SKIPPY'S POSITION: ${debate.aiStance}
${concededBy ? `\n${concededBy === 'user' ? 'User conceded.' : 'Skippy conceded.'}` : ''}
WINNER: ${winner === 'draw' ? 'Draw' : winner === 'user' ? 'User' : 'Skippy'}

${historyLines}

Write the summary in 3-4 sentences. Include: what was debated, the key turning points, who prevailed and why, and a concrete next step for the user.`,
    temperature: 0.6,
    maxTokens: 400,
  }) || 'Debate concluded.'

  // Update debate
  await prisma.debate.update({
    where: { id: debate.id },
    data: { status: 'concluded', winner, conclusion, updatedAt: new Date() },
  })

  // Save as note if requested
  let noteId: string | undefined
  if (saveAsNote) {
    const winnerLabel = winner === 'draw' ? 'Draw' : winner === 'user' ? 'You won' : 'Skippy won'
    const noteContent = `<h2>Debate: ${debate.topic}</h2>
<p><strong>Your position:</strong> ${debate.userStance}</p>
<p><strong>Skippy's position:</strong> ${debate.aiStance}</p>
<hr/>
${debate.rounds.map((r) => `<h3>Round ${r.roundNumber}</h3><p><strong>Your argument:</strong> ${r.userArgument}</p><p><strong>Skippy's rebuttal:</strong> ${r.aiRebuttal}</p><p><em>Scores: You ${r.userScore}% · Skippy ${r.aiScore}%</em></p>`).join('')}
<hr/>
<h3>Conclusion — ${winnerLabel}</h3>
<p>${conclusion}</p>`

    const note = await prisma.note.create({
      data: {
        title: `Debate: ${debate.topic.slice(0, 60)}`,
        content: noteContent,
        color: '#e8b84b',
        tags: JSON.stringify(['debate', winner === 'user' ? 'user-won' : winner === 'ai' ? 'ai-won' : 'draw', ...debate.topic.toLowerCase().split(' ').slice(0, 3)]),
      },
    })
    noteId = note.id
    await prisma.debate.update({ where: { id: debate.id }, data: { noteId } })
  }

  // Extract behavioral insights from the debate into long-term memory (non-blocking)
  extractMemoriesFromDebate({
    topic: debate.topic,
    userStance: debate.userStance,
    aiStance: debate.aiStance,
    winner,
    conclusion,
    rounds: debate.rounds.map((r) => ({
      roundNumber: r.roundNumber,
      userArgument: r.userArgument,
      aiRebuttal: r.aiRebuttal,
    })),
  }, debate.id).catch(() => {})

  return Response.json({ winner, conclusion, noteId })
}
