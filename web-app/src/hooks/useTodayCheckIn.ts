'use client'

import { useMemo } from 'react'
import { useCheckIns } from '@/hooks/useCheckIns'

/**
 * Hook to check if the user has completed a check-in today.
 *
 * Returns:
 * - hasCheckedInToday: Whether user has a completed check-in today
 * - todayCheckIn: The check-in data if exists
 * - isPending: Loading state
 */
export function useTodayCheckIn() {
  // Get today's date in YYYY-MM-DD format (local timezone)
  const today = useMemo(() => {
    const now = new Date()
    return now.toISOString().split('T')[0]
  }, [])

  const { checkIns, isPending, error, refetch } = useCheckIns({
    date: today,
    limit: 1
  })

  // Check if any check-in today is completed
  const todayCheckIn = checkIns.find(c => c.status === 'completed') ?? checkIns[0] ?? null
  const hasCheckedInToday = checkIns.some(c => c.status === 'completed')
  const isProcessingToday = checkIns.some(c =>
    ['processing', 'transcribing', 'summarizing'].includes(c.status)
  )

  return {
    hasCheckedInToday,
    isProcessingToday,
    todayCheckIn,
    isPending,
    error,
    refetch,
  }
}
