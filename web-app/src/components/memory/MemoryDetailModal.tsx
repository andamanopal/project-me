'use client'

import type { DailySummaryResult } from '@/hooks/useMemorySearch'

interface MemoryDetailModalProps {
  result: DailySummaryResult
  isOpen: boolean
  onClose: () => void
}

/**
 * Modal displaying full daily summary content.
 */
export function MemoryDetailModal({
  result,
  isOpen,
  onClose,
}: MemoryDetailModalProps) {
  if (!isOpen) return null

  const { content, summary_date } = result

  // Format date from YYYY-MM-DD
  const formattedDate = summary_date
    ? new Date(summary_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Unknown date'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="bg-[#1a1a1f] rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start p-4 border-b border-gray-700">
          <div>
            <h2 id="modal-title" className="text-white font-medium">
              Daily Summary
            </h2>
            <p className="text-gray-400 text-sm mt-1">{formattedDate}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-[#252530]"
            aria-label="Close"
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
            {content}
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full py-2 bg-[#252530] text-white rounded-lg hover:bg-[#2a2a35] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
