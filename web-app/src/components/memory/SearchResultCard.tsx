'use client'

import type { DailySummaryResult } from '@/hooks/useMemorySearch'

interface SearchResultCardProps {
  result: DailySummaryResult
  query: string
  onClick?: () => void
}

/**
 * Displays a daily summary search result with highlighted snippet.
 */
export function SearchResultCard({
  result,
  query,
  onClick,
}: SearchResultCardProps) {
  const { snippet, summary_date } = result

  // Format date from YYYY-MM-DD
  const formattedDate = summary_date
    ? new Date(summary_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : 'Unknown date'

  return (
    <div
      className="bg-[#1a1a1f] rounded-xl p-4 cursor-pointer hover:bg-[#252530] transition-colors border border-white/5"
      onClick={onClick}
      role="article"
      aria-label={`Memory from ${formattedDate}`}
    >
      {/* Header with date */}
      <div className="flex justify-between items-start mb-2">
        <span className="text-white font-medium text-sm">{formattedDate}</span>
      </div>

      {/* Snippet with highlighted query */}
      <p className="text-gray-300 text-sm line-clamp-3">
        <HighlightedText text={snippet} query={query} />
      </p>
    </div>
  )
}

interface HighlightedTextProps {
  text: string
  query: string
}

/**
 * Highlights query matches within text.
 */
function HighlightedText({ text, query }: HighlightedTextProps) {
  if (!query || query.length < 2) {
    return <>{text}</>
  }

  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'))

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            className="bg-blue-600/50 text-blue-100 rounded px-0.5"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
