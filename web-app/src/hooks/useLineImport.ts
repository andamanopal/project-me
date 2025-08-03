'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'

// Types
interface ImportStats {
  message_count: number
  oldest_message?: string | null
  newest_message?: string | null
  last_import_at?: string | null
}

interface ImportResponse {
  success: boolean
  message: string
  import_id: string
}

interface ImportStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  message_count?: number | null
  error?: string | null
  completed_at?: string | null
}

interface UseLineImportResult {
  /** Import statistics */
  stats: ImportStats | undefined
  /** Whether stats are loading */
  isPending: boolean
  /** Error from fetching stats */
  error: Error | null
  /** Upload file and start import */
  uploadFile: (file: File) => Promise<void>
  /** Whether upload is in progress */
  isUploading: boolean
  /** Current import ID for tracking */
  currentImportId: string | null
  /** Current import status */
  importStatus: ImportStatus | undefined
  /** Whether import status is being polled */
  isPolling: boolean
  /** Upload error message */
  uploadError: string | null
  /** Clear upload error */
  clearError: () => void
  /** Refresh stats */
  refetch: () => void
}

// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/**
 * Hook for managing LINE chat history import.
 * Uses TanStack Query v5 for data fetching and mutations.
 */
export function useLineImport(): UseLineImportResult {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id || ''

  const [currentImportId, setCurrentImportId] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Query: Get import statistics
  const {
    data: stats,
    isPending,
    error,
    refetch,
  } = useQuery<ImportStats, Error>({
    queryKey: ['import', 'line', 'stats', userId],
    queryFn: async () => {
      if (!userId) {
        throw new Error('User not authenticated')
      }
      const response = await fetch(`${API_BASE_URL}/api/imports/line/stats`, {
        headers: {
          'X-User-Id': userId,
        },
      })
      if (!response.ok) {
        throw new Error('Failed to fetch import stats')
      }
      return response.json()
    },
    enabled: !!userId,
    staleTime: 30000,
  })

  // Query: Poll import status
  const { data: importStatus, isPending: isPolling } = useQuery<ImportStatus, Error>({
    queryKey: ['import', 'line', 'status', currentImportId],
    queryFn: async () => {
      if (!currentImportId || !userId) {
        throw new Error('No import in progress')
      }
      const response = await fetch(
        `${API_BASE_URL}/api/imports/line/status/${currentImportId}`,
        {
          headers: {
            'X-User-Id': userId,
          },
        }
      )
      if (!response.ok) {
        throw new Error('Failed to fetch import status')
      }
      return response.json()
    },
    enabled: !!currentImportId && !!userId,
    refetchInterval: (query) => {
      const data = query.state.data
      // Stop polling when completed or failed
      if (data?.status === 'completed' || data?.status === 'failed') {
        return false
      }
      return 2000 // Poll every 2 seconds
    },
  })

  // Clear import ID and refresh stats when import completes
  if (importStatus?.status === 'completed') {
    if (currentImportId) {
      setCurrentImportId(null)
      queryClient.invalidateQueries({ queryKey: ['import', 'line', 'stats', userId] })
    }
  }

  // Mutation: Upload file
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE_URL}/api/imports/line`, {
        method: 'POST',
        headers: {
          'X-User-Id': userId,
        },
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.detail?.error?.message || 'Failed to upload file'
        throw new Error(errorMessage)
      }

      return response.json() as Promise<ImportResponse>
    },
    onSuccess: (data) => {
      setCurrentImportId(data.import_id)
      setUploadError(null)
    },
    onError: (error: Error) => {
      setUploadError(error.message)
    },
  })

  const uploadFile = useCallback(async (file: File) => {
    setUploadError(null)
    await uploadMutation.mutateAsync(file)
  }, [uploadMutation])

  const clearError = useCallback(() => {
    setUploadError(null)
  }, [])

  return {
    stats,
    isPending,
    error,
    uploadFile,
    isUploading: uploadMutation.isPending,
    currentImportId,
    importStatus,
    isPolling,
    uploadError,
    clearError,
    refetch,
  }
}
