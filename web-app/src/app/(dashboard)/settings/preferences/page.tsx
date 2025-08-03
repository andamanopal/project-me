'use client'

import { useState, useId, useEffect, useMemo, useRef, type FormEvent } from 'react'
import { useProfile } from '@/hooks/useProfile'
import { SettingsHeader } from '@/components/navigation/SettingsHeader'

// Frequency options
const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Every day', description: 'Get daily check-in reminders' },
  { value: 'weekly', label: 'Once a week', description: 'Get weekly check-in reminders' },
  { value: 'off', label: 'Off', description: "Don't send proactive messages" },
] as const

/**
 * Get user's local timezone information
 */
function getTimezoneInfo(): { timezone: string; displayName: string } {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  // Get friendly display name like "GMT+7"
  const displayName =
    new Intl.DateTimeFormat('en', {
      timeZoneName: 'short',
      timeZone: timezone,
    })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value || timezone

  return { timezone, displayName }
}

/**
 * Preferences page for configuring notification settings.
 * Features:
 * - Set preferred check-in time with timezone awareness
 * - Set proactive message frequency (daily/weekly/off)
 * - Master toggle for proactive messages
 * - Dark theme with mobile-first design
 * - Skeleton loading states
 * - Accessible form controls
 */
export default function PreferencesPage() {
  const {
    profile,
    isLoadingProfile,
    profileError,
    updatePreferences,
    isUpdatingPreferences,
    updatePreferencesError,
  } = useProfile()

  // Local state
  const [checkInTime, setCheckInTime] = useState('19:00')
  const [proactiveEnabled, setProactiveEnabled] = useState(true)
  const [proactiveFrequency, setProactiveFrequency] = useState<string>('daily')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // Ref for timeout cleanup
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Accessibility IDs
  const timeErrorId = useId()
  const formSuccessId = useId()

  // Memoize timezone info to avoid recalculation every render
  const { timezone, displayName: timezoneDisplay } = useMemo(() => getTimezoneInfo(), [])

  // Sync local state from profile when loaded
  useEffect(() => {
    if (profile && !isLoadingProfile) {
      if (profile.preferred_check_in_time) {
        // Convert from database TIME format (HH:mm:ss) to input format (HH:mm)
        setCheckInTime(profile.preferred_check_in_time.slice(0, 5))
      }
      if (profile.proactive_enabled !== undefined) {
        setProactiveEnabled(profile.proactive_enabled)
      }
      if (profile.proactive_frequency) {
        setProactiveFrequency(profile.proactive_frequency)
      }
    }
  }, [profile, isLoadingProfile])

  // Track changes - computed directly, no need for separate state
  const hasTimeChanged = profile?.preferred_check_in_time?.slice(0, 5) !== checkInTime
  const hasEnabledChanged = profile?.proactive_enabled !== proactiveEnabled
  const hasFrequencyChanged = profile?.proactive_frequency !== proactiveFrequency
  const hasTimezoneChanged = profile?.timezone !== timezone
  const hasUnsavedChanges =
    hasTimeChanged || hasEnabledChanged || hasFrequencyChanged || hasTimezoneChanged

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
    }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setSuccessMessage(null)

    if (!hasUnsavedChanges) {
      return
    }

    try {
      await updatePreferences({
        preferred_check_in_time: checkInTime,
        proactive_enabled: proactiveEnabled,
        proactive_frequency: proactiveFrequency,
        timezone: timezone,
      })
      setSuccessMessage('Preferences saved')

      // Clear success message after 3 seconds (with cleanup)
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
      successTimeoutRef.current = setTimeout(() => setSuccessMessage(null), 3000)
    } catch {
      setFormError('Unable to save preferences. Please try again.')
    }
  }

  // Handle toggle change - also update frequency if disabling
  const handleToggleChange = (enabled: boolean) => {
    setProactiveEnabled(enabled)
    if (!enabled) {
      setProactiveFrequency('off')
    } else if (proactiveFrequency === 'off') {
      setProactiveFrequency('daily')
    }
  }

  // Loading skeleton
  if (isLoadingProfile) {
    return (
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-3xl">
          <SettingsHeader title="Preferences" />
          <div className="space-y-8">
            {/* Toggle skeleton */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="w-40 h-4 bg-[#1a1a1f] rounded animate-pulse" />
              <div className="w-56 h-3 bg-[#1a1a1f] rounded animate-pulse" />
            </div>
            <div className="w-12 h-6 bg-[#1a1a1f] rounded-full animate-pulse" />
          </div>
        </div>

        {/* Time picker skeleton */}
        <div className="space-y-2">
          <div className="w-32 h-4 bg-[#1a1a1f] rounded animate-pulse" />
          <div className="w-full h-12 bg-[#1a1a1f] rounded-lg animate-pulse" />
          <div className="w-24 h-3 bg-[#1a1a1f] rounded animate-pulse" />
        </div>

        {/* Frequency skeleton */}
        <div className="space-y-3">
          <div className="w-36 h-4 bg-[#1a1a1f] rounded animate-pulse" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-full h-16 bg-[#1a1a1f] rounded-lg animate-pulse" />
            ))}
          </div>
        </div>

        {/* Button skeleton */}
        <div className="w-full h-12 bg-[#1a1a1f] rounded-lg animate-pulse" />
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
          <SettingsHeader title="Preferences" />
          <div className="space-y-6 text-center">
            <div className="w-24 h-24 bg-[#1a1a1f] rounded-full mx-auto flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-red-400"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-medium text-white">Unable to load preferences</h2>
              <p className="text-sm text-gray-400">
                Something went wrong while loading your preferences. Please try again.
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
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
        <SettingsHeader title="Preferences" />
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Proactive Messages Toggle */}
        <div className="flex items-center justify-between p-4 bg-[#1a1a1f]/50 rounded-lg">
          <div className="space-y-1">
            <label
              htmlFor="proactiveEnabled"
              className="block text-base font-medium text-white cursor-pointer"
            >
              Proactive Messages
            </label>
            <p className="text-sm text-gray-400">
              Receive gentle check-in reminders
            </p>
          </div>
          <button
            id="proactiveEnabled"
            type="button"
            role="switch"
            aria-checked={proactiveEnabled}
            onClick={() => handleToggleChange(!proactiveEnabled)}
            disabled={isUpdatingPreferences}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#141414] disabled:opacity-50 disabled:cursor-not-allowed ${
              proactiveEnabled ? 'bg-blue-600' : 'bg-gray-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                proactiveEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Check-in Time Input */}
        <div className="space-y-2">
          <label
            htmlFor="checkInTime"
            className="block text-sm font-medium text-gray-300"
          >
            Preferred Check-in Time
          </label>
          <input
            id="checkInTime"
            type="time"
            value={checkInTime}
            onChange={(e) => setCheckInTime(e.target.value)}
            disabled={isUpdatingPreferences || !proactiveEnabled}
            aria-describedby={timeErrorId}
            className="w-full px-4 py-3 bg-[#1a1a1f] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p id={timeErrorId} className="text-xs text-gray-500">
            Your timezone: {timezone} ({timezoneDisplay})
          </p>
        </div>

        {/* Frequency Options */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-300">
            Message Frequency
          </label>
          <div
            role="radiogroup"
            aria-label="Message frequency options"
            className="space-y-2"
          >
            {FREQUENCY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex items-start p-4 rounded-lg border cursor-pointer transition-colors ${
                  proactiveFrequency === option.value
                    ? 'bg-blue-600/10 border-blue-500'
                    : 'bg-[#1a1a1f]/50 border-gray-600 hover:border-gray-500'
                } ${
                  !proactiveEnabled && option.value !== 'off'
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
              >
                <input
                  type="radio"
                  name="frequency"
                  value={option.value}
                  checked={proactiveFrequency === option.value}
                  onChange={(e) => setProactiveFrequency(e.target.value)}
                  disabled={
                    isUpdatingPreferences ||
                    (!proactiveEnabled && option.value !== 'off')
                  }
                  className="mt-1 h-4 w-4 text-blue-600 border-gray-500 focus:ring-blue-500 focus:ring-offset-[#141414]"
                />
                <div className="ml-3">
                  <span className="block text-white font-medium">
                    {option.label}
                  </span>
                  <span className="block text-sm text-gray-400">
                    {option.description}
                  </span>
                </div>
              </label>
            ))}
          </div>
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
        {(formError || updatePreferencesError) && (
          <div
            className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
            role="alert"
          >
            <p className="text-sm text-red-400">
              {formError || 'Unable to save preferences. Please try again.'}
            </p>
          </div>
        )}

        {/* Submit Button - Minimum 44x44px touch target */}
        <button
          type="submit"
          disabled={isUpdatingPreferences || !hasUnsavedChanges}
          aria-label={isUpdatingPreferences ? 'Saving preferences' : 'Save preferences'}
          className="w-full min-h-[44px] py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#141414] disabled:cursor-not-allowed"
        >
          {isUpdatingPreferences ? (
            // Skeleton loading state
            <div className="flex items-center justify-center space-x-2">
              <div className="w-4 h-4 bg-white/30 rounded-full animate-pulse" />
              <div className="w-16 h-4 bg-white/30 rounded animate-pulse" />
            </div>
          ) : (
            'Save Preferences'
          )}
        </button>
      </form>
      </div>
    </div>
  )
}
