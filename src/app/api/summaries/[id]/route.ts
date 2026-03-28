import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const summary = await prisma.summary.findUnique({ where: { id: params.id } })
    if (!summary) return NextResponse.json({ error: 'Summary not found' }, { status: 404 })
    return NextResponse.json({
      ...summary,
      categories: JSON.parse(summary.categories || '[]'),
    })
  } catch (err) {
    console.error('Failed to fetch summary:', err)
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.summary.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete summary:', err)
    return NextResponse.json({ error: 'Failed to delete summary' }, { status: 500 })
  }
}
