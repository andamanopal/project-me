'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

interface CalendarData {
  year: number
  month: number
  dates: Record<string, number> // {"2025-01-15": 1} - 1 if summary exists
}

interface UseCalendarDataReturn {
  data: CalendarData | undefined
  isPending: boolean
  isError: boolean
  datesWithEntries: Set<string>
}

/**
 * Fetches calendar data for a specific month.
 *
 * Returns dates with daily summaries for displaying in the calendar view.
 * Prefetches adjacent months for smooth navigation.
 */
export function useCalendarData(year: number, month: number): UseCalendarDataReturn {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const supabase = createClient()

  const fetchCalendarData = async (y: number, m: number): Promise<CalendarData> => {
    if (!user) {
      return { year: y, month: m, dates: {} }
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return { year: y, month: m, dates: {} }
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const response = await fetch(
      `${apiUrl}/api/daily-summaries/calendar?year=${y}&month=${m}`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'X-User-Id': user.id,
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch calendar data')
    }

    return response.json()
  }

  // Prefetch adjacent months for smooth navigation
  useEffect(() => {
    if (!user) return

    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year

    queryClient.prefetchQuery({
      queryKey: ['daily-summaries', 'calendar', prevYear, prevMonth, user.id],
      queryFn: () => fetchCalendarData(prevYear, prevMonth),
      staleTime: 5 * 60 * 1000,
    })

    queryClient.prefetchQuery({
      queryKey: ['daily-summaries', 'calendar', nextYear, nextMonth, user.id],
      queryFn: () => fetchCalendarData(nextYear, nextMonth),
      staleTime: 5 * 60 * 1000,
    })
  }, [year, month, user, queryClient])

  const { data, isPending, isError } = useQuery({
    queryKey: ['daily-summaries', 'calendar', year, month, user?.id],
    queryFn: () => fetchCalendarData(year, month),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })

  const datesWithEntries = new Set<string>(
    data?.dates ? Object.keys(data.dates) : []
  )

  return {
    data,
    isPending,
    isError,
    datesWithEntries,
  }
}
