'use client'

import { useState } from 'react'
import { Mic, MicOff, Phone, PhoneOff, Loader2 } from 'lucide-react'
import { useVoiceCall } from '@/hooks/useVoiceCall'
import { cn } from '@/lib/utils'

/**
 * Voice call page for testing the RunPod voice pipeline.
 * Connects to a Daily.co room and enables voice conversation with the AI.
 */
export default function VoicePage() {
  const [roomUrl, setRoomUrl] = useState('')
  const {
    callState,
    error,
    isMuted,
    isBotConnected,
    startCall,
    endCall,
    toggleMute,
  } = useVoiceCall()

  const isIdle = callState === 'idle'
  const isConnecting = callState === 'connecting'
  const isConnected = callState === 'connected'
  const isError = callState === 'error'

  const handleStartCall = () => {
    if (roomUrl.trim()) {
      startCall(roomUrl.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isIdle && roomUrl.trim()) {
      handleStartCall()
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Voice Chat</h1>
          <p className="mt-2 text-gray-400">
            Talk with your AI assistant
          </p>
        </div>

        {/* Status Indicator */}
        <div className="flex flex-col items-center space-y-4">
          {/* Visual indicator */}
          <div
            className={cn(
              'flex h-32 w-32 items-center justify-center rounded-full transition-all duration-300',
              isIdle && 'bg-gray-800',
              isConnecting && 'bg-blue-900/50 animate-pulse',
              isConnected && !isBotConnected && 'bg-yellow-900/50',
              isConnected && isBotConnected && 'bg-green-900/50',
              isError && 'bg-red-900/50'
            )}
          >
            {isConnecting ? (
              <Loader2 className="h-12 w-12 text-blue-400 animate-spin" />
            ) : isConnected ? (
              <div className="relative">
                <Mic
                  className={cn(
                    'h-12 w-12 transition-colors',
                    isBotConnected ? 'text-green-400' : 'text-yellow-400'
                  )}
                />
                {isBotConnected && (
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-4 w-4 rounded-full bg-green-500" />
                  </span>
                )}
              </div>
            ) : isError ? (
              <PhoneOff className="h-12 w-12 text-red-400" />
            ) : (
              <Mic className="h-12 w-12 text-gray-500" />
            )}
          </div>

          {/* Status text */}
          <p
            className={cn(
              'text-sm font-medium',
              isIdle && 'text-gray-500',
              isConnecting && 'text-blue-400',
              isConnected && !isBotConnected && 'text-yellow-400',
              isConnected && isBotConnected && 'text-green-400',
              isError && 'text-red-400'
            )}
          >
            {isConnecting && 'Connecting...'}
            {isConnected && !isBotConnected && 'Waiting for AI...'}
            {isConnected && isBotConnected && 'Connected - Start talking!'}
            {isError && 'Connection failed'}
            {isIdle && 'Ready to connect'}
          </p>

          {/* Error message */}
          {error && (
            <p className="text-center text-sm text-red-400">{error}</p>
          )}
        </div>

        {/* Room URL Input (only when idle) */}
        {isIdle && (
          <div className="space-y-2">
            <label htmlFor="room-url" className="block text-sm text-gray-400">
              Daily.co Room URL
            </label>
            <input
              id="room-url"
              type="url"
              value={roomUrl}
              onChange={(e) => setRoomUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://your-domain.daily.co/room-name"
              className="w-full rounded-xl border border-white/10 bg-[#141414] px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Controls */}
        <div className="flex justify-center gap-4">
          {isIdle ? (
            <button
              onClick={handleStartCall}
              disabled={!roomUrl.trim()}
              className={cn(
                'flex min-h-[56px] min-w-[160px] items-center justify-center gap-2 rounded-full px-6 py-3 font-medium transition-all duration-200',
                roomUrl.trim()
                  ? 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-400 hover:to-green-500'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              )}
            >
              <Phone className="h-5 w-5" />
              Start Call
            </button>
          ) : (
            <>
              {/* Mute button */}
              {isConnected && (
                <button
                  onClick={toggleMute}
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-full transition-all duration-200',
                    isMuted
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'bg-gray-800 text-white hover:bg-gray-700'
                  )}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <MicOff className="h-6 w-6" />
                  ) : (
                    <Mic className="h-6 w-6" />
                  )}
                </button>
              )}

              {/* End call button */}
              <button
                onClick={endCall}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white transition-all duration-200 hover:bg-red-600"
                aria-label="End call"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </>
          )}
        </div>

        {/* Instructions */}
        {isIdle && (
          <div className="rounded-xl border border-white/5 bg-[#1a1a1f]/50 p-4">
            <h3 className="text-sm font-medium text-white">How to test</h3>
            <ol className="mt-2 space-y-1 text-sm text-gray-400">
              <li>1. Create a room at daily.co/dashboard</li>
              <li>2. Paste the room URL above</li>
              <li>3. Click Start Call</li>
              <li>4. Wait for AI to join, then speak</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
