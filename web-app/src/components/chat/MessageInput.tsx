'use client'

import { useState, useCallback, KeyboardEvent, useRef, useEffect } from 'react'

interface MessageInputProps {
  /** Called when user sends a message */
  onSendMessage: (message: string) => void
  /** Whether sending is disabled (e.g., during streaming) */
  disabled?: boolean
  /** Whether a message is being sent/streamed */
  isSending?: boolean
  /** Placeholder text */
  placeholder?: string
}

/**
 * Message input component with send button.
 *
 * Features:
 * - Auto-resizing textarea
 * - Enter to send, Shift+Enter for newline
 * - 44x44px touch targets
 * - Disabled state during sending
 */
export function MessageInput({
  onSendMessage,
  disabled = false,
  isSending = false,
  placeholder = 'Type a message...',
}: MessageInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`
    }
  }, [message])

  const handleSend = useCallback(() => {
    const trimmedMessage = message.trim()
    if (trimmedMessage && !disabled && !isSending) {
      onSendMessage(trimmedMessage)
      setMessage('')
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }, [message, disabled, isSending, onSendMessage])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter without shift sends message
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const isDisabled = disabled || isSending
  const canSend = message.trim().length > 0 && !isDisabled

  return (
    <div className="p-4 border-t border-gray-800">
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          rows={1}
          className="flex-1 min-h-[44px] max-h-[150px] px-4 py-3 bg-[#1E293B] text-white placeholder-gray-500 rounded-lg border border-gray-700 focus:border-[#3B82F6] focus:outline-none disabled:opacity-50 resize-none"
          aria-label="Message input"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="min-h-[44px] min-w-[44px] bg-[#3B82F6] text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-opacity hover:opacity-90"
          aria-label="Send message"
        >
          {isSending ? (
            <svg
              className="w-5 h-5 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
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
          ) : (
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
          )}
        </button>
      </div>
      {isSending && (
        <p className="text-gray-400 text-xs text-center mt-2 animate-pulse">
          Thinking...
        </p>
      )}
    </div>
  )
}
