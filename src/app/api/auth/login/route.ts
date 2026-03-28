import { NextResponse } from 'next/server'
import { verifySecret, createSessionToken, getAuth } from '@/lib/auth'
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session'

export async function POST(req: Request) {
  try {
    const { username, password, accessCode } = await req.json()

    if (!username || !password || !accessCode) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    }

    const auth = await getAuth()
    if (!auth) {
      return NextResponse.json({ error: 'Not configured — visit /setup first' }, { status: 403 })
    }

    // Verify all three factors in parallel (constant time for pass/code)
    const usernameMatch = username === auth.username
    const [passOk, codeOk] = await Promise.all([
      verifySecret(password, auth.passwordHash),
      verifySecret(accessCode, auth.accessCodeHash),
    ])

    if (!usernameMatch || !passOk || !codeOk) {
      // Fixed 800ms delay on any failure — prevents brute-force timing attacks
      await new Promise(r => setTimeout(r, 800))
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const token = createSessionToken()
    const response = NextResponse.json({ ok: true })

    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    })

    return response
  } catch (err) {
    console.error('[Auth Login]', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
