import { NextResponse } from 'next/server'
import { runMemorySelfReflection } from '@/lib/memory'

export const runtime     = 'nodejs'
export const maxDuration = 300 // up to 5 min: large prompts + many DB writes

export async function POST() {
  try {
    const result = await runMemorySelfReflection('manual')
    return NextResponse.json({ ok: true, ...result, runAt: new Date().toISOString() })
  } catch (err) {
    console.error('[POST /api/memories/reflect]', err)
    return NextResponse.json({ error: 'Reflection failed' }, { status: 500 })
  }
}
