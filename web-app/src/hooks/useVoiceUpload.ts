'use client'

import { useState, useCallback, useRef } from 'react'
import * as tus from 'tus-js-client'
import { createClient } from '@/lib/supabase'

/** Upload state for tracking progress */
export type UploadState = 'idle' | 'uploading' | 'creating-record' | 'triggering-transcription' | 'success' | 'error'

/** Return type for the useVoiceUpload hook */
export interface UseVoiceUploadReturn {
  /** Upload a voice recording blob */
  uploadRecording: (blob: Blob, durationSeconds?: number) => Promise<string>
  /** Current upload progress (0-100) */
  uploadProgress: number
  /** Current upload state */
  uploadState: UploadState
  /** Whether upload is in progress */
  isUploading: boolean
  /** Error message if upload failed */
  uploadError: string | null
  /** Reset the upload state */
  reset: () => void
  /** Abort current upload */
  abort: () => void
}

/** Map MIME type to file extension */
function getExtension(mimeType: string): string {
  const baseMime = mimeType.split(';')[0]
  const map: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/mpeg': 'mp3',
  }
  return map[baseMime] || 'webm'
}

/** Normalize MIME type for Supabase Storage (strip codec specifiers) */
function normalizeContentType(mimeType: string): string {
  // Supabase Storage doesn't accept codec specifiers like "audio/webm;codecs=opus"
  // Strip everything after semicolon
  return mimeType.split(';')[0]
}

/**
 * Hook for uploading voice recordings to Supabase Storage using TUS resumable uploads.
 *
 * Features:
 * - Resumable uploads with TUS protocol
 * - Progress tracking (0-100%)
 * - Automatic retry with exponential backoff
 * - Creates check_in record on successful upload
 *
 * @example
 * ```tsx
 * const { uploadRecording, uploadProgress, isUploading, uploadError, reset } = useVoiceUpload()
 *
 * const handleSubmit = async (blob: Blob) => {
 *   try {
 *     const checkInId = await uploadRecording(blob, 120) // 120 seconds
 *     console.log('Check-in created:', checkInId)
 *   } catch (error) {
 *     console.error('Upload failed:', error)
 *   }
 * }
 * ```
 */
export function useVoiceUpload(): UseVoiceUploadReturn {
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)

  const uploadRef = useRef<tus.Upload | null>(null)
  const abortedRef = useRef(false)

  const reset = useCallback(() => {
    setUploadProgress(0)
    setUploadState('idle')
    setUploadError(null)
    abortedRef.current = false
    if (uploadRef.current) {
      uploadRef.current.abort()
      uploadRef.current = null
    }
  }, [])

  const abort = useCallback(() => {
    abortedRef.current = true
    if (uploadRef.current) {
      uploadRef.current.abort()
      uploadRef.current = null
    }
    reset()
  }, [reset])

  const uploadRecording = useCallback(async (blob: Blob, durationSeconds?: number): Promise<string> => {
    const supabase = createClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('You must be logged in to upload recordings')
    }

    // Get session for auth token
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      throw new Error('Session expired. Please log in again.')
    }

    // Reset state
    abortedRef.current = false
    setUploadProgress(0)
    setUploadState('uploading')
    setUploadError(null)

    const fileName = `${user.id}/${crypto.randomUUID()}.${getExtension(blob.type)}`
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
    }
    const projectId = supabaseUrl.replace('https://', '').split('.')[0]
    const endpoint = `https://${projectId}.supabase.co/storage/v1/upload/resumable`

    return new Promise((resolve, reject) => {
      const upload = new tus.Upload(blob, {
        endpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000], // Exponential backoff
        chunkSize: 6 * 1024 * 1024, // 6MB chunks
        headers: {
          authorization: `Bearer ${session.access_token}`,
          'x-upsert': 'false',
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: 'voice-recordings',
          objectName: fileName,
          contentType: normalizeContentType(blob.type),
          cacheControl: '3600',
        },
        onError: (error) => {
          if (abortedRef.current) {
            return
          }
          setUploadState('error')
          setUploadError("Couldn't upload. Please try again.")
          reject(error)
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          if (abortedRef.current) return
          const percent = bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0
          setUploadProgress(percent)
        },
        onSuccess: async () => {
          if (abortedRef.current) return

          try {
            // Create check_in record
            setUploadState('creating-record')

            const { data: checkIn, error: insertError } = await supabase
              .from('check_ins')
              .insert({
                user_id: user.id,
                audio_path: fileName,
                audio_duration_seconds: durationSeconds || null,
                status: 'processing',
              })
              .select('id')
              .single()

            if (insertError) {
              throw new Error(`Failed to create check-in record: ${insertError.message}`)
            }

            // Trigger transcription in background
            setUploadState('triggering-transcription')
            try {
              const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
              const transcribeResponse = await fetch(
                `${apiUrl}/voice/transcribe/${checkIn.id}`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'X-User-Id': user.id, // For MVP development
                  },
                }
              )

              if (!transcribeResponse.ok) {
                // Log but don't fail - transcription can be retried
                console.warn('[useVoiceUpload] Failed to trigger transcription:', await transcribeResponse.text())
              }
            } catch (transcribeError) {
              // Log but don't fail - transcription can be retried manually
              console.warn('[useVoiceUpload] Error triggering transcription:', transcribeError)
            }

            setUploadState('success')
            setUploadProgress(100)
            resolve(checkIn.id)
          } catch (error) {
            setUploadState('error')
            setUploadError('Upload succeeded but failed to create record. Please try again.')
            reject(error)
          }
        },
      })

      uploadRef.current = upload

      // Check for previous uploads and resume
      upload.findPreviousUploads().then((previousUploads) => {
        if (abortedRef.current) return
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0])
        }
        upload.start()
      })
    })
  }, [])

  return {
    uploadRecording,
    uploadProgress,
    uploadState,
    isUploading: uploadState === 'uploading' || uploadState === 'creating-record',
    uploadError,
    reset,
    abort,
  }
}
