import { renderHook, act, waitFor } from '@testing-library/react'
import { useVoiceUpload } from '@/hooks/useVoiceUpload'

// Mock Supabase client
const mockUser = { id: 'user-123' }
const mockSession = { access_token: 'mock-token' }

const mockInsert = jest.fn().mockReturnValue({
  select: jest.fn().mockReturnValue({
    single: jest.fn().mockResolvedValue({ data: { id: 'check-in-123' }, error: null }),
  }),
})

const mockSupabaseClient = {
  auth: {
    getUser: jest.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    getSession: jest.fn().mockResolvedValue({ data: { session: mockSession }, error: null }),
  },
  from: jest.fn().mockReturnValue({
    insert: mockInsert,
  }),
}

jest.mock('@/lib/supabase', () => ({
  createClient: () => mockSupabaseClient,
}))

// Mock tus-js-client with immediate start
type TusOptions = {
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void
  onSuccess?: () => void
  onError?: (error: Error) => void
}

let capturedOptions: TusOptions | null = null

const mockTusUpload = {
  start: jest.fn(),
  abort: jest.fn(),
  findPreviousUploads: jest.fn().mockResolvedValue([]),
  resumeFromPreviousUpload: jest.fn(),
}

jest.mock('tus-js-client', () => ({
  Upload: jest.fn().mockImplementation((_blob: Blob, options: TusOptions) => {
    capturedOptions = options
    return mockTusUpload
  }),
}))

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co'

describe('useVoiceUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    capturedOptions = null
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockSupabaseClient.auth.getSession.mockResolvedValue({ data: { session: mockSession }, error: null })
    mockInsert.mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: 'check-in-123' }, error: null }),
      }),
    })
  })

  describe('Initial State', () => {
    it('starts with idle state', () => {
      const { result } = renderHook(() => useVoiceUpload())

      expect(result.current.uploadState).toBe('idle')
      expect(result.current.uploadProgress).toBe(0)
      expect(result.current.isUploading).toBe(false)
      expect(result.current.uploadError).toBeNull()
    })
  })

  describe('AC1: Submit Recording to Storage', () => {
    it('uploads audio file and creates check_in record', async () => {
      const { result } = renderHook(() => useVoiceUpload())

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' })

      let uploadPromise: Promise<string>

      await act(async () => {
        uploadPromise = result.current.uploadRecording(audioBlob, 120)
        // Let the promise start
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      // Now trigger success
      await act(async () => {
        capturedOptions?.onSuccess?.()
        await uploadPromise
      })

      // Verify check_in was created
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('check_ins')
    })

    it('returns check_in_id on successful upload', async () => {
      const { result } = renderHook(() => useVoiceUpload())

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' })

      let uploadPromise: Promise<string>
      let checkInId: string | undefined

      await act(async () => {
        uploadPromise = result.current.uploadRecording(audioBlob, 120)
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      await act(async () => {
        capturedOptions?.onSuccess?.()
        checkInId = await uploadPromise
      })

      expect(checkInId).toBe('check-in-123')
      expect(result.current.uploadState).toBe('success')
    })
  })

  describe('AC2: Upload Progress Feedback', () => {
    it('tracks upload progress from 0-100%', async () => {
      const { result } = renderHook(() => useVoiceUpload())

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' })

      await act(async () => {
        result.current.uploadRecording(audioBlob)
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(result.current.uploadState).toBe('uploading')

      // Simulate progress updates
      act(() => {
        capturedOptions?.onProgress?.(50, 100)
      })

      expect(result.current.uploadProgress).toBe(50)
    })

    it('sets isUploading to true during upload', async () => {
      const { result } = renderHook(() => useVoiceUpload())

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' })

      await act(async () => {
        result.current.uploadRecording(audioBlob)
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(result.current.isUploading).toBe(true)
    })
  })

  describe('AC3: Resumable Upload Support', () => {
    it('configures TUS with retry delays', async () => {
      const { result } = renderHook(() => useVoiceUpload())
      const tus = require('tus-js-client')

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' })

      await act(async () => {
        result.current.uploadRecording(audioBlob)
      })

      // Check TUS configuration
      const tusCall = tus.Upload.mock.calls[0]
      expect(tusCall[1].retryDelays).toEqual([0, 3000, 5000, 10000, 20000])
      expect(tusCall[1].chunkSize).toBe(6 * 1024 * 1024) // 6MB
    })

    it('checks for previous uploads to resume', async () => {
      const { result } = renderHook(() => useVoiceUpload())

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' })

      await act(async () => {
        result.current.uploadRecording(audioBlob)
      })

      expect(mockTusUpload.findPreviousUploads).toHaveBeenCalled()
    })
  })

  describe('AC4: Upload Error Handling', () => {
    it('sets error state when upload fails', async () => {
      const { result } = renderHook(() => useVoiceUpload())

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' })
      let uploadPromise: Promise<string>

      await act(async () => {
        uploadPromise = result.current.uploadRecording(audioBlob)
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(result.current.uploadState).toBe('uploading')

      // Trigger error
      await act(async () => {
        capturedOptions?.onError?.(new Error('Network error'))
        try {
          await uploadPromise
        } catch {
          // Expected
        }
      })

      expect(result.current.uploadState).toBe('error')
      expect(result.current.uploadError).toBe("Couldn't upload. Please try again.")
    })

    it('provides reset function to retry', async () => {
      const { result } = renderHook(() => useVoiceUpload())

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' })
      let uploadPromise: Promise<string>

      await act(async () => {
        uploadPromise = result.current.uploadRecording(audioBlob)
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      await act(async () => {
        capturedOptions?.onError?.(new Error('Network error'))
        try {
          await uploadPromise
        } catch {
          // Expected
        }
      })

      // Reset state
      act(() => {
        result.current.reset()
      })

      expect(result.current.uploadState).toBe('idle')
      expect(result.current.uploadError).toBeNull()
      expect(result.current.uploadProgress).toBe(0)
    })
  })

  describe('AC5: Background Transcription Queue', () => {
    it('creates check_in record with processing status', async () => {
      const { result } = renderHook(() => useVoiceUpload())

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' })
      let uploadPromise: Promise<string>

      await act(async () => {
        uploadPromise = result.current.uploadRecording(audioBlob, 120)
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      await act(async () => {
        capturedOptions?.onSuccess?.()
        await uploadPromise
      })

      // Verify the insert was called with correct data
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall.status).toBe('processing')
      expect(insertCall.audio_duration_seconds).toBe(120)
      expect(insertCall.user_id).toBe('user-123')
    })
  })

  describe('Authentication', () => {
    it('throws error when user is not logged in', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })

      const { result } = renderHook(() => useVoiceUpload())

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' })

      await expect(
        act(async () => {
          await result.current.uploadRecording(audioBlob)
        })
      ).rejects.toThrow('You must be logged in to upload recordings')
    })

    it('throws error when session is expired', async () => {
      mockSupabaseClient.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null })

      const { result } = renderHook(() => useVoiceUpload())

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' })

      await expect(
        act(async () => {
          await result.current.uploadRecording(audioBlob)
        })
      ).rejects.toThrow('Session expired. Please log in again.')
    })
  })

  describe('Abort', () => {
    it('can abort upload in progress', async () => {
      const { result } = renderHook(() => useVoiceUpload())

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' })

      await act(async () => {
        result.current.uploadRecording(audioBlob)
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      expect(result.current.isUploading).toBe(true)

      act(() => {
        result.current.abort()
      })

      expect(mockTusUpload.abort).toHaveBeenCalled()
      expect(result.current.uploadState).toBe('idle')
    })
  })

  describe('File Extension', () => {
    it('uses correct extension for webm', async () => {
      const { result } = renderHook(() => useVoiceUpload())
      const tus = require('tus-js-client')

      const audioBlob = new Blob(['audio'], { type: 'audio/webm' })

      await act(async () => {
        result.current.uploadRecording(audioBlob)
      })

      const metadata = tus.Upload.mock.calls[0][1].metadata
      expect(metadata.objectName).toMatch(/\.webm$/)
    })

    it('uses correct extension for mp4', async () => {
      const { result } = renderHook(() => useVoiceUpload())
      const tus = require('tus-js-client')
      tus.Upload.mockClear()

      const audioBlob = new Blob(['audio'], { type: 'audio/mp4' })

      await act(async () => {
        result.current.uploadRecording(audioBlob)
      })

      const metadata = tus.Upload.mock.calls[0][1].metadata
      expect(metadata.objectName).toMatch(/\.m4a$/)
    })
  })
})
