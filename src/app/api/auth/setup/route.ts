import { NextResponse } from 'next/server'
import { generateCredentials, hashSecret, isSetup } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST() {
  try {
    // Guard: only allow setup if no credentials exist yet
    if (await isSetup()) {
      return NextResponse.json({ error: 'Already configured' }, { status: 409 })
    }

    const { username, password, accessCode } = generateCredentials()

    // Hash password and access code in parallel
    const [passwordHash, accessCodeHash] = await Promise.all([
      hashSecret(password),
      hashSecret(accessCode),
    ])

    await prisma.auth.create({
      data: { id: 'singleton', username, passwordHash, accessCodeHash },
    })

    // Return plaintext credentials ONCE — never retrievable from DB again
    return NextResponse.json({ username, password, accessCode })
  } catch (err) {
    console.error('[Auth Setup]', err)
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 })
  }
}
