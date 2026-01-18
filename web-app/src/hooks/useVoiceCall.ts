import { useState, useCallback, useRef, useEffect } from 'react'
import Daily, {
  DailyCall,
  DailyEventObjectParticipant,
  DailyEventObjectParticipantLeft,
  DailyEventObjectFatalError,
  DailyEventObjectTrack,
} from '@daily-co/daily-js'

export type VoiceCallState = 'idle' | 'connecting' | 'connected' | 'error'

interface StartCallOptions {
  roomUrl: string
  token?: string
  userName?: string
}

export interface UseVoiceCallReturn {
  callState: VoiceCallState
  error: string | null
  isMuted: boolean
  isBotConnected: boolean
  startCall: (options: StartCallOptions) => Promise<void>
  endCall: () => void
  toggleMute: () => void
}

const DEFAULT_USER_NAME = 'Me'

export function useVoiceCall(): UseVoiceCallReturn {
  const [callState, setCallState] = useState<VoiceCallState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isBotConnected, setIsBotConnected] = useState(false)

  const callObjectRef = useRef<DailyCall | null>(null)
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())

  const cleanupAudioElements = useCallback(() => {
    audioElementsRef.current.forEach((audio) => {
      audio.srcObject = null
      audio.remove()
    })
    audioElementsRef.current.clear()
  }, [])

  const cleanup = useCallback(async () => {
    cleanupAudioElements()
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
  }, [cleanupAudioElements])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

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

  const handleTrackStarted = useCallback((event: DailyEventObjectTrack | undefined) => {
    if (!event?.track || event.track.kind !== 'audio' || event.participant?.local) return

    const participantId = event.participant?.session_id
    if (!participantId) return

    // Avoid duplicate audio elements
    if (audioElementsRef.current.has(participantId)) return

    const audio = document.createElement('audio')
    audio.srcObject = new MediaStream([event.track])
    audio.autoplay = true
    audio.setAttribute('playsinline', 'true')
    audioElementsRef.current.set(participantId, audio)
    audio.play().catch(console.error)
  }, [])

  const handleTrackStopped = useCallback((event: DailyEventObjectTrack | undefined) => {
    if (!event?.participant?.session_id) return

    const audio = audioElementsRef.current.get(event.participant.session_id)
    if (audio) {
      audio.srcObject = null
      audio.remove()
      audioElementsRef.current.delete(event.participant.session_id)
    }
  }, [])

  const handleParticipantJoined = useCallback((event: DailyEventObjectParticipant | undefined) => {
    if (event?.participant && !event.participant.local) {
      setIsBotConnected(true)
    }
  }, [])

  const handleParticipantLeft = useCallback((event: DailyEventObjectParticipantLeft | undefined) => {
    if (event?.participant && !event.participant.local) {
      setIsBotConnected(false)
      handleTrackStopped({ participant: event.participant } as DailyEventObjectTrack)
    }
  }, [handleTrackStopped])

  const handleError = useCallback((event: DailyEventObjectFatalError | undefined) => {
    console.error('[Voice] Daily.co error:', event)
    setError(event?.errorMsg || 'Connection error')
    setCallState('error')
  }, [])

  const startCall = useCallback(async ({ roomUrl, token, userName }: StartCallOptions) => {
    if (callObjectRef.current) {
      console.warn('[Voice] Call already in progress')
      return
    }

    setError(null)
    setCallState('connecting')

    try {
      const callObject = Daily.createCallObject({
        audioSource: true,
        videoSource: false,
        subscribeToTracksAutomatically: true,
      })
      callObjectRef.current = callObject

      callObject.on('joined-meeting', () => setCallState('connected'))
      callObject.on('left-meeting', () => {
        setCallState('idle')
        setIsBotConnected(false)
      })
      callObject.on('participant-joined', handleParticipantJoined)
      callObject.on('participant-left', handleParticipantLeft)
      callObject.on('track-started', handleTrackStarted)
      callObject.on('track-stopped', handleTrackStopped)
      callObject.on('error', handleError)

      await callObject.join({
        url: roomUrl,
        userName: userName ?? DEFAULT_USER_NAME,
        ...(token && { token }),
      })

      // Trigger RunPod to join the same room
      // await triggerRunPod(roomUrl, token)

    } catch (err) {
      console.error('[Voice] Error starting call:', err)
      setError(err instanceof Error ? err.message : 'Failed to start call')
      setCallState('error')
      await cleanup()
    }
  }, [cleanup, handleParticipantJoined, handleParticipantLeft, handleTrackStarted, handleTrackStopped, handleError])

  const endCall = useCallback(async () => {
    await cleanup()
    setCallState('idle')
    setError(null)
  }, [cleanup])

  const toggleMute = useCallback(() => {
    if (!callObjectRef.current) return
    const newMuted = !isMuted
    callObjectRef.current.setLocalAudio(!newMuted)
    setIsMuted(newMuted)
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
