'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { DeleteAccountDialog } from '@/components/DeleteAccountDialog'
import { useAccountDeletion } from '@/hooks/useAccountDeletion'
import { SettingsHeader } from '@/components/navigation/SettingsHeader'

/**
 * Account settings page with account deletion functionality.
 * Features:
 * - Danger zone section with delete account option
 * - Confirmation dialog requiring "DELETE" input
 * - Dark theme with mobile-first design
 * - GDPR-compliant data deletion
 */
export default function AccountSettingsPage() {
  const router = useRouter()
  const { deleteAccount, isDeleting, deleteError } = useAccountDeletion()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current)
      }
    }
  }, [])

  const handleDeleteClick = () => {
    setLocalError(null)
    setIsDialogOpen(true)
  }

  const handleClose = () => {
    if (!isDeleting) {
      setIsDialogOpen(false)
      setLocalError(null)
    }
  }

  const handleConfirmDelete = async () => {
    setLocalError(null)
    try {
      await deleteAccount()
      // Close dialog and show success toast
      setIsDialogOpen(false)
      setShowSuccessToast(true)
      // Redirect after showing toast briefly
      toastTimeoutRef.current = setTimeout(() => {
        router.push('/')
      }, 1500)
    } catch (error) {
      // Error is captured in deleteError from hook, but we can also set local error
      setLocalError(
        error instanceof Error
          ? error.message
          : 'Unable to delete account. Please try again.'
      )
    }
  }

  // Combine hook error and local error
  const displayError =
    localError ||
    (deleteError instanceof Error
      ? deleteError.message
      : deleteError
        ? 'Unable to delete account. Please try again.'
        : null)

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-3xl">
        <SettingsHeader
          title="Account"
          description="Manage your account and data"
        />

      {/* Danger Zone Section */}
      <div className="p-6 bg-[#1a1a1f]/50 border border-red-500/30 rounded-lg space-y-4">
        <div className="flex items-center gap-2">
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
            className="text-red-400"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <h2 className="text-lg font-medium text-red-400">Danger Zone</h2>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-medium text-white">Delete Account</h3>
          <p className="text-sm text-gray-400">
            Permanently delete your account and all associated data. This action
            cannot be undone and you will lose access to all your check-ins,
            memories, and conversations.
          </p>

          <button
            type="button"
            onClick={handleDeleteClick}
            aria-haspopup="dialog"
            className="min-h-[44px] px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-[#141414]"
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* Delete Account Dialog */}
      <DeleteAccountDialog
        isOpen={isDialogOpen}
        onClose={handleClose}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        error={displayError}
      />

      {/* Success Toast */}
      {showSuccessToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 bg-green-600 text-white font-medium rounded-lg shadow-lg z-50"
          role="status"
          aria-live="polite"
        >
          Account deleted
        </div>
      )}
      </div>
    </div>
  )
}
