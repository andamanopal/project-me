import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PreferencesPage from '@/app/(dashboard)/settings/preferences/page'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}))

// Mock useProfile hook
const mockUpdatePreferences = jest.fn()
const mockUseProfile: {
  profile: {
    id: string
    display_name: string | null
    avatar_url: string | null
    preferred_check_in_time: string | null
    proactive_enabled: boolean
    proactive_frequency: string | null
    timezone: string | null
    created_at: string
    updated_at: string
  } | null
  isLoadingProfile: boolean
  profileError: Error | null
  userEmail: string
  updateProfile: jest.Mock
  isUpdatingProfile: boolean
  updateProfileError: Error | null
  uploadAvatar: jest.Mock
  isUploadingAvatar: boolean
  uploadAvatarError: Error | null
  updatePreferences: jest.Mock
  isUpdatingPreferences: boolean
  updatePreferencesError: Error | null
} = {
  profile: {
    id: 'test-user-id',
    display_name: 'Test User',
    avatar_url: null,
    preferred_check_in_time: '19:00:00',
    proactive_enabled: true,
    proactive_frequency: 'daily',
    timezone: 'Asia/Bangkok',
    created_at: '2025-12-31T00:00:00Z',
    updated_at: '2025-12-31T00:00:00Z',
  },
  isLoadingProfile: false,
  profileError: null,
  userEmail: 'test@example.com',
  updateProfile: jest.fn(),
  isUpdatingProfile: false,
  updateProfileError: null,
  uploadAvatar: jest.fn(),
  isUploadingAvatar: false,
  uploadAvatarError: null,
  updatePreferences: mockUpdatePreferences,
  isUpdatingPreferences: false,
  updatePreferencesError: null,
}

jest.mock('@/hooks/useProfile', () => ({
  useProfile: () => mockUseProfile,
}))

// Helper to wrap component with providers
const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>{component}</QueryClientProvider>
  )
}

describe('PreferencesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset mock state
    mockUseProfile.isLoadingProfile = false
    mockUseProfile.isUpdatingPreferences = false
    mockUseProfile.profileError = null
    mockUseProfile.updatePreferencesError = null
    mockUseProfile.profile = {
      id: 'test-user-id',
      display_name: 'Test User',
      avatar_url: null,
      preferred_check_in_time: '19:00:00',
      proactive_enabled: true,
      proactive_frequency: 'daily',
      timezone: 'Asia/Bangkok',
      created_at: '2025-12-31T00:00:00Z',
      updated_at: '2025-12-31T00:00:00Z',
    }
  })

  describe('AC3: View Current Preferences', () => {
    it('renders preferences page with current values pre-filled', () => {
      renderWithProviders(<PreferencesPage />)

      // Time picker shows current value
      const timeInput = screen.getByLabelText(/preferred check-in time/i)
      expect(timeInput).toHaveValue('19:00')

      // Proactive toggle is on
      const toggle = screen.getByRole('switch')
      expect(toggle).toHaveAttribute('aria-checked', 'true')

      // Frequency shows daily selected
      const dailyRadio = screen.getByRole('radio', { name: /every day/i })
      expect(dailyRadio).toBeChecked()
    })

    it('shows skeleton loading states while fetching', () => {
      mockUseProfile.isLoadingProfile = true

      renderWithProviders(<PreferencesPage />)

      // Should see skeleton elements (animate-pulse)
      const skeletons = document.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    it('shows error state when profile fails to load', () => {
      mockUseProfile.profileError = new Error('Network error')

      renderWithProviders(<PreferencesPage />)

      expect(screen.getByText(/unable to load preferences/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })

  describe('AC1: Set Preferred Check-in Time', () => {
    it('allows changing check-in time', () => {
      renderWithProviders(<PreferencesPage />)

      const timeInput = screen.getByLabelText(/preferred check-in time/i)
      fireEvent.change(timeInput, { target: { value: '08:00' } })

      expect(timeInput).toHaveValue('08:00')
    })

    it('calls updatePreferences with new time on form submission', async () => {
      mockUpdatePreferences.mockResolvedValueOnce(undefined)

      renderWithProviders(<PreferencesPage />)

      // Change time
      const timeInput = screen.getByLabelText(/preferred check-in time/i)
      fireEvent.change(timeInput, { target: { value: '08:00' } })

      // Submit form
      const submitButton = screen.getByRole('button', { name: /save preferences/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockUpdatePreferences).toHaveBeenCalledWith(
          expect.objectContaining({
            preferred_check_in_time: '08:00',
          })
        )
      })
    })

    it('shows success confirmation after saving', async () => {
      mockUpdatePreferences.mockResolvedValueOnce(undefined)

      renderWithProviders(<PreferencesPage />)

      // Change time
      const timeInput = screen.getByLabelText(/preferred check-in time/i)
      fireEvent.change(timeInput, { target: { value: '08:00' } })

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: /save preferences/i }))

      await waitFor(() => {
        expect(screen.getByText(/preferences saved/i)).toBeInTheDocument()
      })
    })
  })

  describe('AC2: Set Proactive Message Frequency', () => {
    it('allows selecting frequency options', () => {
      renderWithProviders(<PreferencesPage />)

      // Click weekly option
      const weeklyRadio = screen.getByRole('radio', { name: /once a week/i })
      fireEvent.click(weeklyRadio)

      expect(weeklyRadio).toBeChecked()
    })

    it('calls updatePreferences with new frequency on form submission', async () => {
      mockUpdatePreferences.mockResolvedValueOnce(undefined)

      renderWithProviders(<PreferencesPage />)

      // Select weekly
      fireEvent.click(screen.getByRole('radio', { name: /once a week/i }))

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: /save preferences/i }))

      await waitFor(() => {
        expect(mockUpdatePreferences).toHaveBeenCalledWith(
          expect.objectContaining({
            proactive_frequency: 'weekly',
          })
        )
      })
    })
  })

  describe('AC4: Timezone Awareness', () => {
    it('displays timezone information', () => {
      renderWithProviders(<PreferencesPage />)

      // Should show timezone info
      expect(screen.getByText(/your timezone/i)).toBeInTheDocument()
    })

    it('includes timezone in save request', async () => {
      mockUpdatePreferences.mockResolvedValueOnce(undefined)

      renderWithProviders(<PreferencesPage />)

      // Change time to trigger a change
      const timeInput = screen.getByLabelText(/preferred check-in time/i)
      fireEvent.change(timeInput, { target: { value: '08:00' } })

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: /save preferences/i }))

      await waitFor(() => {
        expect(mockUpdatePreferences).toHaveBeenCalledWith(
          expect.objectContaining({
            timezone: expect.any(String),
          })
        )
      })
    })
  })

  describe('AC5: Error Handling', () => {
    it('shows error message when update fails', async () => {
      mockUpdatePreferences.mockRejectedValueOnce(new Error('Network error'))

      renderWithProviders(<PreferencesPage />)

      // Change time
      const timeInput = screen.getByLabelText(/preferred check-in time/i)
      fireEvent.change(timeInput, { target: { value: '08:00' } })

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: /save preferences/i }))

      await waitFor(() => {
        expect(
          screen.getByText(/unable to save preferences\. please try again\./i)
        ).toBeInTheDocument()
      })
    })

    it('reverts UI state on error (optimistic rollback behavior)', async () => {
      // This tests that the UI can accept new input after an error
      mockUpdatePreferences.mockRejectedValueOnce(new Error('Network error'))

      renderWithProviders(<PreferencesPage />)

      // Change time
      const timeInput = screen.getByLabelText(/preferred check-in time/i)
      fireEvent.change(timeInput, { target: { value: '08:00' } })

      // Submit form - should fail
      fireEvent.click(screen.getByRole('button', { name: /save preferences/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      // UI should still allow interaction - change can be retried
      fireEvent.change(timeInput, { target: { value: '09:00' } })
      expect(timeInput).toHaveValue('09:00')
    })

    it('error message has role="alert"', async () => {
      mockUpdatePreferences.mockRejectedValueOnce(new Error('Network error'))

      renderWithProviders(<PreferencesPage />)

      // Change time
      fireEvent.change(screen.getByLabelText(/preferred check-in time/i), {
        target: { value: '08:00' },
      })

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: /save preferences/i }))

      await waitFor(() => {
        const alert = screen.getByRole('alert')
        expect(alert).toBeInTheDocument()
      })
    })
  })

  describe('Proactive Toggle (Task 4)', () => {
    it('renders proactive toggle', () => {
      renderWithProviders(<PreferencesPage />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toBeInTheDocument()
    })

    it('calls updatePreferences with proactive_enabled on form submission', async () => {
      mockUpdatePreferences.mockResolvedValueOnce(undefined)

      renderWithProviders(<PreferencesPage />)

      // Toggle off (currently true by default)
      const toggle = screen.getByRole('switch')
      fireEvent.click(toggle)

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: /save preferences/i }))

      await waitFor(() => {
        expect(mockUpdatePreferences).toHaveBeenCalledWith(
          expect.objectContaining({
            proactive_enabled: false,
          })
        )
      })
    })

    it('toggles proactive enabled state', () => {
      renderWithProviders(<PreferencesPage />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toHaveAttribute('aria-checked', 'true')

      fireEvent.click(toggle)

      expect(toggle).toHaveAttribute('aria-checked', 'false')
    })

    it('disables time and frequency inputs when proactive is off', () => {
      renderWithProviders(<PreferencesPage />)

      // Toggle off
      const toggle = screen.getByRole('switch')
      fireEvent.click(toggle)

      // Time input should be disabled
      const timeInput = screen.getByLabelText(/preferred check-in time/i)
      expect(timeInput).toBeDisabled()

      // Daily and weekly options should be disabled, but "off" should not be
      const dailyRadio = screen.getByRole('radio', { name: /every day/i })
      const weeklyRadio = screen.getByRole('radio', { name: /once a week/i })
      const offRadio = screen.getByRole('radio', { name: /off.*don't send/i })

      expect(dailyRadio).toBeDisabled()
      expect(weeklyRadio).toBeDisabled()
      expect(offRadio).not.toBeDisabled()
    })

    it('sets frequency to "off" when toggle is disabled', () => {
      renderWithProviders(<PreferencesPage />)

      // Toggle off
      fireEvent.click(screen.getByRole('switch'))

      // Off option should be selected
      const offRadio = screen.getByRole('radio', { name: /off.*don't send/i })
      expect(offRadio).toBeChecked()
    })
  })

  describe('Loading States', () => {
    it('shows loading state while saving', () => {
      mockUseProfile.isUpdatingPreferences = true

      renderWithProviders(<PreferencesPage />)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-label', 'Saving preferences')
    })

    it('disables inputs while saving', () => {
      mockUseProfile.isUpdatingPreferences = true

      renderWithProviders(<PreferencesPage />)

      expect(screen.getByLabelText(/preferred check-in time/i)).toBeDisabled()
      expect(screen.getByRole('switch')).toBeDisabled()
    })
  })

  describe('Accessibility', () => {
    it('has proper role="switch" for toggle', () => {
      renderWithProviders(<PreferencesPage />)

      const toggle = screen.getByRole('switch')
      expect(toggle).toHaveAttribute('aria-checked')
    })

    it('has proper role="radiogroup" for frequency options', () => {
      renderWithProviders(<PreferencesPage />)

      const radiogroup = screen.getByRole('radiogroup')
      expect(radiogroup).toBeInTheDocument()
    })

    it('success message has role="status"', async () => {
      mockUpdatePreferences.mockResolvedValueOnce(undefined)

      renderWithProviders(<PreferencesPage />)

      // Change and submit
      fireEvent.change(screen.getByLabelText(/preferred check-in time/i), {
        target: { value: '08:00' },
      })
      fireEvent.click(screen.getByRole('button', { name: /save preferences/i }))

      await waitFor(() => {
        const status = screen.getByRole('status')
        expect(status).toBeInTheDocument()
      })
    })

    it('save button has aria-label during loading', () => {
      mockUseProfile.isUpdatingPreferences = true

      renderWithProviders(<PreferencesPage />)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-label', 'Saving preferences')
    })
  })

  describe('Form Behavior', () => {
    it('disables save button when no changes made', () => {
      renderWithProviders(<PreferencesPage />)

      const submitButton = screen.getByRole('button', { name: /save preferences/i })
      expect(submitButton).toBeDisabled()
    })

    it('enables save button when changes are made', () => {
      renderWithProviders(<PreferencesPage />)

      // Change time
      fireEvent.change(screen.getByLabelText(/preferred check-in time/i), {
        target: { value: '08:00' },
      })

      const submitButton = screen.getByRole('button', { name: /save preferences/i })
      expect(submitButton).not.toBeDisabled()
    })
  })
})
