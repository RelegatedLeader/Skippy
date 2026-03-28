import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encryption'

type SerializedNote = Record<string, unknown> & { title: string; content: string; tags: string[]; linkedNoteIds: string[] }

function serialize(note: Record<string, unknown>): SerializedNote {
  return {
    ...note,
    content: decrypt(note.content as string),
    tags: JSON.parse((note.tags as string) || '[]'),
    linkedNoteIds: JSON.parse((note.linkedNoteIds as string) || '[]'),
  } as SerializedNote
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const tag = searchParams.get('tag') || ''

    const notes = await prisma.note.findMany({
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    })

    let filtered = notes.map((n) => serialize(n as Record<string, unknown>))

    if (search) {
      const lower = search.toLowerCase()
      filtered = filtered.filter(
        (n) =>
          (n.title as string).toLowerCase().includes(lower) ||
          (n.content as string).toLowerCase().includes(lower)
      )
    }

    if (tag) {
      filtered = filtered.filter((n) => (n.tags as string[]).includes(tag))
    }

    return NextResponse.json(filtered)
  } catch (err) {
    console.error('Failed to fetch notes:', err)
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { title = 'Untitled', content = '', tags = [], color = '#7c3aed', pinned = false } = body

    const note = await prisma.note.create({
      data: {
        title,
        content: encrypt(content),
        encrypted: true,
        tags: JSON.stringify(tags),
        color,
        pinned,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json(serialize(note as Record<string, unknown>), { status: 201 })
  } catch (err) {
    console.error('Failed to create note:', err)
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
  }
}
