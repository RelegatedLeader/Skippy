import { NextResponse } from 'next/server'
import { runMemorySelfReflection } from '@/lib/memory'

export const runtime     = 'nodejs'
export const maxDuration = 300

// Daily cron: 3 AM UTC
export async function GET() {
  try {
    const result = await runMemorySelfReflection('cron')
    console.log('[cron/memory-reflect] Done:', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/memory-reflect] Error:', err)
    return NextResponse.json({ error: 'Cron reflection failed' }, { status: 500 })
  }
}
