import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const conversations = await prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { messages: true },
        },
      },
    })
    return NextResponse.json(conversations)
  } catch (err) {
    console.error('Failed to fetch conversations:', err)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { title = 'New Chat' } = body

    const conversation = await prisma.conversation.create({
      data: {
        title,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json(conversation, { status: 201 })
  } catch (err) {
    console.error('Failed to create conversation:', err)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}
