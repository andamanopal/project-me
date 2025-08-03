'use client'

import { useState, useId, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { isValidEmail } from '@/lib/validation'

/**
 * Login page for existing users.
 * Features:
 * - Email + password login via Supabase Auth
 * - Client-side validation (email format)
 * - Dark theme with mobile-first design
 * - Skeleton loading states
 * - Conversational error messages
 * - Redirect to intended destination after login
 */
export default function LoginPage() {
  const searchParams = useSearchParams()
  const { signIn, isSigningIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Generate unique IDs for accessibility
  const emailErrorId = useId()
  const formErrorId = useId()

  const isEmailInvalid = email.length > 0 && !isValidEmail(email)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate before submission
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address')
      return
    }

    try {
      await signIn({ email, password })
      // Full page reload ensures auth state is fresh everywhere
      // Redirect to intended destination or home
      const redirectTo = searchParams.get('redirectTo') || '/'
      window.location.href = redirectTo
    } catch (err) {
      // Handle specific Supabase errors with friendly messages
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      if (
        errorMessage.includes('Invalid login credentials') ||
        errorMessage.includes('Invalid email or password')
      ) {
        setError('Invalid email or password')
      } else if (errorMessage.includes('Email not confirmed')) {
        setError('Please verify your email before logging in')
      } else {
        setError('Unable to connect. Please try again.')
      }
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">
          Welcome back
        </h1>
        <p className="text-gray-400">
          Sign in to continue to Project-Me
        </p>
      </div>

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Email Input */}
        <div className="space-y-2">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-300"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            disabled={isSigningIn}
            aria-describedby={isEmailInvalid ? emailErrorId : undefined}
            aria-invalid={isEmailInvalid}
            className="w-full px-4 py-3 bg-[#1E293B] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {isEmailInvalid && (
            <p id={emailErrorId} className="text-sm text-amber-400" role="alert">
              Please enter a valid email address
            </p>
          )}
        </div>

        {/* Password Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-300"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            disabled={isSigningIn}
            className="w-full px-4 py-3 bg-[#1E293B] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div
            id={formErrorId}
            className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
            role="alert"
          >
            <p className="text-sm text-red-400">
              {error}
            </p>
          </div>
        )}

        {/* Submit Button - Minimum 44x44px touch target */}
        <button
          type="submit"
          disabled={isSigningIn || !email || !password}
          className="w-full min-h-[44px] py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#0F172A] disabled:cursor-not-allowed"
        >
          {isSigningIn ? (
            // Skeleton loading state
            <div className="flex items-center justify-center space-x-2">
              <div className="w-4 h-4 bg-white/30 rounded-full animate-pulse" />
              <div className="w-16 h-4 bg-white/30 rounded animate-pulse" />
            </div>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      {/* Sign Up Link */}
      <p className="text-center text-gray-400">
        Don&apos;t have an account?{' '}
        <Link
          href="/signup"
          className="text-blue-400 hover:text-blue-300 transition-colors"
        >
          Create one
        </Link>
      </p>
    </div>
  )
}
