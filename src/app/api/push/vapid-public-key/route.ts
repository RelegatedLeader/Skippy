/**
 * GET /api/push/vapid-public-key
 * Returns the VAPID public key so the client can subscribe to push.
 * The public key is safe to expose.
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!key) return NextResponse.json({ error: 'Push not configured' }, { status: 503 })
  return NextResponse.json({ publicKey: key })
}
