'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

/** Message role types - follows LangGraph message types */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

/** Message data from API */
export interface Message {
  id: string
  conversation_id: string
  role: MessageRole
  content: string
  /** Tool name for tool messages */
  tool_name?: string
}

/** Conversation data from list API */
export interface Conversation {
  id: string
  user_id: string
  title: string | null
  created_at: string
  updated_at: string
}

/** Conversation with messages from detail API */
export interface ConversationWithMessages extends Conversation {
  messages: Message[]
  welcome_message?: string
}

/** Options for useConversations hook */
export interface UseConversationsOptions {
  /** Maximum number of conversations to return */
  limit?: number
  /** Offset for pagination */
  offset?: number
}

/** Return type for useConversations hook */
export interface UseConversationsReturn {
  /** List of conversations */
  conversations: Conversation[]
  /** Whether data is being fetched */
  isPending: boolean
  /** Fetch error if request failed */
  error: Error | null
  /** Manually refetch the data */
  refetch: () => void
}

/** Return type for useConversation hook */
export interface UseConversationReturn {
  /** Conversation with messages */
  conversation: ConversationWithMessages | null
  /** Whether data is being fetched */
  isPending: boolean
  /** Fetch error if request failed */
  error: Error | null
  /** Manually refetch the data */
  refetch: () => void
}

/** Return type for useCreateConversation hook */
export interface UseCreateConversationReturn {
  /** Create a new conversation */
  createConversation: (title?: string) => Promise<ConversationWithMessages>
  /** Whether mutation is in progress */
  isPending: boolean
  /** Mutation error if request failed */
  error: Error | null
}

/**
 * Hook for fetching user's conversations list.
 *
 * Features:
 * - Pagination support
 * - Auth integration via Supabase session
 * - Automatic user scoping
 *
 * @param options - Pagination options
 *
 * @example
 * ```tsx
 * const { conversations, isPending } = useConversations()
 * ```
 */
export function useConversations(
  options: UseConversationsOptions = {}
): UseConversationsReturn {
  const { user } = useAuth()
  const supabase = createClient()
  const { limit = 20, offset = 0 } = options

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['conversations', user?.id, limit, offset],
    queryFn: async (): Promise<Conversation[]> => {
      if (!user) return []

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return []

      const params = new URLSearchParams()
      params.set('limit', limit.toString())
      params.set('offset', offset.toString())

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/conversations?${params}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'X-User-Id': user.id,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData?.error?.message ||
            `Failed to fetch conversations: ${response.status}`
        )
      }

      return response.json()
    },
    enabled: !!user,
    placeholderData: (previousData) => previousData,
    retry: 2,
    retryDelay: 1000,
  })

  return {
    conversations: data ?? [],
    isPending: isPending && !!user,
    error: error as Error | null,
    refetch: () => refetch(),
  }
}

/**
 * Hook for fetching a single conversation with its messages.
 *
 * Features:
 * - Fetches conversation and messages together
 * - Includes welcome message for new conversations
 * - Auth integration via Supabase session
 *
 * @param conversationId - ID of conversation to fetch
 *
 * @example
 * ```tsx
 * const { conversation, isPending } = useConversation(selectedId)
 * ```
 */
export function useConversation(
  conversationId: string | undefined
): UseConversationReturn {
  const { user } = useAuth()
  const supabase = createClient()

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async (): Promise<ConversationWithMessages | null> => {
      if (!user || !conversationId) return null

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(
        `${apiUrl}/api/conversations/${conversationId}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'X-User-Id': user.id,
          },
        }
      )

      if (!response.ok) {
        if (response.status === 404) {
          return null
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData?.error?.message ||
            `Failed to fetch conversation: ${response.status}`
        )
      }

      return response.json()
    },
    enabled: !!user && !!conversationId,
    placeholderData: (previousData) => previousData,
    retry: 2,
    retryDelay: 1000,
  })

  return {
    conversation: data ?? null,
    isPending: isPending && !!user && !!conversationId,
    error: error as Error | null,
    refetch: () => refetch(),
  }
}

/**
 * Hook for creating a new conversation.
 *
 * Features:
 * - Creates conversation via POST API
 * - Returns created conversation with welcome message
 * - Invalidates conversations list on success
 * - Auth integration via Supabase session
 *
 * @example
 * ```tsx
 * const { createConversation, isPending } = useCreateConversation()
 *
 * const handleNew = async () => {
 *   const conversation = await createConversation()
 *   setSelectedId(conversation.id)
 * }
 * ```
 */
export function useCreateConversation(): UseCreateConversationReturn {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const { mutateAsync, isPending, error } = useMutation({
    mutationFn: async (
      title?: string
    ): Promise<ConversationWithMessages> => {
      if (!user) {
        throw new Error('User not authenticated')
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Session not found')
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/api/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          'X-User-Id': user.id,
        },
        body: JSON.stringify({ title: title ?? null }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData?.error?.message ||
            `Failed to create conversation: ${response.status}`
        )
      }

      return response.json()
    },
    onSuccess: (newConversation) => {
      // Invalidate conversations list to include new one
      queryClient.invalidateQueries({
        queryKey: ['conversations', user?.id],
      })
      // Pre-populate the conversation query cache
      queryClient.setQueryData(
        ['conversation', newConversation.id],
        newConversation
      )
    },
  })

  return {
    createConversation: mutateAsync,
    isPending,
    error: error as Error | null,
  }
}
