import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase-middleware'

/**
 * Auth routes - redirect to dashboard if already authenticated
 */
const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password']

/**
 * Public routes - no auth check needed
 */
const PUBLIC_ROUTES = ['/line/callback']

/**
 * Middleware handles:
 * 1. Session refresh on every request
 * 2. Redirect authenticated users away from auth pages
 * 3. Redirect unauthenticated users to login for protected pages
 */
export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  // Public routes - no protection needed
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return response
  }

  // Auth routes - redirect to home if already logged in
  if (AUTH_ROUTES.some(route => pathname === route)) {
    if (user) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return response
  }

  // Protected routes - redirect to login if not authenticated
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    // Preserve the intended destination for post-login redirect
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - Public assets (images, fonts, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2)$).*)',
  ],
}
