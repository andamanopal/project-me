'use client'

import { useState, useId, type FormEvent } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { isValidEmail, isValidPassword } from '@/lib/validation'

/**
 * Registration page for new users.
 * Features:
 * - Email + password registration via Supabase Auth
 * - Client-side validation (email format, password length)
 * - Dark theme with mobile-first design
 * - Skeleton loading states
 * - Conversational error messages
 */
export default function SignupPage() {
  const { signUp, isSigningUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Generate unique IDs for accessibility
  const emailErrorId = useId()
  const passwordErrorId = useId()
  const formErrorId = useId()

  const isPasswordTooShort = password.length > 0 && !isValidPassword(password)
  const isEmailInvalid = email.length > 0 && !isValidEmail(email)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate before submission
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address')
      return
    }
    if (!isValidPassword(password)) {
      setError('Password must be at least 8 characters')
      return
    }

    try {
      await signUp({ email, password })
      // Full page reload ensures auth state is fresh everywhere
      window.location.href = '/'
    } catch (err) {
      // Handle specific Supabase errors with friendly messages
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      if (errorMessage.includes('already registered') || errorMessage.includes('User already registered')) {
        setError('An account with this email already exists')
      } else if (errorMessage.includes('Invalid email')) {
        setError('Please enter a valid email address')
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
          Create your account
        </h1>
        <p className="text-gray-400">
          Start your journey with Project-Me
        </p>
      </div>

      {/* Registration Form */}
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
            disabled={isSigningUp}
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
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-300"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            disabled={isSigningUp}
            aria-describedby={isPasswordTooShort ? passwordErrorId : undefined}
            aria-invalid={isPasswordTooShort}
            className="w-full px-4 py-3 bg-[#1E293B] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {isPasswordTooShort && (
            <p id={passwordErrorId} className="text-sm text-amber-400" role="alert">
              Password must be at least 8 characters
            </p>
          )}
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
          disabled={isSigningUp || !email || !password || password.length < 8}
          className="w-full min-h-[44px] py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#0F172A] disabled:cursor-not-allowed"
        >
          {isSigningUp ? (
            // Skeleton loading state
            <div className="flex items-center justify-center space-x-2">
              <div className="w-4 h-4 bg-white/30 rounded-full animate-pulse" />
              <div className="w-16 h-4 bg-white/30 rounded animate-pulse" />
            </div>
          ) : (
            'Create account'
          )}
        </button>
      </form>

      {/* Login Link */}
      <p className="text-center text-gray-400">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-blue-400 hover:text-blue-300 transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
