import { NextResponse } from 'next/server'
import { version } from '../../../../package.json'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    version,
    updatedAt: new Date().toISOString(),
  })
}
