'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Send, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useProfile } from '@/hooks/useProfile'
import { useTodayCheckIn } from '@/hooks/useTodayCheckIn'
import { useChatStream } from '@/hooks/useChatStream'
import { useConversation, useCreateConversation } from '@/hooks/useConversations'
import { MessageBubble, ThinkingIndicator, StreamingToolCard } from '@/components/chat/MessageBubble'
import { CheckInModal } from '@/components/checkin/CheckInModal'
import { cn } from '@/lib/utils'

/**
 * Chat-first Home page with personalized greeting.
 * Features cold blue design with animated gradient background.
 */
export default function HomePage() {
  const { profile } = useProfile()
  const { hasCheckedInToday, isPending: isCheckingStatus } = useTodayCheckIn()
  const { createConversation } = useCreateConversation()
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(undefined)
  const { conversation: currentConversation } = useConversation(currentConversationId)

  const [showCheckInModal, setShowCheckInModal] = useState(false)
  const [modalDismissed, setModalDismissed] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastMessageRef = useRef<string>('')

  const {
    isStreaming,
    streamedContent,
    streamingTools,
    error: streamError,
    sendMessage,
    clearStream,
  } = useChatStream()

  // Show check-in modal if user hasn't checked in and hasn't dismissed it
  useEffect(() => {
    if (!isCheckingStatus && !hasCheckedInToday && !modalDismissed) {
      setShowCheckInModal(true)
    }
  }, [isCheckingStatus, hasCheckedInToday, modalDismissed])

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentConversation?.messages, streamedContent, streamingTools, pendingMessage])

  // Handle stream errors with toast and rollback
  useEffect(() => {
    if (streamError) {
      toast.error(streamError)
      // Rollback: restore message to input
      if (lastMessageRef.current) {
        setMessage(lastMessageRef.current)
        lastMessageRef.current = ''
      }
      setPendingMessage(null)
    }
  }, [streamError])

  // Get display name for greeting
  const displayName = profile?.display_name || 'there'
  const greeting = getTimeBasedGreeting()

  const handleDismissModal = useCallback(() => {
    setShowCheckInModal(false)
    setModalDismissed(true)
  }, [])

  const handleSendMessage = useCallback(async () => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage || isStreaming) return

    // Create conversation if none exists
    let conversationId = currentConversationId
    if (!conversationId) {
      try {
        const newConv = await createConversation()
        conversationId = newConv.id
        setCurrentConversationId(conversationId)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create conversation'
        toast.error(errorMsg)
        console.error('[Chat] Failed to create conversation:', err)
        return
      }
    }

    // Save message for rollback, then show optimistic UI
    lastMessageRef.current = trimmedMessage
    setPendingMessage(trimmedMessage)
    setMessage('')
    clearStream()

    try {
      await sendMessage(trimmedMessage, conversationId)
      // Success - clear rollback ref
      lastMessageRef.current = ''
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send message'
      toast.error(errorMsg)
      console.error('[Chat] Failed to send message:', err)
      // Rollback: restore message to input
      setMessage(lastMessageRef.current)
      lastMessageRef.current = ''
    }
    setPendingMessage(null)
  }, [message, isStreaming, currentConversationId, createConversation, sendMessage, clearStream])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }, [handleSendMessage])

  const isSending = isStreaming || !!pendingMessage
  const hasMessages = (currentConversation?.messages?.length ?? 0) > 0 || pendingMessage

  return (
    <div className="flex h-screen flex-col">
      {/* Chat messages area */}
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          // Welcome state - centered content
          <div className="flex h-full flex-col items-center justify-center px-6 py-8 animate-fade-in">
            {/* Greeting */}
            <div className="mb-8 text-center">
              <p className="mb-2 text-sm uppercase tracking-wide text-gray-500">
                {greeting}
              </p>
              <h1
                className="mb-4 bg-clip-text text-5xl font-bold text-transparent"
                style={{
                  backgroundImage: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%)',
                }}
              >
                Hey {displayName}!
              </h1>
              <p className="text-lg text-gray-400">
                What&apos;s on your mind?
              </p>
            </div>

            {/* Check-in reminder card - only show if not checked in today */}
            {!hasCheckedInToday && (
              <button
                onClick={() => setShowCheckInModal(true)}
                className="w-full max-w-md rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 p-5 text-left backdrop-blur-sm transition-all duration-200 hover:scale-[1.02] hover:border-blue-500/30 hover:from-blue-500/15 hover:to-indigo-500/15 active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
                    <Sparkles className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-white">You haven&apos;t checked in today</p>
                    <p className="mt-0.5 text-sm text-gray-400">
                      Tap here to share how you&apos;re feeling
                    </p>
                  </div>
                </div>
              </button>
            )}
          </div>
        ) : (
          // Messages view
          <div className="mx-auto max-w-3xl space-y-4 p-6 pb-32">
            {/* Existing messages */}
            {currentConversation?.messages?.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                toolName={msg.tool_name}
              />
            ))}

            {/* Optimistic user message */}
            {pendingMessage && (
              <MessageBubble role="user" content={pendingMessage} />
            )}

            {/* Thinking indicator */}
            {pendingMessage && !streamedContent && !streamError && streamingTools.length === 0 && (
              <ThinkingIndicator />
            )}

            {/* Streaming tool cards */}
            {streamingTools.map((tool) => (
              <StreamingToolCard
                key={tool.id}
                name={tool.name}
                status={tool.status}
                args={tool.args}
                result={tool.result}
              />
            ))}

            {/* Streaming response */}
            {streamedContent && (
              <MessageBubble
                role="assistant"
                content={streamedContent}
                isStreaming={isStreaming}
              />
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message input - fixed at bottom */}
      <div className="sticky bottom-0 left-0 right-0 p-4 pb-6">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'linear-gradient(to top, rgba(10, 10, 10, 1) 0%, rgba(10, 10, 10, 0.9) 60%, transparent 100%)',
          }}
        />
        <div className="relative mx-auto max-w-2xl">
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-[#141414]/80 p-2 backdrop-blur-xl">
            <textarea
              ref={inputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message your AI..."
              disabled={isSending}
              rows={1}
              className="max-h-[120px] min-h-[44px] flex-1 resize-none bg-transparent px-4 py-3 text-white placeholder-gray-500 focus:outline-none disabled:opacity-50"
              aria-label="Message input"
            />
            <button
              onClick={handleSendMessage}
              disabled={!message.trim() || isSending}
              className={cn(
                'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-all duration-200 disabled:opacity-30',
                message.trim() && !isSending
                  ? 'bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500'
                  : 'bg-white/5'
              )}
              aria-label="Send message"
            >
              {isSending ? (
                <svg className="h-5 w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <Send className="h-5 w-5 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Check-in modal */}
      <CheckInModal
        isOpen={showCheckInModal}
        onDismiss={handleDismissModal}
        userName={profile?.display_name ?? undefined}
      />
    </div>
  )
}

/**
 * Returns a time-appropriate greeting.
 */
function getTimeBasedGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
