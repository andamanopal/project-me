'use client'

import { useState, useId, type FormEvent } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { isValidEmail } from '@/lib/validation'

/**
 * Forgot Password page for password reset requests.
 * Features:
 * - Email input with RFC 5322 validation
 * - Dark theme with mobile-first design
 * - Skeleton loading states
 * - Conversational error messages
 * - Success state with confirmation message
 * - Security: Same message for registered/unregistered emails
 */
export default function ForgotPasswordPage() {
  const { resetPassword, isResettingPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

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
      await resetPassword({ email })
      // Always show success (security: don't reveal if email exists)
      setIsSuccess(true)
    } catch (err) {
      // Only show errors for network issues, not for invalid emails
      // This prevents email enumeration attacks
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      if (errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
        setError('Too many requests. Please wait a moment and try again.')
      } else {
        // For all other errors, still show success to prevent enumeration
        setIsSuccess(true)
      }
    }
  }

  // Success state after submission
  if (isSuccess) {
    return (
      <div className="space-y-8">
        {/* Success Header */}
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-green-500/10 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Check your email
          </h1>
          <p className="text-gray-400">
            If an account exists for <span className="text-white">{email}</span>,
            you&apos;ll receive password reset instructions shortly.
          </p>
        </div>

        {/* Additional Info */}
        <div className="bg-[#1E293B] border border-gray-600 rounded-lg p-4">
          <p className="text-sm text-gray-400">
            Didn&apos;t receive the email? Check your spam folder, or{' '}
            <button
              onClick={() => {
                setIsSuccess(false)
                setEmail('')
              }}
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              try again
            </button>
            .
          </p>
        </div>

        {/* Back to Login Link */}
        <p className="text-center">
          <Link
            href="/login"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            Back to login
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">
          Forgot your password?
        </h1>
        <p className="text-gray-400">
          No worries, we&apos;ll send you reset instructions.
        </p>
      </div>

      {/* Forgot Password Form */}
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
            disabled={isResettingPassword}
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
          disabled={isResettingPassword || !email || isEmailInvalid}
          aria-label={isResettingPassword ? 'Sending reset instructions' : 'Reset password'}
          className="w-full min-h-[44px] py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#0F172A] disabled:cursor-not-allowed"
        >
          {isResettingPassword ? (
            // Skeleton loading state
            <div className="flex items-center justify-center space-x-2">
              <div className="w-4 h-4 bg-white/30 rounded-full animate-pulse" />
              <div className="w-24 h-4 bg-white/30 rounded animate-pulse" />
            </div>
          ) : (
            'Reset password'
          )}
        </button>
      </form>

      {/* Back to Login Link */}
      <p className="text-center text-gray-400">
        <Link
          href="/login"
          className="text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to login
        </Link>
      </p>
    </div>
  )
}
