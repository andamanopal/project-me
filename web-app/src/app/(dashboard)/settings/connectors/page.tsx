'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { useLineConnector } from '@/hooks/useLineConnector'
import { LineImport } from '@/components/connectors/LineImport'
import { SettingsHeader } from '@/components/navigation/SettingsHeader'

// LINE brand color
const LINE_GREEN = '#06C755'

/**
 * Connectors settings page for managing external service integrations.
 * Currently supports LINE integration with OAuth flow.
 *
 * Features:
 * - Connect/disconnect LINE account
 * - Display LINE profile when connected
 * - Handle OAuth callback status from URL params
 * - Dark theme with mobile-first design
 */
export default function ConnectorsPage() {
  const searchParams = useSearchParams()
  const {
    status,
    isPending,
    error,
    connectLine,
    isConnecting,
    disconnectLine,
    isDisconnecting,
  } = useLineConnector()

  // Toast notification state
  const [toast, setToast] = useState<{
    message: string
    type: 'success' | 'error'
  } | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Disconnect dialog state
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)
  const [deleteData, setDeleteData] = useState(false)

  // Handle OAuth callback status from URL params
  useEffect(() => {
    const success = searchParams.get('success')
    const callbackError = searchParams.get('error')

    if (success === 'true') {
      setToast({
        message: 'LINE connected successfully',
        type: 'success',
      })
    } else if (callbackError) {
      const errorMessages: Record<string, string> = {
        cancelled: 'LINE connection cancelled',
        invalid_state: 'Connection failed. Please try again.',
        expired: 'Connection timed out. Please try again.',
        no_code: 'Connection failed. Please try again.',
        storage_failed: 'Unable to save connection. Please try again.',
        oauth_failed: 'Unable to connect LINE. Please try again.',
      }
      setToast({
        message: errorMessages[callbackError] || 'Connection failed. Please try again.',
        type: 'error',
      })
    }

    // Clean up URL params
    if (success || callbackError) {
      window.history.replaceState({}, '', '/settings/connectors')
    }
  }, [searchParams])

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (toast) {
      toastTimeoutRef.current = setTimeout(() => {
        setToast(null)
      }, 4000)
    }
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current)
      }
    }
  }, [toast])

  // Memoize connection state for performance
  const isConnected = useMemo(() => status?.connected ?? false, [status?.connected])

  const handleConnect = () => {
    connectLine()
  }

  const handleDisconnect = () => {
    setShowDisconnectDialog(true)
  }

  const cancelDisconnect = () => {
    setShowDisconnectDialog(false)
    setDeleteData(false)
  }

  const confirmDisconnect = async () => {
    try {
      await disconnectLine(deleteData)
      setShowDisconnectDialog(false)
      setDeleteData(false)
      setToast({
        message: deleteData
          ? 'LINE disconnected and data deleted'
          : 'LINE disconnected',
        type: 'success',
      })
    } catch {
      setToast({
        message: 'Unable to disconnect LINE. Please try again.',
        type: 'error',
      })
    }
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-3xl">
        <SettingsHeader
          title="Connectors"
          description="Connect external services to enhance your Project-Me experience"
        />

      {/* LINE Integration Section */}
      <div className="p-6 bg-[#1a1a1f]/50 border border-gray-700 rounded-lg space-y-4">
        <div className="flex items-center gap-3">
          {/* LINE Logo */}
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: LINE_GREEN }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="white"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 2C6.48 2 2 5.82 2 10.5c0 4.04 3.52 7.42 8.27 8.36.32.07.76.22.87.5.1.26.07.66.03.92l-.14.85c-.04.26-.2 1.02.89.56 1.09-.47 5.89-3.47 8.03-5.94C21.56 13.08 22 11.82 22 10.5 22 5.82 17.52 2 12 2zm-2.95 11.5H6.5c-.28 0-.5-.22-.5-.5v-4c0-.28.22-.5.5-.5s.5.22.5.5v3.5h2.05c.28 0 .5.22.5.5s-.22.5-.5.5zm1.95-.5c0 .28-.22.5-.5.5s-.5-.22-.5-.5v-4c0-.28.22-.5.5-.5s.5.22.5.5v4zm5.45.5h-2.55c-.28 0-.5-.22-.5-.5v-4c0-.28.22-.5.5-.5s.5.22.5.5v3.5h2.05c.28 0 .5.22.5.5s-.22.5-.5.5zm2.05-3.5l1.45 2.1c.16.23.1.55-.13.71-.09.06-.19.09-.29.09-.16 0-.31-.07-.41-.21l-1.12-1.62-1.12 1.62c-.1.14-.25.21-.41.21-.1 0-.2-.03-.29-.09-.23-.16-.29-.48-.13-.71l1.45-2.1-1.45-2.1c-.16-.23-.1-.55.13-.71.23-.16.55-.1.71.13l1.11 1.62 1.12-1.62c.16-.23.48-.29.71-.13.23.16.29.48.13.71l-1.45 2.1z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-medium text-white">LINE</h2>
            <p className="text-sm text-gray-400">
              Receive messages and updates on LINE
            </p>
          </div>
        </div>

        {/* Loading State */}
        {isPending && (
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-[#1a1a1f] rounded w-3/4" />
            <div className="h-12 bg-[#1a1a1f] rounded w-40" />
          </div>
        )}

        {/* Error State */}
        {error && !isPending && (
          <div
            role="alert"
            className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm"
          >
            Unable to load LINE status. Please refresh the page.
          </div>
        )}

        {/* Connected State */}
        {!isPending && !error && isConnected && status && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {status.picture_url && (
                <Image
                  src={status.picture_url}
                  alt={status.display_name || 'LINE profile'}
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-full border-2 border-gray-600"
                  unoptimized
                />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">
                    {status.display_name || 'Connected'}
                  </span>
                  <span
                    className="px-2 py-0.5 text-xs font-medium rounded-full text-white"
                    style={{ backgroundColor: LINE_GREEN }}
                  >
                    Connected
                  </span>
                </div>
                {status.connected_at && (
                  <p className="text-sm text-gray-400">
                    Connected {new Date(status.connected_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="min-h-[44px] px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-[#141414] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>

            {/* Chat History Import */}
            <div className="pt-4 mt-4 border-t border-gray-700">
              <h3 className="text-sm font-medium text-white mb-3">
                Import Chat History
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                Import your LINE chat history to help Project-Me learn your communication style.
              </p>
              <LineImport
                onToast={(message, type) => setToast({ message, type })}
              />
            </div>
          </div>
        )}

        {/* Not Connected State */}
        {!isPending && !error && !isConnected && (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">
              Connect your LINE account to receive daily check-in reminders and
              chat with your AI companion directly on LINE.
            </p>

            <button
              type="button"
              onClick={handleConnect}
              disabled={isConnecting}
              className="min-h-[44px] px-6 py-3 text-white font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#141414] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{
                backgroundColor: LINE_GREEN,
                // Darker on hover
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#05a548'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = LINE_GREEN
              }}
            >
              {/* LINE icon */}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2C6.48 2 2 5.82 2 10.5c0 4.04 3.52 7.42 8.27 8.36.32.07.76.22.87.5.1.26.07.66.03.92l-.14.85c-.04.26-.2 1.02.89.56 1.09-.47 5.89-3.47 8.03-5.94C21.56 13.08 22 11.82 22 10.5 22 5.82 17.52 2 12 2z" />
              </svg>
              {isConnecting ? 'Connecting...' : 'Connect LINE'}
            </button>
          </div>
        )}
      </div>

      {/* Future Integrations Placeholder */}
      <div className="p-6 bg-[#1a1a1f]/30 border border-gray-800 border-dashed rounded-lg">
        <p className="text-gray-500 text-center text-sm">
          More integrations coming soon
        </p>
      </div>

      {/* Disconnect Confirmation Dialog */}
      {showDisconnectDialog && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disconnect-dialog-title"
        >
          <div className="bg-[#1a1a1f] border border-gray-700 rounded-lg max-w-md w-full p-6 space-y-4">
            <h2
              id="disconnect-dialog-title"
              className="text-lg font-semibold text-white"
            >
              Disconnect LINE
            </h2>

            <p className="text-sm text-gray-300">
              Are you sure you want to disconnect your LINE account? You can
              reconnect anytime.
            </p>

            {/* Delete data checkbox */}
            <label className="flex items-start gap-3 p-3 bg-[#141414]/50 border border-gray-700 rounded-lg cursor-pointer hover:border-gray-600 transition-colors">
              <input
                type="checkbox"
                checked={deleteData}
                onChange={(e) => setDeleteData(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-600 bg-[#141414] text-red-500 focus:ring-red-500 focus:ring-offset-[#1E293B]"
              />
              <div>
                <span className="text-sm font-medium text-white">
                  Also delete imported chat history
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  This will permanently remove all LINE messages you&apos;ve imported.
                  This action cannot be undone.
                </p>
              </div>
            </label>

            {/* Dialog buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={cancelDisconnect}
                disabled={isDisconnecting}
                className="flex-1 min-h-[44px] px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-[#1E293B] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDisconnect}
                disabled={isDisconnecting}
                className={`flex-1 min-h-[44px] px-4 py-2.5 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1E293B] disabled:opacity-50 ${
                  deleteData
                    ? 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500'
                    : 'bg-gray-600 hover:bg-gray-500 text-white focus:ring-gray-400'
                }`}
              >
                {isDisconnecting
                  ? 'Disconnecting...'
                  : deleteData
                    ? 'Disconnect & Delete'
                    : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 font-medium rounded-lg shadow-lg z-50 ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
      </div>
    </div>
  )
}
