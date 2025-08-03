'use client'

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import type { CheckInStatus, SummaryData } from '@/hooks/useCheckInStatus'

/** Check-in data returned from the list API */
export interface CheckInData {
  id: string
  user_id: string
  status: CheckInStatus
  transcript: string | null
  summary: SummaryData | null
  audio_url: string | null
  created_at: string
  updated_at: string
}

/** Options for the useCheckIns hook */
export interface UseCheckInsOptions {
  /** Filter by specific date (YYYY-MM-DD) */
  date?: string
  /** Maximum number of check-ins to return */
  limit?: number
  /** Offset for pagination */
  offset?: number
}

/** Return type for the useCheckIns hook */
export interface UseCheckInsReturn {
  /** List of check-ins */
  checkIns: CheckInData[]
  /** Whether the data is being fetched */
  isPending: boolean
  /** Whether any check-in is processing (enables polling) */
  hasProcessing: boolean
  /** Fetch error if request failed */
  error: Error | null
  /** Manually refetch the data */
  refetch: () => void
}

/**
 * Hook for fetching user's check-ins with optional date filtering.
 *
 * Features:
 * - Automatic polling when check-ins are processing
 * - Date filtering for Journey calendar
 * - Pagination support
 * - Auth integration via Supabase session
 *
 * @param options - Filter and pagination options
 *
 * @example
 * ```tsx
 * // Get recent check-ins for home page
 * const { checkIns, isPending } = useCheckIns({ limit: 5 })
 *
 * // Get check-ins for a specific date
 * const { checkIns } = useCheckIns({ date: '2025-12-31' })
 * ```
 */
export function useCheckIns(options: UseCheckInsOptions = {}): UseCheckInsReturn {
  const { user } = useAuth()
  const supabase = createClient()
  const { date, limit = 20, offset = 0 } = options

  const {
    data,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['check-ins', user?.id, date, limit, offset],
    queryFn: async (): Promise<CheckInData[]> => {
      if (!user) return []

      // Fetch session directly from Supabase
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return []

      // Build query params
      const params = new URLSearchParams()
      if (date) params.set('date', date)
      params.set('limit', limit.toString())
      params.set('offset', offset.toString())

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/check-ins?${params}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'X-User-Id': user.id,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData?.error?.message || `Failed to fetch check-ins: ${response.status}`
        )
      }

      return response.json()
    },
    enabled: !!user,
    // Poll every 2 seconds if any check-in is processing
    refetchInterval: (query) => {
      const checkIns = query.state.data as CheckInData[] | undefined
      const hasProcessing = checkIns?.some(c =>
        ['processing', 'transcribing', 'summarizing'].includes(c.status)
      )
      return hasProcessing ? 2000 : false
    },
    // Keep previous data while refetching for smoother UX
    placeholderData: (previousData) => previousData,
    retry: 2,
    retryDelay: 1000,
  })

  const checkIns = data ?? []
  const hasProcessing = checkIns.some(c =>
    ['processing', 'transcribing', 'summarizing'].includes(c.status)
  )

  return {
    checkIns,
    isPending: isPending && !!user,
    hasProcessing,
    error: error as Error | null,
    refetch: () => refetch(),
  }
}
