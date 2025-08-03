'use client'

import { useState } from 'react'
import { useCheckIns, type CheckInData } from '@/hooks/useCheckIns'
import { CheckInSummaryCard } from './CheckInSummaryCard'
import { CheckInDetail } from './CheckInDetail'

interface CheckInListProps {
  /** Optional date filter (YYYY-MM-DD) */
  date?: string
  /** Maximum number of check-ins to display */
  limit?: number
  /** Show compact view (for home page) */
  compact?: boolean
  /** Callback when "View all" is clicked */
  onViewAll?: () => void
}

/**
 * Displays a list of user's check-ins with summary cards.
 *
 * Features:
 * - Skeleton loading for pending states
 * - Automatic polling for processing check-ins
 * - Empty state with CTA
 * - Optional compact mode for home page
 */
export function CheckInList({
  date,
  limit = 20,
  compact = false,
  onViewAll,
}: CheckInListProps) {
  const { checkIns, isPending, error, refetch } = useCheckIns({ date, limit })
  const [selectedCheckIn, setSelectedCheckIn] = useState<CheckInData | null>(null)

  // Loading state with skeletons
  if (isPending) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading check-ins">
        {[...Array(compact ? 3 : 5)].map((_, i) => (
          <CheckInSkeleton key={i} />
        ))}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="bg-[#1E293B] rounded-lg p-6 text-center">
        <p className="text-red-400 mb-4">Could not load check-ins</p>
        <button
          onClick={() => refetch()}
          className="text-cyan-400 hover:text-cyan-300 transition-colors text-sm"
        >
          Tap to retry
        </button>
      </div>
    )
  }

  // Empty state
  if (checkIns.length === 0) {
    return (
      <div className="bg-[#1E293B] rounded-lg p-8 text-center">
        <div className="text-4xl mb-4">🎙️</div>
        <h3 className="text-white text-lg font-medium mb-2">
          No check-ins yet
        </h3>
        <p className="text-gray-400 text-sm">
          {date
            ? `No check-ins recorded on this date.`
            : `Start your first one! Record your thoughts, feelings, or daily reflections.`}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {checkIns.map((checkIn) => (
          <CheckInSummaryCard
            key={checkIn.id}
            checkIn={checkIn}
            compact={compact}
            onClick={() => setSelectedCheckIn(checkIn)}
          />
        ))}

        {/* View all link for compact mode */}
        {compact && checkIns.length >= limit && onViewAll && (
          <button
            onClick={onViewAll}
            className="w-full py-3 text-center text-cyan-400 hover:text-cyan-300 transition-colors text-sm"
          >
            View all check-ins →
          </button>
        )}
      </div>

      {/* Detail modal */}
      {selectedCheckIn && (
        <CheckInDetail
          checkIn={selectedCheckIn}
          onClose={() => setSelectedCheckIn(null)}
          onDeleted={() => setSelectedCheckIn(null)}
        />
      )}
    </>
  )
}

/** Skeleton placeholder for loading state */
function CheckInSkeleton() {
  return (
    <div
      className="bg-[#1E293B] rounded-lg p-4 animate-pulse"
      role="article"
      aria-hidden="true"
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
