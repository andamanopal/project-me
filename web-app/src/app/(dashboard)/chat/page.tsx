'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import {
  useConversations,
  useConversation,
  useCreateConversation,
} from '@/hooks/useConversations'
import { ChatContainer } from '@/components/chat/ChatContainer'

/**
 * Chat page with conversation list and messaging interface.
 *
 * Features:
 * - Protected route (redirects to login if not authenticated)
 * - Conversation list sidebar
 * - New conversation creation with welcome message
 * - Real-time conversation fetching via TanStack Query
 *
 * Implements:
 * - AC1: New conversation creation
 * - AC2: Conversation isolation
 * - AC3: Welcome message with time-of-day context
 */
export default function ChatPage() {
  const router = useRouter()
  const { user, isPending: authPending } = useAuth()
  const [selectedId, setSelectedId] = useState<string | undefined>()

  // Fetch conversations list
  const {
    conversations,
    isPending: isLoadingList,
  } = useConversations()

  // Fetch selected conversation with messages
  const {
    conversation: selectedConversation,
    isPending: isLoadingConversation,
  } = useConversation(selectedId)

  // Mutation for creating new conversations
  const { createConversation, isPending: isCreating } = useCreateConversation()

  // Redirect unauthenticated users
  useEffect(() => {
    if (!authPending && !user) {
      router.push('/login')
    }
  }, [user, authPending, router])

  const handleSelectConversation = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  const handleNewConversation = useCallback(async () => {
    try {
      const newConversation = await createConversation()
      setSelectedId(newConversation.id)
    } catch (error) {
      console.error('Failed to create conversation:', error)
    }
  }, [createConversation])

  // Show loading skeleton while checking auth
  if (authPending) {
    return (
      <div className="h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="space-y-4">
          <div className="w-24 h-24 bg-[#1E293B] rounded-full animate-pulse mx-auto" />
          <div className="w-48 h-4 bg-[#1E293B] rounded animate-pulse" />
        </div>
      </div>
    )
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null
  }

  return (
    <div className="h-screen">
      <ChatContainer
        conversations={conversations}
        selectedConversation={selectedConversation ?? undefined}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        isLoadingList={isLoadingList || isCreating}
        isLoadingConversation={isLoadingConversation}
      />
    </div>
  )
}
