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

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const note = await prisma.note.findUnique({ where: { id: params.id } })
    if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    return NextResponse.json(serialize(note as Record<string, unknown>))
  } catch (err) {
    console.error('Failed to fetch note:', err)
    return NextResponse.json({ error: 'Failed to fetch note' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { title, content, tags, color, pinned, linkedNoteIds } = body

    const data: Record<string, unknown> = { updatedAt: new Date() }
    if (title !== undefined) data.title = title
    if (content !== undefined) {
      data.content = encrypt(content)
      data.encrypted = true
    }
    if (tags !== undefined) data.tags = JSON.stringify(tags)
    if (color !== undefined) data.color = color
    if (pinned !== undefined) data.pinned = pinned
    if (linkedNoteIds !== undefined) data.linkedNoteIds = JSON.stringify(linkedNoteIds)

    const note = await prisma.note.update({ where: { id: params.id }, data })
    return NextResponse.json(serialize(note as Record<string, unknown>))
  } catch (err) {
    console.error('Failed to update note:', err)
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.note.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete note:', err)
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 })
  }
}
