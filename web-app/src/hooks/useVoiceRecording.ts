import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * Recording state machine states
 */
export type RecordingState =
  | 'idle'
  | 'requesting-permission'
  | 'recording'
  | 'preview'
  | 'permission-denied'

/**
 * Permission state for microphone access
 */
export type PermissionState = 'prompt' | 'granted' | 'denied'

/**
 * Return type for useVoiceRecording hook
 */
export interface UseVoiceRecordingReturn {
  /** Current recording state */
  recordingState: RecordingState
  /** Microphone permission state */
  permissionState: PermissionState
  /** Whether recording is currently active */
  isRecording: boolean
  /** Recording duration in seconds */
  duration: number
  /** Audio blob after recording stops */
  audioBlob: Blob | null
  /** Audio URL for playback */
  audioUrl: string | null
  /** Current audio level (0-255) for visualization */
  audioLevel: number
  /** Audio levels array for waveform visualization */
  audioLevels: number[]
  /** Whether recording was auto-stopped due to 5-min limit */
  wasAutoStopped: boolean
  /** Error message if any */
  error: string | null
  /** Start recording */
  startRecording: () => Promise<void>
  /** Stop recording and create blob */
  stopRecording: () => void
  /** Cancel recording and discard */
  cancelRecording: () => void
  /** Discard recorded audio and reset */
  discardRecording: () => void
  /** Request microphone permission without starting recording */
  requestPermission: () => Promise<boolean>
}

/** Maximum recording duration in milliseconds (5 minutes) */
const MAX_DURATION_MS = 5 * 60 * 1000

/** Number of audio level samples to keep for waveform */
const AUDIO_LEVEL_SAMPLES = 50

/**
 * Detect supported MIME type for MediaRecorder
 * Safari/iOS prefers MP4, Chrome/Firefox prefer WebM with Opus
 */
function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return 'audio/webm'
  }

  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }

  return 'audio/webm'
}

/**
 * Voice recording hook using native Web Audio API.
 *
 * Handles microphone permission, recording lifecycle, audio visualization,
 * and automatic 5-minute limit.
 *
 * iOS Safari Note: MediaStream is requested once and shared between
 * recorder and visualizer to avoid microphone lock issues.
 */
export function useVoiceRecording(): UseVoiceRecordingReturn {
  // State
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [permissionState, setPermissionState] = useState<PermissionState>('prompt')
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const [audioLevels, setAudioLevels] = useState<number[]>(
    new Array(AUDIO_LEVEL_SAMPLES).fill(0)
  )
  const [wasAutoStopped, setWasAutoStopped] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refs for cleanup
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const autoStopTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)

  /**
   * Clean up all resources
   */
  const cleanup = useCallback(() => {
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Clear duration interval
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }

    // Clear auto-stop timeout
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current)
      autoStopTimeoutRef.current = null
    }

    // Stop and release MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null

    // Stop all tracks in MediaStream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }

    // Close AudioContext
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
    }
    audioContextRef.current = null
    analyserRef.current = null

    // Reset chunks
    chunksRef.current = []
  }, [])

  /**
   * Clean up on unmount
   */
  useEffect(() => {
    return () => {
      cleanup()
      // Revoke audio URL if exists
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [cleanup, audioUrl])

  /**
   * Update audio level visualization
   */
  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) return

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)

    // Calculate average level
    const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length
    setAudioLevel(Math.round(average))

    // Update levels array for waveform
    setAudioLevels(prev => {
      const next = [...prev.slice(1), Math.round(average)]
      return next
    })

    // Continue animation loop if recording
    if (mediaRecorderRef.current?.state === 'recording') {
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel)
    }
  }, [])

  /**
   * Request microphone permission
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      // Check if permissions API is available
      if (navigator.permissions) {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
        if (result.state === 'denied') {
          setPermissionState('denied')
          return false
        }
      }

      // Request actual access to trigger permission dialog
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })

      // Permission granted - stop the stream immediately
      stream.getTracks().forEach(track => track.stop())
      setPermissionState('granted')
      return true
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermissionState('denied')
          setError('Microphone access is needed to record your check-in')
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found. Please connect a microphone.')
        } else {
          setError(`Microphone error: ${err.message}`)
        }
      }
      return false
    }
  }, [])

  /**
   * Start recording
   */
  const startRecording = useCallback(async () => {
    // Reset state
    setError(null)
    setWasAutoStopped(false)
    setAudioBlob(null)
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }

    setRecordingState('requesting-permission')

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })

      setPermissionState('granted')
      mediaStreamRef.current = stream

      // Set up AudioContext for visualization (may fail if limit reached)
      // iOS Safari: Use the SAME stream for both recorder and analyser
      try {
        const audioContext = new AudioContext()
        audioContextRef.current = audioContext

        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyserRef.current = analyser

        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)
        // Note: Don't connect analyser to destination to avoid feedback
      } catch {
        // AudioContext failed - recording still works, just no visualization
        analyserRef.current = null
      }

      // Set up MediaRecorder
      const mimeType = getSupportedMimeType()
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        // Create blob from chunks
        const mimeType = mediaRecorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setAudioBlob(blob)

        const url = URL.createObjectURL(blob)
        setAudioUrl(url)

        setRecordingState('preview')

        // Clean up stream and audio context
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop())
          mediaStreamRef.current = null
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close()
        }
      }

      // Start recording
      mediaRecorder.start(100) // Collect data every 100ms
      setRecordingState('recording')
      startTimeRef.current = Date.now()
      setDuration(0)

      // Start duration counter
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setDuration(elapsed)
      }, 1000)

      // Start audio visualization
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel)

      // Set up 5-minute auto-stop
      autoStopTimeoutRef.current = setTimeout(() => {
        setWasAutoStopped(true)
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop()
        }
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current)
        }
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
      }, MAX_DURATION_MS)

    } catch (err) {
      cleanup()
      setRecordingState('idle')

      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermissionState('denied')
          setRecordingState('permission-denied')
          setError('Microphone access is needed to record your check-in')
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found. Please connect a microphone.')
        } else {
          setError(`Recording error: ${err.message}`)
        }
      }
    }
  }, [audioUrl, cleanup, updateAudioLevel])

  /**
   * Stop recording and create audio blob
   */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }

    // Clear timers
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current)
      autoStopTimeoutRef.current = null
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  /**
   * Cancel recording and discard audio
   */
  const cancelRecording = useCallback(() => {
    cleanup()
    setRecordingState('idle')
    setDuration(0)
    setAudioLevel(0)
    setAudioLevels(new Array(AUDIO_LEVEL_SAMPLES).fill(0))
    setAudioBlob(null)
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }
  }, [cleanup, audioUrl])

  /**
   * Discard recorded audio and return to idle
   */
  const discardRecording = useCallback(() => {
    setRecordingState('idle')
    setDuration(0)
    setAudioBlob(null)
    setWasAutoStopped(false)
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }
  }, [audioUrl])

  return {
    recordingState,
    permissionState,
    isRecording: recordingState === 'recording',
    duration,
    audioBlob,
    audioUrl,
    audioLevel,
    audioLevels,
    wasAutoStopped,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    discardRecording,
    requestPermission,
  }
}
