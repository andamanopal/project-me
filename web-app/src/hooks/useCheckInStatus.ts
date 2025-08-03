'use client'

import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

/** Check-in status from the API */
export type CheckInStatus = 'processing' | 'transcribing' | 'summarizing' | 'completed' | 'failed'

/** Emotion with context from summary */
export interface EmotionData {
  emotion: string
  context: string
}

/** Structured summary data from LLM extraction */
export interface SummaryData {
  events: string[]
  emotions: EmotionData[]
  goals: string[]
  concerns: string[]
  generated_at: string
  error?: string  // Present if summary generation failed
}

/** Response from the status API */
export interface CheckInStatusData {
  id: string
  status: CheckInStatus
  transcript: string | null
  summary: SummaryData | null
  error_message: string | null
  created_at: string
  updated_at: string
}

/** Return type for the useCheckInStatus hook */
export interface UseCheckInStatusReturn {
  /** Current check-in status data */
  data: CheckInStatusData | null
  /** Current status string */
  status: CheckInStatus | null
  /** Transcript text when completed */
  transcript: string | null
  /** Structured summary when completed */
  summary: SummaryData | null
  /** Whether summary has an error (graceful degradation) */
  hasSummaryError: boolean
  /** Error message when failed */
  errorMessage: string | null
  /** Whether the status is being fetched */
  isLoading: boolean
  /** Whether transcription is in progress (processing or transcribing) */
  isTranscribing: boolean
  /** Whether summary is being generated */
  isSummarizing: boolean
  /** Whether processing is in progress (any non-terminal state) */
  isProcessing: boolean
  /** Whether transcription completed successfully */
  isCompleted: boolean
  /** Whether transcription failed */
  isFailed: boolean
  /** Fetch error if request failed */
  fetchError: Error | null
  /** Manually refetch the status */
  refetch: () => void
}

/**
 * Hook for polling check-in transcription status.
 *
 * Uses TanStack Query to poll the status endpoint every 2 seconds
 * while the check-in is being processed or transcribed.
 *
 * Polling automatically stops when:
 * - Status becomes 'completed' or 'failed'
 * - checkInId is null/undefined
 *
 * @param checkInId - The check-in ID to poll status for (null to disable)
 *
 * @example
 * ```tsx
 * const { status, transcript, isTranscribing, isCompleted } = useCheckInStatus(checkInId)
 *
 * if (isTranscribing) {
 *   return <p>Transcribing your recording...</p>
 * }
 *
 * if (isCompleted && transcript) {
 *   return <p>{transcript}</p>
 * }
 * ```
 */
export function useCheckInStatus(checkInId: string | null): UseCheckInStatusReturn {
  const { user } = useAuth()
  const supabase = createClient()

  const {
    data,
    isPending: isLoading,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: ['checkInStatus', checkInId],
    queryFn: async (): Promise<CheckInStatusData | null> => {
      if (!checkInId || !user) return null

      // Fetch session directly from Supabase
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/voice/status/${checkInId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'X-User-Id': user.id, // For MVP development
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData?.error?.message || `Failed to fetch status: ${response.status}`
        )
      }

      return response.json()
    },
    enabled: !!checkInId && !!user,
    // Poll every 2 seconds while processing, transcribing, or summarizing
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'processing' || status === 'transcribing' || status === 'summarizing') {
        return 2000 // 2 seconds
      }
      return false // Stop polling
    },
    // Keep previous data while refetching for smoother UX
    placeholderData: (previousData) => previousData,
    // Retry on network errors
    retry: 2,
    retryDelay: 1000,
  })

  const status = data?.status ?? null
  const transcript = data?.transcript ?? null
  const summary = data?.summary ?? null
  const hasSummaryError = !!summary?.error
  const errorMessage = data?.error_message ?? null

  return {
    data: data ?? null,
    status,
    transcript,
    summary,
    hasSummaryError,
    errorMessage,
    isLoading: isLoading && !!checkInId,
    isTranscribing: status === 'processing' || status === 'transcribing',
    isSummarizing: status === 'summarizing',
    isProcessing: status === 'processing' || status === 'transcribing' || status === 'summarizing',
    isCompleted: status === 'completed',
    isFailed: status === 'failed',
    fetchError: fetchError as Error | null,
    refetch: () => refetch(),
  }
}
