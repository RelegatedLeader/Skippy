import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const debate = await prisma.debate.findUnique({
    where: { id: params.id },
    include: { rounds: { orderBy: { roundNumber: 'asc' } } },
  })
  if (!debate) return new Response('Not found', { status: 404 })
  return Response.json(debate)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.debate.delete({ where: { id: params.id } })
  return new Response(null, { status: 204 })
}
