'use client'

import { useEffect, useRef } from 'react'

export interface ConfirmDialogProps {
  /** Whether the dialog is visible */
  isOpen: boolean
  /** Dialog title */
  title: string
  /** Dialog message/description */
  message: string
  /** Label for confirm button (default: "Delete") */
  confirmLabel?: string
  /** Label for cancel button (default: "Cancel") */
  cancelLabel?: string
  /** Visual variant (default: "danger") */
  variant?: 'danger' | 'warning'
  /** Whether an action is in progress */
  isPending?: boolean
  /** Called when user confirms */
  onConfirm: () => void
  /** Called when user cancels */
  onCancel: () => void
}

/**
 * Reusable confirmation dialog for destructive actions.
 *
 * Features:
 * - Dark theme consistent with app design
 * - Keyboard support (Escape to cancel, Enter to confirm)
 * - Backdrop click to cancel
 * - Accessible with ARIA roles
 * - 44x44px minimum touch targets
 * - Loading state during async operations
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isPending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) {
        onCancel()
      } else if (e.key === 'Enter' && !isPending) {
        e.preventDefault()
        onConfirm()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel, onConfirm, isPending])

  // Focus confirm button when dialog opens
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      confirmButtonRef.current.focus()
    }
  }, [isOpen])

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === dialogRef.current && !isPending) {
      onCancel()
    }
  }

  const confirmButtonClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-amber-600 hover:bg-amber-700 text-white'

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
    >
      <div className="bg-[#1E293B] rounded-lg w-full max-w-sm shadow-xl">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <h2
            id="confirm-dialog-title"
            className="text-white text-lg font-medium"
          >
            {title}
          </h2>
        </div>

        {/* Content */}
        <div className="p-4">
          <p
            id="confirm-dialog-description"
            className="text-gray-300 text-sm leading-relaxed"
          >
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-gray-700 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 min-w-[44px] min-h-[44px] text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`px-4 py-2 min-w-[44px] min-h-[44px] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${confirmButtonClass}`}
          >
            {isPending && (
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
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
