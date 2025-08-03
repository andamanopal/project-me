'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'

interface MessageBubbleProps {
  /** Message role - follows LangGraph message types */
  role: 'user' | 'assistant' | 'system' | 'tool'
  /** Message content */
  content: string
  /** Tool name for tool messages */
  toolName?: string
  /** Whether this message is currently streaming */
  isStreaming?: boolean
  /** Error state for this message */
  error?: string | null
  /** Retry callback for failed messages */
  onRetry?: () => void
}

/**
 * Message bubble component for displaying chat messages.
 *
 * Features:
 * - User messages right-aligned (blue)
 * - Assistant messages left-aligned (dark)
 * - Tool messages as collapsible gray blocks
 * - Streaming cursor animation
 * - Error state with retry option
 * - Dark theme styling
 */
export function MessageBubble({
  role,
  content,
  toolName,
  isStreaming = false,
  error,
  onRetry,
}: MessageBubbleProps) {
  const isUser = role === 'user'
  const isTool = role === 'tool'

  if (error) {
    return (
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[80%] p-3 rounded-lg bg-red-900/30 border border-red-800">
          <p className="text-red-300 text-sm">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    )
  }

  // Tool messages get special collapsible treatment
  if (isTool) {
    return <ToolMessageBubble content={content} toolName={toolName} />
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] p-3 rounded-lg ${
          isUser
            ? 'bg-[#3B82F6] text-white'
            : 'bg-[#1a1a1f] text-gray-100'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">
          {content}
          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-0.5 bg-current animate-pulse" />
          )}
        </p>
      </div>
    </div>
  )
}

/**
 * Collapsible tool message bubble.
 * Shows tool name as header, content collapsed by default.
 */
function ToolMessageBubble({
  content,
  toolName,
}: {
  content: string
  toolName?: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Try to format JSON content for better readability
  let formattedContent = content
  try {
    const parsed = JSON.parse(content)
    formattedContent = JSON.stringify(parsed, null, 2)
  } catch {
    // Not JSON, use as-is
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-lg border border-gray-700 bg-[#2a2a2f] overflow-hidden">
        {/* Header - always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-700/30 transition-colors"
        >
          <Wrench className="h-4 w-4 text-gray-500 flex-shrink-0" />
          <span className="text-sm text-gray-400 flex-1 truncate">
            {toolName || 'Tool Result'}
          </span>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0" />
          )}
        </button>

        {/* Content - collapsible */}
        {isExpanded && (
          <div className="px-3 pb-3 border-t border-gray-700">
            <pre className="mt-2 text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap break-words">
              {formattedContent}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Thinking indicator shown while AI is generating initial response.
 */
export function ThinkingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] p-3 rounded-lg bg-[#1a1a1f] text-gray-400">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-sm">Thinking...</span>
        </div>
      </div>
    </div>
  )
}

/** Props for StreamingToolCard */
interface StreamingToolCardProps {
  name: string
  status: 'calling' | 'complete'
  args?: Record<string, unknown>
  result?: string
}

/**
 * Card for displaying tool execution during streaming.
 * Shows a spinner while calling, result when complete.
 */
export function StreamingToolCard({ name, status, args, result }: StreamingToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isCalling = status === 'calling'

  // Format result as JSON if possible
  let formattedResult = result || ''
  if (result) {
    try {
      const parsed = JSON.parse(result)
      formattedResult = JSON.stringify(parsed, null, 2)
    } catch {
      // Not JSON, use as-is
    }
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-lg border border-gray-700 bg-[#2a2a2f] overflow-hidden">
        {/* Header */}
        <button
          onClick={() => !isCalling && setIsExpanded(!isExpanded)}
          className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
            isCalling ? 'cursor-default' : 'hover:bg-gray-700/30'
          }`}
          disabled={isCalling}
        >
          {isCalling ? (
            <svg className="h-4 w-4 text-blue-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <Wrench className="h-4 w-4 text-gray-500 flex-shrink-0" />
          )}
          <span className={`text-sm flex-1 truncate ${isCalling ? 'text-blue-400' : 'text-gray-400'}`}>
            {name}{isCalling ? '...' : ''}
          </span>
          {!isCalling && (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0" />
            )
          )}
        </button>

        {/* Expanded content */}
        {isExpanded && !isCalling && (
          <div className="px-3 pb-3 border-t border-gray-700">
            <pre className="mt-2 text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap break-words">
              {formattedResult}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
