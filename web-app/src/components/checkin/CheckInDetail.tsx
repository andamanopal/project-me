'use client'

import { useEffect, useRef, useState } from 'react'
import type { CheckInData } from '@/hooks/useCheckIns'
import { useUpdateCheckIn, useDeleteCheckIn } from '@/hooks/useCheckInMutations'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface CheckInDetailProps {
  checkIn: CheckInData
  onClose: () => void
  /** Called after successful deletion */
  onDeleted?: () => void
}

/**
 * Full-screen modal showing complete check-in details.
 *
 * Features:
 * - View mode: Full transcript, summary, audio playback
 * - Edit mode: Edit transcript, optional summary regeneration
 * - Delete: Confirmation dialog, permanent deletion
 * - Processing timestamps
 */
export function CheckInDetail({ checkIn, onClose, onDeleted }: CheckInDetailProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const { summary, transcript, audio_url, created_at, status, id } = checkIn

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [editedTranscript, setEditedTranscript] = useState(transcript || '')
  const [regenerateSummary, setRegenerateSummary] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Mutations
  const { updateCheckIn, isPending: isUpdating } = useUpdateCheckIn()
  const { deleteCheckIn, isPending: isDeleting } = useDeleteCheckIn()

  const hasSummaryError = summary?.error !== undefined
  const hasSummary = summary && !hasSummaryError

  // Format timestamps
  const createdDate = new Date(created_at)
  const formattedDate = createdDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const formattedTime = createdDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  // Handle escape key (only in view mode)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditing && !showDeleteConfirm) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose, isEditing, showDeleteConfirm])

  // Handle click outside (only in view mode)
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current && !isEditing && !showDeleteConfirm) {
      onClose()
    }
  }

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Reset edit state when entering edit mode
  const handleEnterEdit = () => {
    setEditedTranscript(transcript || '')
    setRegenerateSummary(false)
    setSaveError(null)
    setIsEditing(true)
  }

  // Cancel edit and revert changes
  const handleCancelEdit = () => {
    setEditedTranscript(transcript || '')
    setRegenerateSummary(false)
    setSaveError(null)
    setIsEditing(false)
  }

  // Save edited transcript
  const handleSave = async () => {
    setSaveError(null)
    try {
      await updateCheckIn({
        id,
        transcript: editedTranscript,
        regenerateSummary,
      })
      setIsEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes')
    }
  }

  // Handle delete confirmation
  const handleDelete = async () => {
    setDeleteError(null)
    try {
      await deleteCheckIn(id)
      setShowDeleteConfirm(false)
      onDeleted?.()
      onClose()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete check-in')
    }
  }

  return (
    <>
      <div
        ref={modalRef}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
      >
        <div className="bg-[#0F172A] w-full sm:max-w-lg sm:rounded-lg max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="border-b border-gray-800 p-4 flex items-center justify-between">
            <div>
              <h2 id="detail-title" className="text-white font-medium">
                {isEditing ? 'Edit Check-in' : 'Check-in Details'}
              </h2>
              <p className="text-gray-400 text-sm">
                {formattedDate} at {formattedTime}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {!isEditing && (
                <>
                  {/* Edit button */}
                  <button
                    onClick={handleEnterEdit}
                    className="text-gray-400 hover:text-cyan-400 transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="Edit transcript"
                    title="Edit transcript"
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
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  {/* Delete button */}
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-gray-400 hover:text-red-400 transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="Delete check-in"
                    title="Delete check-in"
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
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </>
              )}
              {/* Close button */}
              <button
                onClick={isEditing ? handleCancelEdit : onClose}
                className="text-gray-400 hover:text-white transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label={isEditing ? 'Cancel edit' : 'Close'}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Audio player */}
            {audio_url && (
              <div className="space-y-2">
                <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide">
                  Original Recording
                </h3>
                <audio
                  controls
                  className="w-full h-12"
                  preload="metadata"
                >
                  <source src={audio_url} type="audio/webm" />
                  <source src={audio_url} type="audio/mp4" />
                  Your browser does not support audio playback.
                </audio>
              </div>
            )}

            {/* Edit mode */}
            {isEditing ? (
              <div className="space-y-4">
                {/* Transcript textarea */}
                <div className="space-y-2">
                  <label
                    htmlFor="transcript-edit"
                    className="text-gray-400 text-xs font-medium uppercase tracking-wide flex items-center gap-2"
                  >
                    <span className="text-lg">📝</span>
                    Transcript
                  </label>
                  <textarea
                    id="transcript-edit"
                    value={editedTranscript}
                    onChange={(e) => setEditedTranscript(e.target.value)}
                    className="w-full h-48 bg-[#1E293B] text-gray-300 rounded-lg p-3 border border-gray-700 focus:border-cyan-500 focus:outline-none resize-none"
                    placeholder="Enter transcript..."
                    disabled={isUpdating}
                  />
                </div>

                {/* Regenerate summary toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={regenerateSummary}
                    onChange={(e) => setRegenerateSummary(e.target.checked)}
                    disabled={isUpdating}
                    className="w-5 h-5 rounded bg-[#1E293B] border-gray-700 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
                  />
                  <span className="text-gray-300 text-sm">
                    Regenerate summary from edited transcript
                  </span>
                </label>

                {/* Save error */}
                {saveError && (
                  <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
                    <p className="text-red-400 text-sm">{saveError}</p>
                    <button
                      onClick={handleSave}
                      className="text-red-300 text-sm underline mt-1"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {/* Save/Cancel buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleCancelEdit}
                    disabled={isUpdating}
                    className="flex-1 py-3 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isUpdating || !editedTranscript.trim()}
                    className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isUpdating && (
                      <svg
                        className="animate-spin h-4 w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    )}
                    {isUpdating ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Summary sections */}
                {hasSummary ? (
                  <div className="space-y-4">
                    {/* Events */}
                    {summary.events.length > 0 && (
                      <DetailSection icon="📋" title="Events">
                        <ul className="space-y-1">
                          {summary.events.map((event, i) => (
                            <li key={i} className="flex items-start gap-2 text-gray-300">
                              <span className="text-gray-500 mt-0.5">•</span>
                              <span>{event}</span>
                            </li>
                          ))}
                        </ul>
                      </DetailSection>
                    )}

                    {/* Emotions */}
                    {summary.emotions.length > 0 && (
                      <DetailSection icon="💭" title="Feelings">
                        <div className="space-y-2">
                          {summary.emotions.map((e, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="bg-[#374151] text-gray-200 px-2 py-0.5 rounded text-sm">
                                {e.emotion}
                              </span>
                              <span className="text-gray-400 text-sm">{e.context}</span>
                            </div>
                          ))}
                        </div>
                      </DetailSection>
                    )}

                    {/* Goals */}
                    {summary.goals.length > 0 && (
                      <DetailSection icon="🎯" title="Goals">
                        <ul className="space-y-1">
                          {summary.goals.map((goal, i) => (
                            <li key={i} className="flex items-start gap-2 text-gray-300">
                              <span className="text-cyan-400 mt-0.5">○</span>
                              <span>{goal}</span>
                            </li>
                          ))}
                        </ul>
                      </DetailSection>
                    )}

                    {/* Concerns */}
                    {summary.concerns.length > 0 && (
                      <DetailSection icon="⚠️" title="Concerns">
                        <ul className="space-y-1">
                          {summary.concerns.map((concern, i) => (
                            <li key={i} className="flex items-start gap-2 text-amber-300">
                              <span className="text-amber-500 mt-0.5">•</span>
                              <span>{concern}</span>
                            </li>
                          ))}
                        </ul>
                      </DetailSection>
                    )}
                  </div>
                ) : (
                  <div className="text-gray-400 text-sm italic py-2">
                    Summary unavailable - you can still view your transcript below
                  </div>
                )}

                {/* Transcript */}
                {transcript && (
                  <DetailSection icon="📝" title="Transcript">
                    <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {transcript}
                    </p>
                  </DetailSection>
                )}
              </>
            )}

            {/* Status indicator for processing */}
            {['processing', 'transcribing', 'summarizing'].includes(status) && (
              <div className="bg-[#1E293B] rounded-lg p-4 text-center">
                <div className="animate-pulse flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full" />
                  <span className="text-gray-400 text-sm">
                    {status === 'processing' && 'Processing...'}
                    {status === 'transcribing' && 'Transcribing...'}
                    {status === 'summarizing' && 'Generating summary...'}
                  </span>
                </div>
              </div>
            )}

            {/* Processing metadata */}
            {summary?.generated_at && !isEditing && (
              <p className="text-gray-500 text-xs text-center">
                Summary generated{' '}
                {new Date(summary.generated_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Check-in"
        message="This will permanently delete this check-in, including the transcript, summary, and audio recording. This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isPending={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => {
          setShowDeleteConfirm(false)
          setDeleteError(null)
        }}
      />

      {/* Delete error toast */}
      {deleteError && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-red-900/90 border border-red-700 rounded-lg p-4 z-[70]">
          <p className="text-red-300 text-sm">{deleteError}</p>
          <button
            onClick={() => setDeleteError(null)}
            className="text-red-400 text-xs underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  )
}

interface DetailSectionProps {
  icon: string
  title: string
  children: React.ReactNode
}

function DetailSection({ icon, title, children }: DetailSectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wide">
          {title}
        </h3>
      </div>
      {children}
    </div>
  )
}
