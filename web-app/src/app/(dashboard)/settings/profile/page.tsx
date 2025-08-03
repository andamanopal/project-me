'use client'

import { useState, useId, type FormEvent } from 'react'
import { AlertCircle } from 'lucide-react'
import { useProfile } from '@/hooks/useProfile'
import AvatarUpload from '@/components/profile/AvatarUpload'
import { SettingsHeader } from '@/components/navigation/SettingsHeader'

/**
 * Profile settings page for viewing and editing user profile.
 * Features:
 * - View/update display name
 * - View email (read-only)
 * - Upload avatar image
 * - Dark theme with mobile-first design
 * - Skeleton loading states
 * - Accessible form controls
 */
export default function ProfilePage() {
  const {
    profile,
    isLoadingProfile,
    profileError,
    userEmail,
    updateProfile,
    isUpdatingProfile,
    updateProfileError,
    uploadAvatar,
    isUploadingAvatar,
    uploadAvatarError,
  } = useProfile()

  const [displayName, setDisplayName] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // Accessibility IDs
  const displayNameErrorId = useId()
  const formSuccessId = useId()

  // Sync display name from profile when loaded
  const currentDisplayName = profile?.display_name ?? ''
  if (!isEditing && displayName !== currentDisplayName && !isLoadingProfile) {
    setDisplayName(currentDisplayName)
  }

  // Validation
  const isDisplayNameTooLong = displayName.length > 100
  const hasDisplayNameChanged = displayName !== currentDisplayName

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setSuccessMessage(null)

    if (isDisplayNameTooLong) {
      setFormError('Display name must be 100 characters or less')
      return
    }

    if (!hasDisplayNameChanged) {
      return
    }

    try {
      setIsEditing(true)
      await updateProfile({ display_name: displayName })
      setSuccessMessage('Profile updated')
      setIsEditing(false)

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch {
      setFormError('Unable to save changes. Please try again.')
      setIsEditing(false)
    }
  }

  const handleAvatarUpload = async (file: File) => {
    setSuccessMessage(null)
    const url = await uploadAvatar(file)
    setSuccessMessage('Avatar updated')

    // Clear success message after 3 seconds
    setTimeout(() => setSuccessMessage(null), 3000)

    return url
  }

  // Loading skeleton
  if (isLoadingProfile) {
    return (
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-3xl">
          <SettingsHeader title="Profile" />
          <div className="space-y-8">
            {/* Avatar skeleton */}
            <div className="flex flex-col items-center space-y-3">
              <div className="h-24 w-24 animate-pulse rounded-full bg-[#1a1a1f]" />
              <div className="h-4 w-32 animate-pulse rounded bg-[#1a1a1f]" />
            </div>
            {/* Form skeleton */}
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="h-4 w-24 animate-pulse rounded bg-[#1a1a1f]" />
                <div className="h-12 w-full animate-pulse rounded-lg bg-[#1a1a1f]" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-16 animate-pulse rounded bg-[#1a1a1f]" />
                <div className="h-12 w-full animate-pulse rounded-lg bg-[#1a1a1f]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Error state when profile fails to load
  if (profileError) {
    return (
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-3xl">
          <SettingsHeader title="Profile" />
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#1a1a1f]">
              <AlertCircle className="h-10 w-10 text-red-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-medium text-white">Unable to load profile</h2>
              <p className="text-sm text-gray-400">
                Something went wrong while loading your profile. Please try again.
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="min-h-[44px] rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-3xl">
        <SettingsHeader title="Profile" />
        {/* Avatar Upload Section */}
        <AvatarUpload
          currentAvatarUrl={profile?.avatar_url ?? null}
          onUpload={handleAvatarUpload}
          isUploading={isUploadingAvatar}
          error={uploadAvatarError}
        />

        {/* Profile Form */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        {/* Display Name Input */}
        <div className="space-y-2">
          <label
            htmlFor="displayName"
            className="block text-sm font-medium text-gray-300"
          >
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value)
              setIsEditing(true)
            }}
            placeholder="Enter your display name"
            maxLength={101} // Allow 1 over to trigger validation message
            disabled={isUpdatingProfile}
            aria-describedby={isDisplayNameTooLong ? displayNameErrorId : undefined}
            aria-invalid={isDisplayNameTooLong}
            className="w-full px-4 py-3 bg-[#1a1a1f] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {isDisplayNameTooLong && (
            <p
              id={displayNameErrorId}
              className="text-sm text-amber-400"
              role="alert"
            >
              Display name must be 100 characters or less
            </p>
          )}
          <p className="text-xs text-gray-500">
            {displayName.length}/100 characters
          </p>
        </div>

        {/* Email (read-only) */}
        <div className="space-y-2">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-300"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={userEmail ?? ''}
            readOnly
            disabled
            className="w-full px-4 py-3 bg-[#1a1a1f]/50 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
          />
          <p className="text-xs text-gray-500">
            Email cannot be changed
          </p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div
            id={formSuccessId}
            className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg"
            role="status"
            aria-live="polite"
          >
            <p className="text-sm text-green-400">{successMessage}</p>
          </div>
        )}

        {/* Error Message */}
        {(formError || updateProfileError) && (
          <div
            className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
            role="alert"
          >
            <p className="text-sm text-red-400">
              {formError || 'Unable to save changes. Please try again.'}
            </p>
          </div>
        )}

        {/* Submit Button - Minimum 44x44px touch target */}
        <button
          type="submit"
          disabled={
            isUpdatingProfile ||
            isDisplayNameTooLong ||
            !hasDisplayNameChanged
          }
          aria-label={isUpdatingProfile ? 'Saving profile' : 'Save changes'}
          className="w-full min-h-[44px] py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#141414] disabled:cursor-not-allowed"
        >
          {isUpdatingProfile ? (
            // Skeleton loading state
            <div className="flex items-center justify-center space-x-2">
              <div className="w-4 h-4 bg-white/30 rounded-full animate-pulse" />
              <div className="w-16 h-4 bg-white/30 rounded animate-pulse" />
            </div>
          ) : (
            'Save Changes'
          )}
          </button>
        </form>
      </div>
    </div>
  )
}
