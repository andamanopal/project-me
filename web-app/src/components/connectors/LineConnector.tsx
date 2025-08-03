'use client'

import Image from 'next/image'
import { useLineConnector } from '@/hooks/useLineConnector'

// LINE brand color
const LINE_GREEN = '#06C755'

interface LineConnectorProps {
  /** Callback when connection status changes */
  onStatusChange?: (connected: boolean) => void
  /** Callback to show toast notification */
  onToast?: (message: string, type: 'success' | 'error') => void
}

/**
 * LINE connector component for managing LINE account integration.
 *
 * Features:
 * - Connect/disconnect LINE account via OAuth
 * - Display LINE profile when connected
 * - Loading and error states
 * - LINE brand styling
 */
export function LineConnector({ onStatusChange, onToast }: LineConnectorProps) {
  const {
    status,
    isPending,
    error,
    connectLine,
    isConnecting,
    disconnectLine,
    isDisconnecting,
  } = useLineConnector()

  const isConnected = status?.connected ?? false

  const handleConnect = () => {
    connectLine()
  }

  const handleDisconnect = async () => {
    try {
      await disconnectLine()
      onStatusChange?.(false)
      onToast?.('LINE disconnected', 'success')
    } catch {
      onToast?.('Unable to disconnect LINE. Please try again.', 'error')
    }
  }

  return (
    <div className="p-6 bg-[#1E293B]/50 border border-gray-700 rounded-lg space-y-4">
      {/* Header with LINE logo */}
      <div className="flex items-center gap-3">
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
            aria-hidden="true"
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
          <div className="h-4 bg-[#1E293B] rounded w-3/4" />
          <div className="h-12 bg-[#1E293B] rounded w-40" />
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
            className="min-h-[44px] px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-[#0F172A] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
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
            className="min-h-[44px] px-6 py-3 text-white font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0F172A] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            style={{ backgroundColor: LINE_GREEN }}
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
              aria-hidden="true"
            >
              <path d="M12 2C6.48 2 2 5.82 2 10.5c0 4.04 3.52 7.42 8.27 8.36.32.07.76.22.87.5.1.26.07.66.03.92l-.14.85c-.04.26-.2 1.02.89.56 1.09-.47 5.89-3.47 8.03-5.94C21.56 13.08 22 11.82 22 10.5 22 5.82 17.52 2 12 2z" />
            </svg>
            {isConnecting ? 'Connecting...' : 'Connect LINE'}
          </button>
        </div>
      )}
    </div>
  )
}

export default LineConnector
