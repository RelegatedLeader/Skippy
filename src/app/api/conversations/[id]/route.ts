import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    return NextResponse.json(conversation)
  } catch (err) {
    console.error('Failed to fetch conversation:', err)
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { title } = body

    const conversation = await prisma.conversation.update({
      where: { id: params.id },
      data: { title },
    })

    return NextResponse.json(conversation)
  } catch (err) {
    console.error('Failed to update conversation:', err)
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.conversation.delete({
      where: { id: params.id },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete conversation:', err)
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
  }
}
