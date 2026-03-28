import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/session'

// Paths that don't require authentication
const PUBLIC_PATHS = ['/login', '/setup', '/api/auth', '/api/version']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths through without session check
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const authenticated = token ? await verifySessionToken(token) : false

  if (!authenticated) {
    // API routes return JSON 401 — don't redirect to HTML login page
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // All other routes redirect to login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static public files
    '/((?!_next/static|_next/image|favicon.ico|img/|icons/|sw\\.js|manifest\\.json).*)',
  ],
}
