'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

/**
 * Simple auth header component for MVP.
 * Shows login/signup links when logged out, logout button when logged in.
 * Positioned at top of page with minimal intrusion.
 */
export function AuthHeader() {
  const router = useRouter()
  const { user, isPending, signOut, isSigningOut } = useAuth()
  const [logoutError, setLogoutError] = useState<string | null>(null)

  const handleLogout = async () => {
    setLogoutError(null)
    try {
      await signOut()
      router.push('/login')
    } catch (error) {
      // Show user-friendly error message
      setLogoutError('Unable to sign out. Please try again.')
    }
  }

  // Show skeleton while loading auth state
  if (isPending) {
    return (
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0F172A]/80 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="text-white font-semibold">Project-Me</div>
          <div className="w-20 h-8 bg-gray-700/50 rounded animate-pulse" />
        </div>
      </header>
    )
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0F172A]/80 backdrop-blur-sm border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-white font-semibold hover:text-blue-400 transition-colors">
          Project-Me
        </Link>

        {user ? (
          <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm hidden sm:inline">
              {user.email}
            </span>
            {logoutError && (
              <span className="text-red-400 text-sm" role="alert">
                {logoutError}
              </span>
            )}
            <button
              onClick={handleLogout}
              disabled={isSigningOut}
              aria-label={isSigningOut ? 'Signing out' : 'Sign out'}
              className="min-h-[36px] px-4 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/50 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
            >
              {isSigningOut ? (
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-white/30 rounded-full animate-pulse" />
                  <span>Signing out...</span>
                </span>
              ) : (
                'Sign out'
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="min-h-[36px] px-4 py-1.5 text-gray-300 hover:text-white text-sm font-medium transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="min-h-[36px] px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Sign up
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
