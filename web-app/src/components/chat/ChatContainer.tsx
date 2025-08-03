'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { ConversationList } from './ConversationList'
import { WelcomeMessage } from './WelcomeMessage'
import { MessageInput } from './MessageInput'
import { MessageBubble, ThinkingIndicator, StreamingToolCard } from './MessageBubble'
import { useChatStream } from '@/hooks/useChatStream'

import type {
  Message,
  Conversation,
  ConversationWithMessages,
} from '@/hooks/useConversations'

interface ChatContainerProps {
  conversations: Conversation[]
  selectedConversation?: ConversationWithMessages
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  isLoadingList: boolean
  isLoadingConversation: boolean
}

/**
 * Skeleton loading state for chat messages.
 */
function ChatSkeleton() {
  return (
    <div className="flex-1 p-4 space-y-4">
      <div className="flex justify-start">
        <div className="w-2/3 h-16 bg-[#1E293B] rounded-lg animate-pulse" />
      </div>
      <div className="flex justify-end">
        <div className="w-1/2 h-12 bg-[#1E293B] rounded-lg animate-pulse" />
      </div>
      <div className="flex justify-start">
        <div className="w-3/4 h-20 bg-[#1E293B] rounded-lg animate-pulse" />
      </div>
    </div>
  )
}

/**
 * Main chat container with sidebar and message area.
 * Provides mobile-responsive layout with bottom nav on mobile.
 */
export function ChatContainer({
  conversations,
  selectedConversation,
  onSelectConversation,
  onNewConversation,
  isLoadingList,
  isLoadingConversation,
}: ChatContainerProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    isStreaming,
    streamedContent,
    streamingTools,
    error: streamError,
    sendMessage,
    clearStream,
  } = useChatStream()

  // Clear stream when conversation changes
  useEffect(() => {
    clearStream()
    setPendingMessage(null)
  }, [selectedConversation?.id, clearStream])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedConversation?.messages, streamedContent, streamingTools, pendingMessage])

  const handleSelectConversation = useCallback(
    (id: string) => {
      onSelectConversation(id)
      setSidebarOpen(false) // Close sidebar on mobile after selection
    },
    [onSelectConversation]
  )

  const handleNewConversation = useCallback(() => {
    onNewConversation()
    setSidebarOpen(false) // Close sidebar on mobile after creation
  }, [onNewConversation])

  const handleSendMessage = useCallback(
    async (message: string) => {
      if (!selectedConversation) return

      // Show optimistic UI
      setPendingMessage(message)
      clearStream()

      await sendMessage(message, selectedConversation.id)

      // Clear pending after streaming completes (message will be in conversation now)
      setPendingMessage(null)
    },
    [selectedConversation, sendMessage, clearStream]
  )

  const handleRetry = useCallback(() => {
    if (pendingMessage && selectedConversation) {
      clearStream()
      sendMessage(pendingMessage, selectedConversation.id)
    }
  }, [pendingMessage, selectedConversation, sendMessage, clearStream])

  // Determine if we're in a "sending" state (showing optimistic message + streaming)
  const isSending = isStreaming || !!pendingMessage

  return (
    <div className="flex h-full bg-[#0F172A]">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - hidden on mobile unless open */}
      <aside
        className={`
          fixed md:relative inset-y-0 left-0 z-30
          w-72 bg-[#0F172A] border-r border-gray-800
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selectedConversation?.id}
          onSelect={handleSelectConversation}
          onNewConversation={handleNewConversation}
          isPending={isLoadingList}
        />
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header with menu button on mobile */}
        <header className="flex items-center gap-3 p-4 border-b border-gray-800">
          <button
            onClick={() => setSidebarOpen(true)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-white md:hidden"
            aria-label="Open conversation list"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <h1 className="text-lg font-medium text-white truncate">
            {selectedConversation?.title || 'Chat'}
          </h1>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingConversation ? (
            <ChatSkeleton />
          ) : selectedConversation ? (
            selectedConversation.messages.length === 0 && !pendingMessage ? (
              <div className="flex items-center justify-center h-full p-4">
                <WelcomeMessage
                  message={selectedConversation.welcome_message}
                />
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {/* Existing messages from database */}
                {selectedConversation.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    role={message.role}
                    content={message.content}
                    toolName={message.tool_name}
                  />
                ))}

                {/* Optimistic user message (before it's stored in DB) */}
                {pendingMessage && (
                  <MessageBubble role="user" content={pendingMessage} />
                )}

                {/* Thinking indicator - only show if no tools and no content */}
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

                {/* Streamed content */}
                {streamedContent && (
                  <MessageBubble
                    role="assistant"
                    content={streamedContent}
                    isStreaming={isStreaming}
                  />
                )}

                {/* Error state */}
                {streamError && (
                  <MessageBubble
                    role="assistant"
                    content=""
                    error={streamError}
                    onRetry={handleRetry}
                  />
                )}

                {/* Scroll anchor */}
                <div ref={messagesEndRef} />
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p>Select a conversation or start a new one</p>
            </div>
          )}
        </div>

        {/* Message Input */}
        {selectedConversation && (
          <MessageInput
            onSendMessage={handleSendMessage}
            disabled={!selectedConversation || isLoadingConversation}
            isSending={isSending}
          />
        )}

        {/* Show disabled state when no conversation selected */}
        {!selectedConversation && (
          <div className="p-4 border-t border-gray-800">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Select a conversation to start chatting..."
                disabled
                className="flex-1 min-h-[44px] px-4 bg-[#1E293B] text-white placeholder-gray-500 rounded-lg border border-gray-700 disabled:opacity-50"
              />
              <button
                disabled
                className="min-h-[44px] min-w-[44px] bg-[#3B82F6] text-white rounded-lg disabled:opacity-50 flex items-center justify-center"
                aria-label="Send message"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
