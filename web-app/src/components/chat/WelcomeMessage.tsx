'use client'

interface WelcomeMessageProps {
  message?: string
}

/**
 * Welcome message component displayed when conversation is empty.
 * Features subtle animation and dark theme styling.
 */
export function WelcomeMessage({ message }: WelcomeMessageProps) {
  const displayMessage = message || "Hello! I'm here to help. What's on your mind?"

  return (
    <div className="max-w-md mx-auto text-center animate-fade-in">
      {/* AI Avatar */}
      <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] flex items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />
          <path d="M15 13v2" />
          <path d="M9 13v2" />
        </svg>
      </div>

      {/* Welcome Text */}
      <h2 className="text-xl font-semibold text-white mb-3">
        Project-Me
      </h2>
      <p className="text-gray-300 text-lg leading-relaxed">
        {displayMessage}
      </p>

      {/* Suggested prompts */}
      <div className="mt-8 space-y-2">
        <p className="text-gray-500 text-sm mb-3">Try asking:</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {[
            'How am I feeling today?',
            'What did I do yesterday?',
            'Any patterns in my week?',
          ].map((prompt) => (
            <button
              key={prompt}
              disabled
              className="px-4 py-2 bg-[#1E293B] text-gray-300 rounded-full text-sm hover:bg-[#2D3B4F] transition-colors disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
        <p className="text-gray-600 text-xs mt-4">
          Prompts will be interactive in Story 4.2
        </p>
      </div>
    </div>
  )
}
