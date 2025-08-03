'use client'

import { useState, useEffect, useId, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

/**
 * Reset Password page for setting a new password.
 * User arrives here after clicking the reset link in their email.
 * Features:
 * - Password input with min 8 char validation
 * - Dark theme with mobile-first design
 * - Skeleton loading states
 * - Handles expired/invalid tokens gracefully
 * - Redirects to login on success
 */
export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { updatePassword, isUpdatingPassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isCheckingToken, setIsCheckingToken] = useState(true)

  // Generate unique IDs for accessibility
  const passwordErrorId = useId()
  const confirmErrorId = useId()
  const formErrorId = useId()

  // Password validation
  const validatePassword = (pwd: string): boolean => {
    return pwd.length >= 8
  }

  const isPasswordInvalid = password.length > 0 && !validatePassword(password)
  const isConfirmInvalid = confirmPassword.length > 0 && password !== confirmPassword

  // Check for recovery token on mount
  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient()

      // Check if there's a valid session (token was processed)
      const { data: { session }, error } = await supabase.auth.getSession()

      // Check URL params for error indicators
      const errorParam = searchParams.get('error')
      const errorDescription = searchParams.get('error_description')

      if (errorParam) {
        if (errorDescription?.includes('expired')) {
          setTokenError('This reset link has expired. Please request a new one.')
        } else {
          setTokenError('This reset link is invalid. Please request a new one.')
        }
      } else if (!session) {
        // No session means token wasn't valid or already used
        setTokenError('This reset link is invalid or has already been used. Please request a new one.')
      }

      setIsCheckingToken(false)
    }

    checkSession()
  }, [searchParams])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate password
    if (!validatePassword(password)) {
      setError('Password must be at least 8 characters')
      return
    }

    // Validate confirmation matches
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    try {
      await updatePassword({ password })
      setIsSuccess(true)
      // Redirect to login after short delay
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      if (errorMessage.includes('expired') || errorMessage.includes('invalid')) {
        setTokenError('This reset link has expired. Please request a new one.')
      } else {
        setError('Unable to update password. Please try again.')
      }
    }
  }

  // Loading state while checking token
  if (isCheckingToken) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 bg-gray-700 rounded-full animate-pulse" />
          <div className="h-8 w-48 mx-auto bg-gray-700 rounded animate-pulse mb-2" />
          <div className="h-4 w-64 mx-auto bg-gray-700 rounded animate-pulse" />
        </div>
      </div>
    )
  }

  // Token error state (expired or invalid)
  if (tokenError) {
    return (
      <div className="space-y-8">
        {/* Error Header */}
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-500/10 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Link expired
          </h1>
          <p className="text-gray-400" role="alert">
            {tokenError}
          </p>
        </div>

        {/* Request New Link */}
        <div className="space-y-4">
          <Link
            href="/forgot-password"
            className="w-full min-h-[44px] py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
          >
            Request new reset link
          </Link>
          <p className="text-center">
            <Link
              href="/login"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              Back to login
            </Link>
          </p>
        </div>
      </div>
    )
  }

  // Success state
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
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Password updated
          </h1>
          <p className="text-gray-400">
            Your password has been successfully reset.
            Redirecting to login...
          </p>
        </div>

        {/* Manual Login Link */}
        <p className="text-center">
          <Link
            href="/login"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            Go to login now
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
          Set new password
        </h1>
        <p className="text-gray-400">
          Your new password must be at least 8 characters.
        </p>
      </div>

      {/* Reset Password Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* New Password Input */}
        <div className="space-y-2">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-300"
          >
            New password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            disabled={isUpdatingPassword}
            aria-describedby={isPasswordInvalid ? passwordErrorId : undefined}
            aria-invalid={isPasswordInvalid}
            className="w-full px-4 py-3 bg-[#1E293B] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {isPasswordInvalid && (
            <p id={passwordErrorId} className="text-sm text-amber-400" role="alert">
              Password must be at least 8 characters
            </p>
          )}
        </div>

        {/* Confirm Password Input */}
        <div className="space-y-2">
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-gray-300"
          >
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your password"
            required
            disabled={isUpdatingPassword}
            aria-describedby={isConfirmInvalid ? confirmErrorId : undefined}
            aria-invalid={isConfirmInvalid}
            className="w-full px-4 py-3 bg-[#1E293B] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {isConfirmInvalid && (
            <p id={confirmErrorId} className="text-sm text-amber-400" role="alert">
              Passwords do not match
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
          disabled={isUpdatingPassword || !password || !confirmPassword || isPasswordInvalid || isConfirmInvalid}
          aria-label={isUpdatingPassword ? 'Updating password' : 'Reset password'}
          className="w-full min-h-[44px] py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#0F172A] disabled:cursor-not-allowed"
        >
          {isUpdatingPassword ? (
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
