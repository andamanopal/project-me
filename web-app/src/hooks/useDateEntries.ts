'use client'

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

/** Source entry that contributed to the daily summary */
interface SourceEntry {
  source_type: string
  source_id: string
  timestamp: string | null
}

/** Daily summary response from the API */
export interface DailySummary {
  id: string
  summary_date: string
  summary_text: string | null
  source_entries: SourceEntry[]
  generated_at: string | null
  created_at: string
  updated_at: string
}

/** Response for a specific date */
interface DateSummaryResponse {
  date: string
  summary: DailySummary | null
  source_count: number
}

interface UseDateEntriesReturn {
  data: DateSummaryResponse | undefined
  summary: DailySummary | null
  isPending: boolean
  isError: boolean
  sourceCount: number
}

/**
 * Fetches daily summary for a specific date.
 *
 * Returns the synthesized daily summary and source entries
 * for drill-down to original content.
 */
export function useDateEntries(date: string | null): UseDateEntriesReturn {
  const { user } = useAuth()
  const supabase = createClient()

  const fetchDateSummary = async (d: string): Promise<DateSummaryResponse> => {
    if (!user) {
      return { date: d, summary: null, source_count: 0 }
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return { date: d, summary: null, source_count: 0 }
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const response = await fetch(
      `${apiUrl}/api/daily-summaries/${d}`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'X-User-Id': user.id,
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch date summary')
    }

    return response.json()
  }

  const { data, isPending, isError } = useQuery({
    queryKey: ['daily-summaries', 'date', date, user?.id],
    queryFn: () => fetchDateSummary(date!),
    enabled: !!user && !!date,
    staleTime: 30 * 1000,
  })

  return {
    data,
    summary: data?.summary ?? null,
    isPending,
    isError,
    sourceCount: data?.source_count ?? 0,
  }
}
