'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import type { CheckInData } from '@/hooks/useCheckIns'

/** Parameters for updating a check-in */
export interface UpdateCheckInParams {
  id: string
  transcript: string
  regenerateSummary?: boolean
}

/** Return type for the update mutation hook */
export interface UseUpdateCheckInReturn {
  updateCheckIn: (params: UpdateCheckInParams) => Promise<CheckInData>
  isPending: boolean
  error: Error | null
  reset: () => void
}

/** Return type for the delete mutation hook */
export interface UseDeleteCheckInReturn {
  deleteCheckIn: (id: string) => Promise<void>
  isPending: boolean
  error: Error | null
  reset: () => void
}

/**
 * Hook for updating check-in transcript with optimistic updates.
 *
 * Features:
 * - Optimistic UI update for immediate feedback
 * - Error rollback on failure
 * - Optional summary regeneration
 *
 * @example
 * ```tsx
 * const { updateCheckIn, isPending, error } = useUpdateCheckIn()
 *
 * const handleSave = async () => {
 *   try {
 *     await updateCheckIn({ id: 'abc', transcript: 'New text', regenerateSummary: true })
 *   } catch (err) {
 *     // Handle error
 *   }
 * }
 * ```
 */
export function useUpdateCheckIn(): UseUpdateCheckInReturn {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const supabase = createClient()

  const mutation = useMutation({
    mutationFn: async (params: UpdateCheckInParams): Promise<CheckInData> => {
      if (!user) throw new Error('User not authenticated')

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session expired')

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/check-ins/${params.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          'X-User-Id': user.id,
        },
        body: JSON.stringify({
          transcript: params.transcript,
          regenerate_summary: params.regenerateSummary ?? false,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData?.error?.message || `Failed to update check-in: ${response.status}`
        )
      }

      return response.json()
    },

    onMutate: async (params) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['check-ins', user?.id] })

      // Snapshot previous value
      const previous = queryClient.getQueryData<CheckInData[]>(['check-ins', user?.id])

      // Optimistically update
      queryClient.setQueryData<CheckInData[]>(['check-ins', user?.id], (old) =>
        old?.map((c) =>
          c.id === params.id
            ? {
                ...c,
                transcript: params.transcript,
                status: params.regenerateSummary ? 'summarizing' : c.status,
                summary: params.regenerateSummary ? null : c.summary,
              }
            : c
        )
      )

      return { previous }
    },

    onError: (_err, _params, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['check-ins', user?.id], context.previous)
      }
    },

    onSettled: () => {
      // Refetch to ensure sync with server
      queryClient.invalidateQueries({ queryKey: ['check-ins', user?.id] })
    },
  })

  return {
    updateCheckIn: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  }
}

/**
 * Hook for deleting check-in with optimistic removal.
 *
 * Features:
 * - Optimistic removal for immediate feedback
 * - Error rollback on failure
 * - Also removes associated audio file on server
 *
 * @example
 * ```tsx
 * const { deleteCheckIn, isPending } = useDeleteCheckIn()
 *
 * const handleDelete = async () => {
 *   try {
 *     await deleteCheckIn('abc-123')
 *   } catch (err) {
 *     // Handle error
 *   }
 * }
 * ```
 */
export function useDeleteCheckIn(): UseDeleteCheckInReturn {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const supabase = createClient()

  const mutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!user) throw new Error('User not authenticated')

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session expired')

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/check-ins/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'X-User-Id': user.id,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData?.error?.message || `Failed to delete check-in: ${response.status}`
        )
      }
    },

    onMutate: async (id) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['check-ins', user?.id] })

      // Snapshot previous value
      const previous = queryClient.getQueryData<CheckInData[]>(['check-ins', user?.id])

      // Optimistically remove
      queryClient.setQueryData<CheckInData[]>(['check-ins', user?.id], (old) =>
        old?.filter((c) => c.id !== id)
      )

      return { previous }
    },

    onError: (_err, _id, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['check-ins', user?.id], context.previous)
      }
    },

    onSettled: () => {
      // Refetch to ensure sync with server
      queryClient.invalidateQueries({ queryKey: ['check-ins', user?.id] })
    },
  })

  return {
    deleteCheckIn: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  }
}
