'use client'

import { useState } from 'react'
import { useMemorySearch, type DailySummaryResult } from '@/hooks/useMemorySearch'
import { useCalendarData } from '@/hooks/useCalendarData'
import { useDateEntries } from '@/hooks/useDateEntries'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { SearchResultCard } from '@/components/memory/SearchResultCard'
import { MemoryDetailModal } from '@/components/memory/MemoryDetailModal'

/**
 * Journey page with calendar view of daily summaries and search.
 *
 * Features:
 * - Daily summary search with debounced input
 * - Month navigation with prefetching
 * - Days with summaries visually marked
 * - Date selection to view day's summary
 */
export default function JourneyPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedResult, setSelectedResult] = useState<DailySummaryResult | null>(null)

  // Memory search with automatic debouncing
  const { results: searchResults, isPending: isSearching, isStale, count } = useMemorySearch(searchQuery)

  // Calendar data (with prefetching)
  const {
    datesWithEntries,
    isPending: isCalendarLoading,
  } = useCalendarData(currentDate.getFullYear(), currentDate.getMonth() + 1)

  // Summary for selected date
  const {
    summary,
    isPending: isSummaryLoading,
  } = useDateEntries(selectedDate)

  // Navigate months
  const goToPrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
    setSelectedDate(null)
  }

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    setSelectedDate(null)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDate(null)
  }

  // Format month/year header
  const monthYearLabel = currentDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  // Whether we're in search mode
  const isSearchMode = searchQuery.trim().length >= 2

  // Convert summary to result format for modal display
  const handleSummaryClick = () => {
    if (summary) {
      setSelectedResult({
        summary_date: summary.summary_date,
        snippet: summary.summary_text?.substring(0, 150) || '',
        content: summary.summary_text || '',
      })
    }
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Journey</h1>
          <p className="mt-1 text-gray-400">Reflect on your memories</p>
        </div>

        {/* Search Input */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search your memories..."
          className="w-full pl-10 pr-4 py-3 bg-[#1a1a1f] text-white placeholder-gray-400 rounded-xl border border-white/10 focus:border-blue-500 focus:outline-none transition-colors"
          aria-label="Search memories"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white transition-colors"
            aria-label="Clear search"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Search Results or Calendar View */}
      {isSearchMode ? (
        <div className="space-y-4">
          {/* Search Results Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">
              {isSearching || isStale ? (
                'Searching...'
              ) : count > 0 ? (
                `Found ${count} ${count === 1 ? 'result' : 'results'}`
              ) : (
                `No memories found for "${searchQuery}"`
              )}
            </h2>
          </div>

          {/* Loading State */}
          {(isSearching || isStale) && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-[#1a1a1f] rounded-xl p-4 animate-pulse border border-white/5"
                >
                  <div className="flex justify-between mb-2">
                    <div className="h-4 bg-gray-700 rounded w-1/3" />
                    <div className="h-3 bg-gray-700 rounded w-16" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-700 rounded w-full" />
                    <div className="h-3 bg-gray-700 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Search Results */}
          {!isSearching && !isStale && searchResults.length > 0 && (
            <div className="space-y-3">
              {searchResults.map((result, index) => (
                <SearchResultCard
                  key={`${result.summary_date}-${index}`}
                  result={result}
                  query={searchQuery}
                  onClick={() => setSelectedResult(result)}
                />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isSearching && !isStale && searchResults.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-400">
                Try different keywords or check your spelling
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Calendar */}
          <div className="bg-[#1a1a1f] rounded-2xl p-4 border border-white/5">
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={goToPrevMonth}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                onClick={goToToday}
                className="font-medium text-white transition-colors hover:text-blue-400"
              >
                {monthYearLabel}
              </button>

              <button
                onClick={goToNextMonth}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Next month"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {/* Calendar Grid */}
            {isCalendarLoading ? (
              <CalendarSkeleton />
            ) : (
              <CalendarGrid
                currentDate={currentDate}
                selectedDate={selectedDate}
                datesWithEntries={datesWithEntries}
                onSelectDate={setSelectedDate}
              />
            )}
          </div>

          {/* Summary for selected date */}
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-white">
              {selectedDate
                ? `Summary for ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`
                : 'Select a date to view summary'}
            </h2>

            {/* Loading skeleton */}
            {selectedDate && isSummaryLoading && (
              <div className="bg-[#1a1a1f] rounded-xl p-4 animate-pulse border border-white/5">
                <div className="flex justify-between mb-2">
                  <div className="h-4 bg-gray-700 rounded w-1/3" />
                  <div className="h-3 bg-gray-700 rounded w-16" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-700 rounded w-full" />
                  <div className="h-3 bg-gray-700 rounded w-2/3" />
                </div>
              </div>
            )}

            {/* Daily summary */}
            {selectedDate && !isSummaryLoading && summary && (
              <div
                className="bg-[#1a1a1f] rounded-xl p-4 cursor-pointer hover:bg-[#252530] transition-colors border border-white/5"
                onClick={handleSummaryClick}
                role="article"
                aria-label="Daily summary"
              >
                <p className="text-gray-300 text-sm line-clamp-4 whitespace-pre-wrap">
                  {summary.summary_text || 'No summary available'}
                </p>
              </div>
            )}

            {/* Empty state for date with no summary */}
            {selectedDate && !isSummaryLoading && !summary && (
              <div className="text-center py-8 text-gray-400">
                No summary recorded for this date
              </div>
            )}

            {/* Empty state when no date selected */}
            {!selectedDate && (
              <div className="text-center py-8 text-gray-400">
                Tap on a date with a dot to view your summary
              </div>
            )}
          </div>
        </>
      )}

      </div>

      {/* Memory Detail Modal */}
      {selectedResult && (
        <MemoryDetailModal
          result={selectedResult}
          isOpen={!!selectedResult}
          onClose={() => setSelectedResult(null)}
        />
      )}
    </div>
  )
}

/**
 * Skeleton loading state for the calendar grid.
 */
function CalendarSkeleton() {
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="animate-pulse">
      {/* Week day headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) => (
          <div
            key={day}
            className="text-center text-gray-500 text-xs font-medium py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Skeleton calendar cells */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, index) => (
          <div
            key={index}
            className="p-2 min-h-[44px] rounded-lg bg-gray-700/50"
          />
        ))}
      </div>
    </div>
  )
}

interface CalendarGridProps {
  currentDate: Date
  selectedDate: string | null
  datesWithEntries: Set<string>
  onSelectDate: (date: string | null) => void
}

function CalendarGrid({
  currentDate,
  selectedDate,
  datesWithEntries,
  onSelectDate,
}: CalendarGridProps) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // Get first day of month and total days
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Get today for highlighting
  const today = new Date().toISOString().split('T')[0]

  // Build calendar days
  const days: (number | null)[] = []

  // Add empty cells for days before the first of the month
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null)
  }

  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day)
  }

  // Day of week headers
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div>
      {/* Week day headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) => (
          <div
            key={day}
            className="text-center text-gray-500 text-xs font-medium py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar days */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} className="p-2" />
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const hasEntries = datesWithEntries.has(dateStr)
          const isSelected = selectedDate === dateStr
          const isToday = dateStr === today

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(isSelected ? null : dateStr)}
              className={`
                relative p-2 min-h-[44px] rounded-lg text-sm font-medium transition-colors
                ${isSelected
                  ? 'bg-blue-600 text-white'
                  : isToday
                    ? 'bg-[#252530] text-white'
                    : 'hover:bg-[#252530] text-gray-300'
                }
              `}
              aria-label={`${day} ${hasEntries ? '(has summary)' : ''}`}
              aria-pressed={isSelected}
            >
              {day}
              {hasEntries && !isSelected && (
                <span className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-blue-400 rounded-full" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
