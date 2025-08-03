'use client'

import { useState } from 'react'
import type { CheckInData } from '@/hooks/useCheckIns'
import type { SummaryData } from '@/hooks/useCheckInStatus'

interface CheckInSummaryCardProps {
  checkIn: CheckInData
  onClick?: () => void
  compact?: boolean
}

/**
 * Displays a check-in summary card with structured sections.
 *
 * Sections displayed (in priority order):
 * 1. Events (most actionable)
 * 2. Emotions (with context)
 * 3. Goals (for tracking)
 * 4. Concerns (for reflection)
 */
export function CheckInSummaryCard({
  checkIn,
  onClick,
  compact = false,
}: CheckInSummaryCardProps) {
  const [expanded, setExpanded] = useState(false)
  const { summary, status, transcript, created_at } = checkIn

  const isProcessing = ['processing', 'transcribing', 'summarizing'].includes(status)
  const hasSummaryError = summary?.error !== undefined
  const hasSummary = summary && !hasSummaryError

  // Format date/time
  const formattedDate = new Date(created_at).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const formattedTime = new Date(created_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  // Skeleton for processing state
  if (isProcessing) {
    return (
      <div
        className="bg-[#1E293B] rounded-lg p-4 animate-pulse"
        role="article"
        aria-busy="true"
        aria-label="Loading check-in"
      >
        <div className="flex justify-between mb-3">
          <div className="h-4 bg-gray-700 rounded w-24" />
          <div className="h-4 bg-gray-700 rounded w-16" />
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-gray-700 rounded w-full" />
          <div className="h-3 bg-gray-700 rounded w-3/4" />
          <div className="h-3 bg-gray-700 rounded w-1/2" />
        </div>
      </div>
    )
  }

  // Error or missing summary state
  if (hasSummaryError || !hasSummary) {
    return (
      <div
        className="bg-[#1E293B] rounded-lg p-4 cursor-pointer hover:bg-[#2D3B4E] transition-colors"
        onClick={onClick}
        role="article"
        aria-label={`Check-in from ${formattedDate}`}
      >
        <div className="flex justify-between items-start mb-2">
          <span className="text-gray-400 text-sm">{formattedDate}</span>
          <span className="text-gray-500 text-xs">{formattedTime}</span>
        </div>
        <p className="text-gray-400 text-sm italic">
          Summary unavailable - you can still view your transcript
        </p>
        {transcript && (
          <p className="text-gray-300 text-sm mt-2 line-clamp-2">
            {transcript}
          </p>
        )}
      </div>
    )
  }

  // Determine what to show based on compact mode and expansion
  const showAllSections = !compact || expanded
  const hasContent =
    summary.events.length > 0 ||
    summary.emotions.length > 0 ||
    summary.goals.length > 0 ||
    summary.concerns.length > 0

  return (
    <div
      className="bg-[#1E293B] rounded-lg p-4 cursor-pointer hover:bg-[#2D3B4E] transition-colors"
      onClick={onClick}
      role="article"
      aria-label={`Check-in from ${formattedDate}`}
    >
      {/* Header with date/time */}
      <div className="flex justify-between items-start mb-3">
        <span className="text-gray-400 text-sm">{formattedDate}</span>
        <span className="text-gray-500 text-xs">{formattedTime}</span>
      </div>

      {!hasContent ? (
        <p className="text-gray-400 text-sm italic">
          No structured content extracted from this check-in
        </p>
      ) : (
        <div className="space-y-3">
          {/* Events */}
          {summary.events.length > 0 && (
            <SummarySection
              icon="📋"
              title="Events"
              items={summary.events}
              compact={compact && !expanded}
              maxItems={2}
            />
          )}

          {/* Emotions */}
          {showAllSections && summary.emotions.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">💭</span>
                <span className="text-gray-400 text-xs font-medium uppercase tracking-wide">
                  Feelings
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.emotions.map((e, i) => (
                  <span
                    key={i}
                    className="text-sm bg-[#374151] text-gray-200 px-2 py-0.5 rounded"
                    title={e.context}
                  >
                    {e.emotion}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Goals */}
          {showAllSections && summary.goals.length > 0 && (
            <SummarySection
              icon="🎯"
              title="Goals"
              items={summary.goals}
              compact={compact && !expanded}
              maxItems={2}
            />
          )}

          {/* Concerns */}
          {showAllSections && summary.concerns.length > 0 && (
            <SummarySection
              icon="⚠️"
              title="Concerns"
              items={summary.concerns}
              compact={compact && !expanded}
              maxItems={2}
              variant="warning"
            />
          )}
        </div>
      )}

      {/* Show more/less toggle for compact mode */}
      {compact && hasContent && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(!expanded)
          }}
          className="text-cyan-400 text-xs mt-2 hover:text-cyan-300 transition-colors"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

interface SummarySectionProps {
  icon: string
  title: string
  items: string[]
  compact?: boolean
  maxItems?: number
  variant?: 'default' | 'warning'
}

function SummarySection({
  icon,
  title,
  items,
  compact = false,
  maxItems = 3,
  variant = 'default',
}: SummarySectionProps) {
  const displayItems = compact ? items.slice(0, maxItems) : items
  const hasMore = compact && items.length > maxItems

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="text-sm">{icon}</span>
        <span className="text-gray-400 text-xs font-medium uppercase tracking-wide">
          {title}
        </span>
      </div>
      <ul className={`text-sm space-y-0.5 ${variant === 'warning' ? 'text-amber-300' : 'text-gray-300'}`}>
        {displayItems.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-gray-500 mt-0.5">•</span>
            <span className="line-clamp-2">{item}</span>
          </li>
        ))}
        {hasMore && (
          <li className="text-gray-500 italic">
            +{items.length - maxItems} more
          </li>
        )}
      </ul>
    </div>
  )
}
