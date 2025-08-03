'use client'

import { useDeferredValue } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

/** Daily summary search result from the API */
export interface DailySummaryResult {
  summary_date: string
  snippet: string
  content: string
}

/** Search response from the API */
interface DailySummarySearchResponse {
  query: string
  results: DailySummaryResult[]
  count: number
}

/** Return type for useMemorySearch hook */
export interface UseMemorySearchReturn {
  results: DailySummaryResult[]
  isPending: boolean
  isStale: boolean
  count: number
  error: Error | null
}

/**
 * Hook for searching daily summaries with debouncing.
 *
 * Uses useDeferredValue for automatic debouncing of search queries.
 * Minimum 2 characters required to trigger search.
 */
export function useMemorySearch(
  query: string,
  limit: number = 20
): UseMemorySearchReturn {
  const { user } = useAuth()
  const supabase = createClient()

  // Debounce query using useDeferredValue
  const deferredQuery = useDeferredValue(query.trim())
  const isStale = deferredQuery !== query.trim()

  const { data, isPending, error } = useQuery({
    queryKey: ['daily-summaries', 'search', deferredQuery, limit],
    queryFn: async (): Promise<DailySummarySearchResponse> => {
      if (!user) {
        return { query: deferredQuery, results: [], count: 0 }
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        return { query: deferredQuery, results: [], count: 0 }
      }

      const params = new URLSearchParams()
      params.set('query', deferredQuery)
      params.set('limit', limit.toString())

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/daily-summaries/search?${params}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'X-User-Id': user.id,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData?.error?.message || `Search failed: ${response.status}`
        )
      }

      return response.json()
    },
    enabled: !!user && deferredQuery.length >= 2,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
    retry: 1,
  })

  return {
    results: data?.results ?? [],
    isPending: isPending && deferredQuery.length >= 2,
    isStale,
    count: data?.count ?? 0,
    error: error as Error | null,
  }
}
