import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const profile = await prisma.userProfile.findUnique({ where: { id: 'singleton' } })
    return NextResponse.json({ customInstructions: profile?.customInstructions || '' })
  } catch {
    return NextResponse.json({ customInstructions: '' })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { customInstructions } = body

    if (typeof customInstructions !== 'string') {
      return NextResponse.json({ error: 'customInstructions must be a string' }, { status: 400 })
    }

    // Limit to 2000 characters to prevent abuse
    const sanitized = customInstructions.slice(0, 2000).trim()

    const profile = await prisma.userProfile.upsert({
      where: { id: 'singleton' },
      update: { customInstructions: sanitized, updatedAt: new Date() },
      create: { id: 'singleton', customInstructions: sanitized, updatedAt: new Date() },
    })

    return NextResponse.json({ customInstructions: profile.customInstructions })
  } catch (err) {
    console.error('Failed to save custom instructions:', err)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
