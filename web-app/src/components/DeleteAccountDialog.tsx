'use client'

import { useState, useEffect, useRef } from 'react'

interface DeleteAccountDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  isDeleting: boolean
  error: string | null
}

/**
 * Confirmation dialog for account deletion.
 * Requires user to type "DELETE" to confirm.
 * Follows WCAG accessibility guidelines with role="alertdialog".
 */
export function DeleteAccountDialog({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  error,
}: DeleteAccountDialogProps) {
  const [confirmText, setConfirmText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const isConfirmEnabled = confirmText === 'DELETE'

  // Reset input when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setConfirmText('')
    }
  }, [isOpen])

  // Lock body scroll when dialog is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isDeleting) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, isDeleting, onClose])

  // Trap focus within dialog - re-query when enabled state changes
  useEffect(() => {
    if (!isOpen) return

    const dialog = dialogRef.current
    if (!dialog) return

    const getFocusableElements = () => {
      return dialog.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
      )
    }

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusableElements = getFocusableElements()
      const firstElement = focusableElements[0] as HTMLElement
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    window.addEventListener('keydown', handleTab)
    return () => window.removeEventListener('keydown', handleTab)
  }, [isOpen, isConfirmEnabled, isDeleting])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isConfirmEnabled || isDeleting) return
    await onConfirm()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        className="w-full max-w-md bg-[#1E293B] rounded-lg shadow-xl"
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="p-6 border-b border-gray-700">
            <h2
              id="delete-dialog-title"
              className="text-xl font-semibold text-white"
            >
              Delete Account
            </h2>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <div
              id="delete-dialog-description"
              className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg"
            >
              <p className="text-red-400 font-medium mb-2">
                This action cannot be undone.
              </p>
              <p className="text-sm text-gray-300">
                Deleting your account will permanently remove:
              </p>
              <ul className="text-sm text-gray-400 list-disc list-inside mt-2 space-y-1">
                <li>Your profile and preferences</li>
                <li>All check-ins and memories</li>
                <li>All conversation history</li>
                <li>Your account credentials</li>
              </ul>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="confirm-delete-input"
                className="block text-sm font-medium text-gray-300"
              >
                Type <span className="font-mono text-red-400">DELETE</span> to confirm
              </label>
              <input
                ref={inputRef}
                id="confirm-delete-input"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={isDeleting}
                placeholder="Type DELETE"
                autoComplete="off"
                autoFocus
                className="w-full px-4 py-3 bg-[#0F172A] border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div
                className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
                role="alert"
              >
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-700 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 min-h-[44px] py-3 px-4 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-600/50 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-[#1E293B] disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isConfirmEnabled || isDeleting}
              aria-label={isDeleting ? 'Deleting account' : 'Confirm delete account'}
              className="flex-1 min-h-[44px] py-3 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-[#1E293B] disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Deleting...
                </span>
              ) : (
                'Delete Account'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
