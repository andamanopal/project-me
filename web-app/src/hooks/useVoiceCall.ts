import { useState, useCallback, useRef, useEffect } from 'react'
import Daily, {
  DailyCall,
  DailyEventObjectParticipant,
  DailyEventObjectParticipantLeft,
} from '@daily-co/daily-js'

/**
 * Voice call connection states
 */
export type VoiceCallState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'error'

/**
 * Return type for useVoiceCall hook
 */
export interface UseVoiceCallReturn {
  /** Current call state */
  callState: VoiceCallState
  /** Error message if any */
  error: string | null
  /** Whether microphone is muted */
  isMuted: boolean
  /** Whether the bot has joined the room */
  isBotConnected: boolean
  /** Start a voice call */
  startCall: (roomUrl: string, token?: string) => Promise<void>
  /** End the current call */
  endCall: () => void
  /** Toggle microphone mute */
  toggleMute: () => void
}

/**
 * Hook for managing Daily.co voice calls with RunPod pipeline.
 *
 * Handles:
 * - Daily.co call object lifecycle
 * - Room joining/leaving
 * - Microphone mute toggle
 * - Bot participant detection
 */
export function useVoiceCall(): UseVoiceCallReturn {
  const [callState, setCallState] = useState<VoiceCallState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isBotConnected, setIsBotConnected] = useState(false)

  const callObjectRef = useRef<DailyCall | null>(null)

  /**
   * Clean up Daily.co call object
   */
  const cleanup = useCallback(async () => {
    if (callObjectRef.current) {
      try {
        await callObjectRef.current.leave()
        await callObjectRef.current.destroy()
      } catch {
        // Ignore cleanup errors
      }
      callObjectRef.current = null
    }
    setIsBotConnected(false)
    setIsMuted(false)
  }, [])

  /**
   * Clean up on unmount
   */
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  /**
   * Trigger RunPod pipeline to join the room
   */
  const triggerRunPod = useCallback(async (roomUrl: string, token?: string) => {
    const response = await fetch('/api/voice/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_url: roomUrl, token }),
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to start voice pipeline')
    }

    return response.json()
  }, [])

  /**
   * Start a voice call
   */
  const startCall = useCallback(async (roomUrl: string, token?: string) => {
    setError(null)
    setCallState('connecting')

    try {
      // Create Daily.co call object
      const callObject = Daily.createCallObject({
        audioSource: true,
        videoSource: false,
      })
      callObjectRef.current = callObject

      // Set up event handlers
      callObject.on('joined-meeting', () => {
        setCallState('connected')
      })

      callObject.on('left-meeting', () => {
        setCallState('idle')
        setIsBotConnected(false)
      })

      callObject.on('participant-joined', (event: DailyEventObjectParticipant | undefined) => {
        if (event?.participant && !event.participant.local) {
          // Non-local participant joined (the bot)
          setIsBotConnected(true)
        }
      })

      callObject.on('participant-left', (event: DailyEventObjectParticipantLeft | undefined) => {
        if (event?.participant && !event.participant.local) {
          // Bot left
          setIsBotConnected(false)
        }
      })

      callObject.on('error', (event) => {
        console.error('[Voice] Daily.co error:', event)
        setError(event?.errorMsg || 'Connection error')
        setCallState('error')
      })

      // Join the room (with optional token for private rooms)
      await callObject.join({ url: roomUrl, token })

      // Trigger RunPod to join the same room
      await triggerRunPod(roomUrl, token)

    } catch (err) {
      console.error('[Voice] Error starting call:', err)
      setError(err instanceof Error ? err.message : 'Failed to start call')
      setCallState('error')
      await cleanup()
    }
  }, [triggerRunPod, cleanup])

  /**
   * End the current call
   */
  const endCall = useCallback(async () => {
    await cleanup()
    setCallState('idle')
    setError(null)
  }, [cleanup])

  /**
   * Toggle microphone mute
   */
  const toggleMute = useCallback(() => {
    if (callObjectRef.current) {
      const newMuted = !isMuted
      callObjectRef.current.setLocalAudio(!newMuted)
      setIsMuted(newMuted)
    }
  }, [isMuted])

  return {
    callState,
    error,
    isMuted,
    isBotConnected,
    startCall,
    endCall,
    toggleMute,
  }
}
