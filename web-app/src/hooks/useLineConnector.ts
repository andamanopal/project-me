'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'

// Types
interface LineConnectorStatus {
  connected: boolean
  type: 'line'
  display_name?: string | null
  picture_url?: string | null
  connected_at?: string | null
}

interface UseLineConnectorResult {
  /** LINE connection status */
  status: LineConnectorStatus | undefined
  /** Whether the status is being fetched */
  isPending: boolean
  /** Error from fetching status */
  error: Error | null
  /** Initiate LINE OAuth flow */
  connectLine: () => void
  /** Whether connection is in progress */
  isConnecting: boolean
  /** Disconnect LINE account */
  disconnectLine: (deleteData?: boolean) => Promise<void>
  /** Whether disconnection is in progress */
  isDisconnecting: boolean
  /** Refresh the connection status */
  refetch: () => void
}

// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/**
 * Hook for managing LINE connector status and OAuth flow.
 * Uses TanStack Query v5 for data fetching.
 * Integrates with Supabase auth for user identification.
 */
export function useLineConnector(): UseLineConnectorResult {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // Get user ID from Supabase auth
  const userId = user?.id || ''

  // Query: Get LINE connection status
  const {
    data: status,
    isPending,
    error,
    refetch,
  } = useQuery<LineConnectorStatus, Error>({
    queryKey: ['connector', 'line', userId],
    queryFn: async () => {
      if (!userId) {
        throw new Error('User not authenticated')
      }
      const response = await fetch(`${API_BASE_URL}/connectors/line/status`, {
        headers: {
          'X-User-Id': userId,
        },
      })
      if (!response.ok) {
        throw new Error('Failed to fetch LINE status')
      }
      return response.json()
    },
    enabled: !!userId, // Only fetch when user is authenticated
    staleTime: 30000, // Consider data fresh for 30 seconds
  })

  // Mutation: Initiate LINE OAuth
  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error('User not authenticated')
      }
      // SECURITY: Get authorization URL via authenticated POST request
      // User ID is passed in headers, not URL, to prevent impersonation
      const response = await fetch(`${API_BASE_URL}/connectors/line/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
      })
      if (!response.ok) {
        throw new Error('Failed to initiate LINE authorization')
      }
      const data = await response.json()
      // Redirect to LINE OAuth page
      window.location.href = data.authorization_url
    },
  })

  // Mutation: Disconnect LINE
  const disconnectMutation = useMutation({
    mutationFn: async (deleteData: boolean = false) => {
      if (!userId) {
        throw new Error('User not authenticated')
      }
      const url = new URL(`${API_BASE_URL}/connectors/line`)
      if (deleteData) {
        url.searchParams.set('delete_data', 'true')
      }
      const response = await fetch(url.toString(), {
        method: 'DELETE',
        headers: {
          'X-User-Id': userId,
        },
      })
      if (!response.ok) {
        throw new Error('Failed to disconnect LINE')
      }
    },
    onSuccess: () => {
      // Invalidate the status query to refresh
      queryClient.invalidateQueries({ queryKey: ['connector', 'line', userId] })
    },
  })

  const connectLine = () => {
    connectMutation.mutate()
  }

  const disconnectLine = async (deleteData: boolean = false) => {
    await disconnectMutation.mutateAsync(deleteData)
  }

  return {
    status,
    isPending,
    error: error,
    connectLine,
    isConnecting: connectMutation.isPending,
    disconnectLine,
    isDisconnecting: disconnectMutation.isPending,
    refetch,
  }
}
