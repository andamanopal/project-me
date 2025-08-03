'use client'

import { formatDistanceToNow } from 'date-fns'

interface Conversation {
  id: string
  title: string | null
  created_at: string
  updated_at: string
}

interface ConversationListProps {
  conversations: Conversation[]
  selectedId?: string
  onSelect: (id: string) => void
  onNewConversation: () => void
  isPending: boolean
}

/**
 * Skeleton loading state for conversation list.
 */
function ConversationListSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-16 bg-[#1E293B] rounded-lg animate-pulse"
        />
      ))}
    </div>
  )
}

/**
 * List of user's conversations with selection state.
 * Displays conversation title or "New conversation" fallback.
 */
export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onNewConversation,
  isPending,
}: ConversationListProps) {
  if (isPending) {
    return <ConversationListSkeleton />
  }

  return (
    <div className="flex flex-col h-full">
      {/* New Conversation Button */}
      <div className="p-2 border-b border-gray-800">
        <button
          onClick={onNewConversation}
          className="w-full min-h-[44px] px-4 py-3 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          aria-label="Start new conversation"
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
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Conversation
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">
            No conversations yet. Start a new one!
          </p>
        ) : (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              className={`w-full min-h-[44px] p-3 rounded-lg text-left transition-colors ${
                selectedId === conversation.id
                  ? 'bg-[#1E293B] text-white'
                  : 'text-gray-300 hover:bg-[#1E293B]/50'
              }`}
              aria-selected={selectedId === conversation.id}
            >
              <div className="font-medium truncate">
                {conversation.title || 'New conversation'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {formatDistanceToNow(new Date(conversation.updated_at), {
                  addSuffix: true,
                })}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
