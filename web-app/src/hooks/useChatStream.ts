'use client'

import { useState, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

/** Event types from the SSE stream */
type StreamEventType = 'content' | 'tool_call' | 'tool_result' | 'done' | 'error'

/** Data for content events */
interface ContentEventData {
  type: 'content'
  content: string
}

/** Data for tool call events */
interface ToolCallEventData {
  type: 'tool_call'
  name: string
  args: Record<string, unknown>
}

/** Data for tool result events */
interface ToolResultEventData {
  type: 'tool_result'
  name: string
  result: string
}

/** Data for error events */
interface ErrorEventData {
  type: 'error'
  error: string
}

/** Data for done events */
interface DoneEventData {
  type: 'done'
}

/** Tool event displayed during streaming */
export interface StreamingToolEvent {
  id: string
  name: string
  status: 'calling' | 'complete'
  args?: Record<string, unknown>
  result?: string
}

/** Union of all event data types */
type StreamEventData = ContentEventData | ToolCallEventData | ToolResultEventData | ErrorEventData | DoneEventData

/** State of the chat stream */
export interface ChatStreamState {
  /** Whether streaming is in progress */
  isStreaming: boolean
  /** Accumulated streamed content */
  streamedContent: string
  /** Tool events during streaming */
  streamingTools: StreamingToolEvent[]
  /** Error message if streaming failed */
  error: string | null
}

/** Return type for useChatStream hook */
export interface UseChatStreamReturn extends ChatStreamState {
  /** Send a message and start streaming response */
  sendMessage: (message: string, conversationId: string) => Promise<void>
  /** Cancel the current stream */
  cancelStream: () => void
  /** Clear the streamed content */
  clearStream: () => void
}

/**
 * Hook for sending messages and consuming SSE stream responses.
 *
 * Features:
 * - SSE streaming with EventSource
 * - Optimistic message display
 * - Error handling with friendly messages
 * - Query invalidation on completion
 *
 * @example
 * ```tsx
 * const { sendMessage, isStreaming, streamedContent, error } = useChatStream()
 *
 * const handleSend = async (msg: string) => {
 *   await sendMessage(msg, conversationId)
 * }
 * ```
 */
export function useChatStream(): UseChatStreamReturn {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [isStreaming, setIsStreaming] = useState(false)
  const [streamedContent, setStreamedContent] = useState('')
  const [streamingTools, setStreamingTools] = useState<StreamingToolEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  // Ref to track abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null)
  // Counter for unique tool IDs
  const toolIdCounter = useRef(0)

  const clearStream = useCallback(() => {
    setStreamedContent('')
    setStreamingTools([])
    setError(null)
    toolIdCounter.current = 0
  }, [])

  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsStreaming(false)
  }, [])

  const sendMessage = useCallback(
    async (message: string, conversationId: string) => {
      // Validate before proceeding
      if (!user) {
        console.error('[useChatStream] No authenticated user')
        setError('Not authenticated. Please sign in again.')
        return
      }

      if (isStreaming) {
        console.warn('[useChatStream] Already streaming, ignoring request')
        return
      }

      console.log('[useChatStream] Sending message to conversation:', conversationId)

      // Clear previous state
      clearStream()
      setIsStreaming(true)

      // Create new abort controller
      abortControllerRef.current = new AbortController()

      try {
        // Get auth token
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) {
          throw new Error('Not authenticated')
        }

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
        console.log('[useChatStream] API URL:', apiUrl)
        console.log('[useChatStream] Fetching:', `${apiUrl}/chat/stream`)

        // Use fetch with ReadableStream for SSE
        const response = await fetch(`${apiUrl}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            'X-User-Id': user.id,
          },
          body: JSON.stringify({
            message,
            conversation_id: conversationId,
          }),
          signal: abortControllerRef.current.signal,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(
            errorData?.detail?.error?.message ||
              `Request failed: ${response.status}`
          )
        }

        // Read the SSE stream
        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()

          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE events from buffer
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data: StreamEventData = JSON.parse(line.slice(6))

                switch (data.type) {
                  case 'content':
                    setStreamedContent((prev) => prev + data.content)
                    break

                  case 'tool_call':
                    // Add a new tool in "calling" state
                    setStreamingTools((prev) => [
                      ...prev,
                      {
                        id: `tool-${toolIdCounter.current++}`,
                        name: data.name,
                        status: 'calling',
                        args: data.args,
                      },
                    ])
                    break

                  case 'tool_result':
                    // Update existing tool to "complete" with result
                    setStreamingTools((prev) => {
                      // Find the most recent tool with matching name that's still calling
                      const idx = prev.findIndex(
                        (t) => t.name === data.name && t.status === 'calling'
                      )
                      if (idx === -1) {
                        // No matching tool_call found, add as complete
                        return [
                          ...prev,
                          {
                            id: `tool-${toolIdCounter.current++}`,
                            name: data.name,
                            status: 'complete' as const,
                            result: data.result,
                          },
                        ]
                      }
                      // Update the existing tool
                      const updated = [...prev]
                      updated[idx] = {
                        ...updated[idx],
                        status: 'complete',
                        result: data.result,
                      }
                      return updated
                    })
                    break

                  case 'error':
                    setError(data.error)
                    break

                  case 'done':
                    // Invalidate conversation query to refresh messages
                    await queryClient.invalidateQueries({
                      queryKey: ['conversation', conversationId],
                    })
                    // Clear streamed content and tools since they're now persisted
                    setStreamedContent('')
                    setStreamingTools([])
                    toolIdCounter.current = 0
                    break
                }
              } catch {
                // Ignore malformed JSON
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Stream was cancelled, not an error
          console.log('[useChatStream] Stream cancelled by user')
          return
        }

        console.error('[useChatStream] Error:', err)

        let errorMessage: string
        if (err instanceof TypeError && err.message.includes('fetch')) {
          errorMessage = 'Cannot connect to server. Is the backend running at localhost:8000?'
        } else if (err instanceof Error) {
          errorMessage = err.message
        } else {
          errorMessage = "I'm having trouble responding. Let's try again."
        }
        setError(errorMessage)
      } finally {
        setIsStreaming(false)
        abortControllerRef.current = null
      }
    },
    [user, isStreaming, supabase.auth, queryClient, clearStream]
  )

  return {
    isStreaming,
    streamedContent,
    streamingTools,
    error,
    sendMessage,
    cancelStream,
    clearStream,
  }
}
