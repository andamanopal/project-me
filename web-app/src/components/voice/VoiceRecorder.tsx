'use client'

import { useState } from 'react'
import { useVoiceRecording } from '@/hooks/useVoiceRecording'
import { useVoiceUpload } from '@/hooks/useVoiceUpload'
import { useCheckInStatus } from '@/hooks/useCheckInStatus'
import { AudioWaveform, AudioPulse } from './AudioWaveform'

interface VoiceRecorderProps {
  /** Callback when submission completes with check_in_id */
  onSubmitComplete?: (checkInId: string) => void
  /** Callback when user discards the recording */
  onDiscard?: () => void
  /** Use pulse visualization instead of waveform bars */
  usePulseVisualization?: boolean
  /** Additional className for container */
  className?: string
}

/**
 * Format duration in MM:SS format
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * Voice recording component with full recording lifecycle.
 *
 * States:
 * - IDLE: Shows prominent record button
 * - RECORDING: Shows "Listening...", timer, waveform, stop/cancel buttons
 * - PREVIEW: Shows Submit/Discard buttons with audio playback
 * - PERMISSION_DENIED: Shows guidance message
 *
 * Touch targets: 44x44px minimum per accessibility guidelines.
 * Dark theme: Uses slate-900 (#0F172A) background.
 */
export function VoiceRecorder({
  onSubmitComplete,
  onDiscard,
  usePulseVisualization = false,
  className = '',
}: VoiceRecorderProps) {
  const {
    recordingState,
    permissionState,
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
  } = useVoiceRecording()

  const {
    uploadRecording,
    uploadProgress,
    uploadState,
    isUploading,
    uploadError,
    reset: resetUpload,
  } = useVoiceUpload()

  // Track check-in ID for status polling
  const [checkInId, setCheckInId] = useState<string | null>(null)
  const {
    status: transcriptionStatus,
    transcript,
    summary,
    hasSummaryError,
    errorMessage: transcriptionError,
    isTranscribing,
    isSummarizing,
    isCompleted,
    isFailed,
  } = useCheckInStatus(checkInId)

  const handleSubmit = async () => {
    if (!audioBlob) return

    try {
      const newCheckInId = await uploadRecording(audioBlob, duration)
      setCheckInId(newCheckInId) // Start polling for transcription status
      onSubmitComplete?.(newCheckInId)
    } catch (error) {
      // Log for debugging - error state is handled by the hook for UI
      console.error('[VoiceRecorder] Upload failed:', error)
    }
  }

  const handleDiscard = () => {
    discardRecording()
    resetUpload()
    onDiscard?.()
  }

  const handleRetry = async () => {
    resetUpload()
    // Wait for state to reset, then retry upload
    await handleSubmit()
  }

  const handleStartNew = () => {
    discardRecording()
    resetUpload()
    setCheckInId(null) // Reset transcription polling
  }

  // IDLE state - Show record button
  if (recordingState === 'idle' || recordingState === 'requesting-permission') {
    return (
      <div className={`flex flex-col items-center gap-4 ${className}`}>
        <button
          onClick={startRecording}
          disabled={recordingState === 'requesting-permission'}
          className="relative flex items-center justify-center w-20 h-20 rounded-full bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors shadow-lg shadow-cyan-500/25"
          aria-label="Start voice recording"
          type="button"
        >
          {recordingState === 'requesting-permission' ? (
            <LoadingSpinner className="w-8 h-8 text-white" />
          ) : (
            <MicrophoneIcon className="w-8 h-8 text-white" />
          )}
        </button>
        <p className="text-gray-400 text-sm">
          {recordingState === 'requesting-permission'
            ? 'Requesting microphone access...'
            : 'Tap to start recording'}
        </p>
      </div>
    )
  }

  // PERMISSION_DENIED state - Show guidance
  if (recordingState === 'permission-denied' || permissionState === 'denied') {
    return (
      <div className={`flex flex-col items-center gap-4 p-6 ${className}`}>
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20">
          <MicrophoneOffIcon className="w-8 h-8 text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-red-400 font-medium mb-2">Microphone Access Denied</p>
          <p className="text-gray-400 text-sm max-w-xs">
            {error || 'Microphone access is needed to record your check-in'}
          </p>
          <p className="text-gray-500 text-xs mt-2">
            Please enable microphone access in your browser settings and refresh the page.
          </p>
        </div>
        <button
          onClick={startRecording}
          className="px-4 py-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
          type="button"
        >
          Try Again
        </button>
      </div>
    )
  }

  // RECORDING state - Show "Listening...", timer, waveform
  if (recordingState === 'recording') {
    return (
      <div className={`flex flex-col items-center gap-6 ${className}`}>
        {/* Listening indicator */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
          <span className="text-white font-medium">Listening...</span>
        </div>

        {/* Timer */}
        <div className="text-4xl font-mono text-white tabular-nums">
          {formatDuration(duration)}
        </div>

        {/* Audio visualization */}
        <div className="w-full max-w-xs h-16">
          {usePulseVisualization ? (
            <AudioPulse level={audioLevel} isRecording={true} />
          ) : (
            <AudioWaveform levels={audioLevels} isRecording={true} />
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={cancelRecording}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 active:bg-gray-800 transition-colors"
            aria-label="Cancel recording"
            type="button"
          >
            <XIcon className="w-5 h-5 text-white" />
          </button>

          <button
            onClick={stopRecording}
            className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 active:bg-red-600 transition-colors shadow-lg"
            aria-label="Stop recording"
            type="button"
          >
            <StopIcon className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Max duration hint */}
        <p className="text-gray-500 text-xs">
          Max recording: 5 minutes
        </p>
      </div>
    )
  }

  // UPLOADING state - Show progress bar
  if (recordingState === 'preview' && (uploadState === 'uploading' || uploadState === 'creating-record')) {
    return (
      <div className={`flex flex-col items-center gap-6 ${className}`}>
        {/* Uploading indicator */}
        <div className="flex items-center gap-2">
          <LoadingSpinner className="w-5 h-5 text-cyan-400" />
          <span className="text-white font-medium">
            {uploadState === 'creating-record' ? 'Saving...' : 'Uploading...'}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-xs">
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-300 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-center text-gray-400 text-sm mt-2">
            {uploadProgress}%
          </p>
        </div>

        {/* Duration reminder */}
        <div className="text-gray-500 text-sm">
          {formatDuration(duration)} recorded
        </div>
      </div>
    )
  }

  // SUCCESS state - Show transcription/summarization progress/result
  if (recordingState === 'preview' && uploadState === 'success') {
    // Transcription in progress
    if (isTranscribing) {
      return (
        <div className={`flex flex-col items-center gap-6 ${className}`}>
          {/* Transcribing indicator */}
          <div className="flex items-center gap-2">
            <LoadingSpinner className="w-5 h-5 text-cyan-400" />
            <span className="text-white font-medium">
              {transcriptionStatus === 'transcribing' ? 'Transcribing...' : 'Processing...'}
            </span>
          </div>

          {/* Pulsing icon */}
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-cyan-500/20 animate-pulse">
            <TranscriptIcon className="w-8 h-8 text-cyan-400" />
          </div>

          {/* Status message */}
          <p className="text-gray-400 text-sm text-center max-w-xs">
            Converting your voice recording to text...
          </p>
        </div>
      )
    }

    // Summarizing in progress
    if (isSummarizing) {
      return (
        <div className={`flex flex-col items-center gap-6 ${className}`}>
          {/* Summarizing indicator */}
          <div className="flex items-center gap-2">
            <LoadingSpinner className="w-5 h-5 text-cyan-400" />
            <span className="text-white font-medium">Summarizing...</span>
          </div>

          {/* Pulsing icon */}
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-cyan-500/20 animate-pulse">
            <SparklesIcon className="w-8 h-8 text-cyan-400" />
          </div>

          {/* Status message */}
          <p className="text-gray-400 text-sm text-center max-w-xs">
            Extracting key insights from your check-in...
          </p>
        </div>
      )
    }

    // Transcription failed
    if (isFailed) {
      return (
        <div className={`flex flex-col items-center gap-6 ${className}`}>
          {/* Error icon */}
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/20">
            <ExclamationIcon className="w-8 h-8 text-amber-400" />
          </div>

          {/* Error message */}
          <div className="text-center">
            <p className="text-amber-400 font-medium mb-1">Transcription issue</p>
            <p className="text-gray-400 text-sm max-w-xs">
              {transcriptionError || 'Your recording was saved, but transcription failed. It can be retried later.'}
            </p>
          </div>

          {/* Start new recording */}
          <button
            onClick={handleStartNew}
            className="px-6 py-3 rounded-full bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-white font-medium transition-colors"
            type="button"
          >
            Record Another
          </button>
        </div>
      )
    }

    // Transcription completed - show transcript and summary
    if (isCompleted && transcript) {
      return (
        <div className={`flex flex-col items-center gap-6 ${className}`}>
          {/* Success icon */}
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20">
            <CheckIcon className="w-8 h-8 text-green-400" />
          </div>

          {/* Success message */}
          <div className="text-center">
            <p className="text-white font-medium mb-1">Check-in complete!</p>
          </div>

          {/* Summary display */}
          {summary && !hasSummaryError && (
            <div className="w-full max-w-sm space-y-3">
              {/* Events */}
              {summary.events.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Events</p>
                  <ul className="text-gray-300 text-sm space-y-1">
                    {summary.events.map((event, i) => (
                      <li key={i}>• {event}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Emotions */}
              {summary.emotions.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Feelings</p>
                  <div className="flex flex-wrap gap-2">
                    {summary.emotions.map((e, i) => (
                      <span key={i} className="px-2 py-1 bg-gray-700 rounded-full text-sm text-gray-300">
                        {e.emotion}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Goals */}
              {summary.goals.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Goals</p>
                  <ul className="text-gray-300 text-sm space-y-1">
                    {summary.goals.map((goal, i) => (
                      <li key={i}>• {goal}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Concerns */}
              {summary.concerns.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Concerns</p>
                  <ul className="text-gray-300 text-sm space-y-1">
                    {summary.concerns.map((concern, i) => (
                      <li key={i}>• {concern}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Summary error fallback */}
          {hasSummaryError && (
            <div className="w-full max-w-sm bg-gray-800 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-2">Summary unavailable - you can still view your transcript</p>
              <p className="text-gray-300 text-sm line-clamp-4">{transcript}</p>
            </div>
          )}

          {/* No summary (minimal content or empty) - show transcript */}
          {!summary && (
            <div className="w-full max-w-sm bg-gray-800 rounded-lg p-4">
              <p className="text-gray-300 text-sm line-clamp-4">{transcript}</p>
            </div>
          )}

          {/* Start new recording */}
          <button
            onClick={handleStartNew}
            className="px-6 py-3 rounded-full bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-white font-medium transition-colors"
            type="button"
          >
            Record Another
          </button>
        </div>
      )
    }

    // Default success state (waiting for status or completed without transcript)
    return (
      <div className={`flex flex-col items-center gap-6 ${className}`}>
        {/* Success icon */}
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20">
          <CheckIcon className="w-8 h-8 text-green-400" />
        </div>

        {/* Success message */}
        <div className="text-center">
          <p className="text-white font-medium mb-1">Check-in submitted!</p>
          <p className="text-gray-400 text-sm">Your check-in is being processed</p>
        </div>

        {/* Start new recording */}
        <button
          onClick={handleStartNew}
          className="px-6 py-3 rounded-full bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-white font-medium transition-colors"
          type="button"
        >
          Record Another
        </button>
      </div>
    )
  }

  // ERROR state - Show retry option
  if (recordingState === 'preview' && uploadState === 'error') {
    return (
      <div className={`flex flex-col items-center gap-6 ${className}`}>
        {/* Error icon */}
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20">
          <XIcon className="w-8 h-8 text-red-400" />
        </div>

        {/* Error message */}
        <div className="text-center">
          <p className="text-red-400 font-medium mb-1">Upload failed</p>
          <p className="text-gray-400 text-sm max-w-xs">
            {uploadError || "Couldn't upload. Please try again."}
          </p>
        </div>

        {/* Retry/Discard buttons */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleDiscard}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-white font-medium transition-colors"
            type="button"
          >
            <TrashIcon className="w-5 h-5" />
            Discard
          </button>

          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-white font-medium transition-colors shadow-lg shadow-cyan-500/25"
            type="button"
          >
            <RefreshIcon className="w-5 h-5" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  // PREVIEW state - Show Submit/Discard
  if (recordingState === 'preview' && uploadState === 'idle') {
    return (
      <div className={`flex flex-col items-center gap-6 ${className}`}>
        {/* Auto-stopped message */}
        {wasAutoStopped && (
          <div className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 text-sm">
            Maximum recording length reached
          </div>
        )}

        {/* Duration */}
        <div className="text-2xl font-mono text-white tabular-nums">
          {formatDuration(duration)}
        </div>

        {/* Audio playback */}
        {audioUrl && (
          <audio
            src={audioUrl}
            controls
            className="w-full max-w-xs"
            aria-label="Recording preview"
          />
        )}

        {/* Submit/Discard buttons */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleDiscard}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-white font-medium transition-colors"
            type="button"
          >
            <TrashIcon className="w-5 h-5" />
            Discard
          </button>

          <button
            onClick={handleSubmit}
            disabled={isUploading}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium transition-colors shadow-lg shadow-cyan-500/25"
            type="button"
          >
            <CheckIcon className="w-5 h-5" />
            Submit
          </button>
        </div>
      </div>
    )
  }

  // Fallback
  return null
}

// Icon components (inline to avoid external dependencies)

function MicrophoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
      />
    </svg>
  )
}

function MicrophoneOffIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
    </svg>
  )
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  )
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  )
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

function TranscriptIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  )
}

function ExclamationIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  )
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
      />
    </svg>
  )
}
