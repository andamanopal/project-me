'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/**
 * LINE OAuth callback page.
 *
 * Handles the OAuth callback from LINE:
 * 1. Extracts code and state from URL params
 * 2. Forwards to backend for token exchange
 * 3. Redirects to /settings/connectors with result
 *
 * Flow:
 * LINE OAuth -> /line/callback?code=xxx&state=yyy
 *            -> Backend /connectors/line/callback
 *            -> /settings/connectors?success=true
 */
export default function LineCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'processing' | 'error'>('processing')
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const error = searchParams.get('error')
      const errorDescription = searchParams.get('error_description')

      // Handle LINE authorization error
      if (error) {
        console.warn('LINE OAuth error:', error, errorDescription)
        router.replace('/settings/connectors?error=cancelled')
        return
      }

      // Validate required params
      if (!code) {
        setStatus('error')
        setErrorMessage('No authorization code received from LINE')
        return
      }

      if (!state) {
        setStatus('error')
        setErrorMessage('Invalid state parameter')
        return
      }

      try {
        // Forward to backend callback endpoint
        // The backend will handle token exchange and storage
        const callbackUrl = new URL(`${API_BASE_URL}/connectors/line/callback`)
        callbackUrl.searchParams.set('code', code)
        callbackUrl.searchParams.set('state', state)

        // Redirect to backend which will redirect back to frontend
        window.location.href = callbackUrl.toString()
      } catch (err) {
        console.error('Error processing LINE callback:', err)
        setStatus('error')
        setErrorMessage('Failed to process LINE authorization')
      }
    }

    processCallback()
  }, [searchParams, router])

  // Error state - show error and option to retry
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-red-400"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white">
            Connection Failed
          </h1>
          <p className="text-gray-400 text-sm max-w-xs">
            {errorMessage || 'Unable to connect LINE. Please try again.'}
          </p>
          <button
            onClick={() => router.push('/settings/connectors')}
            className="mt-4 px-6 py-3 bg-[#1E293B] hover:bg-[#2d3b4f] text-white font-medium rounded-lg transition-colors min-h-[44px]"
          >
            Back to Settings
          </button>
        </div>
      </div>
    )
  }

  // Processing state - show loading
  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        {/* LINE-colored loading spinner */}
        <div className="relative w-16 h-16 mx-auto">
          <div
            className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: '#06C755', borderTopColor: 'transparent' }}
          />
          <div
            className="absolute inset-2 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#06C755' }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="white"
            >
              <path d="M12 2C6.48 2 2 5.82 2 10.5c0 4.04 3.52 7.42 8.27 8.36.32.07.76.22.87.5.1.26.07.66.03.92l-.14.85c-.04.26-.2 1.02.89.56 1.09-.47 5.89-3.47 8.03-5.94C21.56 13.08 22 11.82 22 10.5 22 5.82 17.52 2 12 2z" />
            </svg>
          </div>
        </div>
        <h1 className="text-xl font-semibold text-white">
          Connecting LINE...
        </h1>
        <p className="text-gray-400 text-sm">
          Please wait while we complete the connection
        </p>
      </div>
    </div>
  )
}
