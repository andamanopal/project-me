import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProfilePage from '@/app/(dashboard)/settings/profile/page'

// Mock URL.createObjectURL for JSDOM
global.URL.createObjectURL = jest.fn(() => 'blob:test-url')
global.URL.revokeObjectURL = jest.fn()

// Mock next/navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock useAuth hook
const mockUseAuth = {
  user: { id: 'test-user-id', email: 'test@example.com' },
  isPending: false,
  error: null,
  signUp: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  resetPassword: jest.fn(),
  updatePassword: jest.fn(),
  isSigningUp: false,
  isSigningIn: false,
  isSigningOut: false,
  isResettingPassword: false,
  isUpdatingPassword: false,
}

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth,
}))

// Mock useProfile hook
const mockUpdateProfile = jest.fn()
const mockUploadAvatar = jest.fn()
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
} = {
  profile: {
    id: 'test-user-id',
    display_name: 'Test User',
    avatar_url: 'https://example.com/avatar.jpg',
    preferred_check_in_time: null,
    proactive_enabled: true,
    proactive_frequency: 'daily',
    timezone: 'Asia/Bangkok',
    created_at: '2025-12-31T00:00:00Z',
    updated_at: '2025-12-31T00:00:00Z',
  },
  isLoadingProfile: false,
  profileError: null,
  userEmail: 'test@example.com',
  updateProfile: mockUpdateProfile,
  isUpdatingProfile: false,
  updateProfileError: null,
  uploadAvatar: mockUploadAvatar,
  isUploadingAvatar: false,
  uploadAvatarError: null,
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

describe('ProfilePage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset mock state
    mockUseProfile.isLoadingProfile = false
    mockUseProfile.isUpdatingProfile = false
    mockUseProfile.isUploadingAvatar = false
    mockUseProfile.profileError = null
    mockUseProfile.updateProfileError = null
    mockUseProfile.uploadAvatarError = null
    mockUseProfile.profile = {
      id: 'test-user-id',
      display_name: 'Test User',
      avatar_url: 'https://example.com/avatar.jpg',
      preferred_check_in_time: null,
      proactive_enabled: true,
      proactive_frequency: 'daily',
      timezone: 'Asia/Bangkok',
      created_at: '2025-12-31T00:00:00Z',
      updated_at: '2025-12-31T00:00:00Z',
    }
  })

  describe('AC1: View Current Profile', () => {
    it('renders profile page with display name', () => {
      renderWithProviders(<ProfilePage />)

      expect(screen.getByLabelText(/display name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/display name/i)).toHaveValue('Test User')
    })

    it('renders email as read-only', () => {
      renderWithProviders(<ProfilePage />)

      const emailInput = screen.getByLabelText(/email/i)
      expect(emailInput).toBeInTheDocument()
      expect(emailInput).toHaveValue('test@example.com')
      expect(emailInput).toHaveAttribute('readonly')
      expect(emailInput).toBeDisabled()
    })

    it('renders current avatar', () => {
      renderWithProviders(<ProfilePage />)

      const avatar = screen.getByAltText(/profile avatar/i)
      expect(avatar).toBeInTheDocument()
      expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.jpg')
    })

    it('shows placeholder when no display name set', () => {
      mockUseProfile.profile = {
        ...mockUseProfile.profile!,
        display_name: null,
      }

      renderWithProviders(<ProfilePage />)

      expect(screen.getByLabelText(/display name/i)).toHaveValue('')
      expect(
        screen.getByPlaceholderText(/enter your display name/i)
      ).toBeInTheDocument()
    })

    it('shows default avatar when no avatar_url', () => {
      mockUseProfile.profile = {
        ...mockUseProfile.profile!,
        avatar_url: null,
      }

      renderWithProviders(<ProfilePage />)

      // Should show placeholder icon (no img element with avatar alt text should exist)
      expect(screen.queryByAltText(/profile avatar/i)).not.toBeInTheDocument()
    })
  })

  describe('AC2: Update Display Name', () => {
    it('calls updateProfile with new display name on form submission', async () => {
      mockUpdateProfile.mockResolvedValueOnce({ display_name: 'New Name' })

      renderWithProviders(<ProfilePage />)

      const displayNameInput = screen.getByLabelText(/display name/i)
      fireEvent.change(displayNameInput, { target: { value: 'New Name' } })
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith({
          display_name: 'New Name',
        })
      })
    })

    it('shows success confirmation after update', async () => {
      mockUpdateProfile.mockResolvedValueOnce({ display_name: 'New Name' })

      renderWithProviders(<ProfilePage />)

      fireEvent.change(screen.getByLabelText(/display name/i), {
        target: { value: 'New Name' },
      })
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

      await waitFor(() => {
        expect(screen.getByText(/profile updated/i)).toBeInTheDocument()
      })
    })

    it('disables save button when display name unchanged', () => {
      renderWithProviders(<ProfilePage />)

      // Button should be disabled when no changes made
      expect(
        screen.getByRole('button', { name: /save changes/i })
      ).toBeDisabled()
    })

    it('enables save button when display name changed', () => {
      renderWithProviders(<ProfilePage />)

      fireEvent.change(screen.getByLabelText(/display name/i), {
        target: { value: 'Different Name' },
      })

      expect(
        screen.getByRole('button', { name: /save changes/i })
      ).not.toBeDisabled()
    })
  })

  describe('AC3: Upload New Avatar', () => {
    it('triggers file input when avatar button is clicked', () => {
      renderWithProviders(<ProfilePage />)

      const avatarButton = screen.getByRole('button', {
        name: /click to change avatar/i,
      })
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement

      // Spy on click
      const clickSpy = jest.spyOn(fileInput, 'click')

      fireEvent.click(avatarButton)

      expect(clickSpy).toHaveBeenCalled()
      clickSpy.mockRestore()
    })

    it('calls uploadAvatar when file is selected', async () => {
      mockUploadAvatar.mockResolvedValueOnce('https://example.com/new-avatar.jpg')

      renderWithProviders(<ProfilePage />)

      // Create a valid file with proper size
      const file = new File(['avatar-content'], 'avatar.png', { type: 'image/png' })
      Object.defineProperty(file, 'size', { value: 1024 }) // 1KB

      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(
        () => {
          expect(mockUploadAvatar).toHaveBeenCalled()
        },
        { timeout: 3000 }
      )
    })

    it('shows success confirmation after avatar upload', async () => {
      mockUploadAvatar.mockResolvedValueOnce('https://example.com/new-avatar.jpg')

      renderWithProviders(<ProfilePage />)

      // Create a valid file with proper size
      const file = new File(['avatar-content'], 'avatar.png', { type: 'image/png' })
      Object.defineProperty(file, 'size', { value: 1024 }) // 1KB

      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(
        () => {
          expect(screen.getByText(/avatar updated/i)).toBeInTheDocument()
        },
        { timeout: 3000 }
      )
    })
  })

  describe('AC4: Avatar Validation', () => {
    it('shows error for invalid file type', async () => {
      renderWithProviders(<ProfilePage />)

      const file = new File(['avatar'], 'avatar.gif', { type: 'image/gif' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => {
        expect(
          screen.getByText(/please select a jpeg or png image/i)
        ).toBeInTheDocument()
      })
    })

    it('shows error for oversized file', async () => {
      renderWithProviders(<ProfilePage />)

      // Create a file > 2MB
      const largeContent = new Array(3 * 1024 * 1024).fill('a').join('')
      const file = new File([largeContent], 'avatar.png', { type: 'image/png' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => {
        expect(
          screen.getByText(/image must be smaller than 2mb/i)
        ).toBeInTheDocument()
      })
    })

    it('prevents upload when file is invalid', async () => {
      renderWithProviders(<ProfilePage />)

      const file = new File(['avatar'], 'avatar.gif', { type: 'image/gif' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => {
        expect(mockUploadAvatar).not.toHaveBeenCalled()
      })
    })
  })

  describe('AC5: Error Handling', () => {
    it('shows error state when profile fails to load', () => {
      mockUseProfile.profileError = new Error('Network error')

      renderWithProviders(<ProfilePage />)

      expect(screen.getByText(/unable to load profile/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })

    it('shows error message when profile update fails', async () => {
      mockUpdateProfile.mockRejectedValueOnce(new Error('Network error'))

      renderWithProviders(<ProfilePage />)

      fireEvent.change(screen.getByLabelText(/display name/i), {
        target: { value: 'New Name' },
      })
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

      await waitFor(() => {
        expect(
          screen.getByText(/unable to save changes/i)
        ).toBeInTheDocument()
      })
    })

    it('shows error message when avatar upload fails', async () => {
      // Set up the error state that the hook would return after a failed upload
      mockUseProfile.uploadAvatarError = new Error('Storage error')

      renderWithProviders(<ProfilePage />)

      // Error should be displayed via the uploadAvatarError prop
      expect(screen.getByText(/storage error/i)).toBeInTheDocument()
    })
  })

  describe('Loading States', () => {
    it('shows loading skeleton while fetching profile', () => {
      mockUseProfile.isLoadingProfile = true

      renderWithProviders(<ProfilePage />)

      // Should show skeleton elements (animate-pulse)
      const skeletons = document.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    it('shows loading state while updating profile', () => {
      mockUseProfile.isUpdatingProfile = true

      renderWithProviders(<ProfilePage />)

      // Use the submit button specifically (type="submit")
      const submitButton = screen.getByRole('button', { name: /saving profile/i })
      expect(submitButton).toBeDisabled()
      expect(submitButton).toHaveAttribute('aria-label', 'Saving profile')
    })

    it('shows uploading state on avatar', () => {
      mockUseProfile.isUploadingAvatar = true

      renderWithProviders(<ProfilePage />)

      expect(screen.getByText(/uploading/i)).toBeInTheDocument()
    })

    it('disables input while updating', () => {
      mockUseProfile.isUpdatingProfile = true

      renderWithProviders(<ProfilePage />)

      expect(screen.getByLabelText(/display name/i)).toBeDisabled()
    })
  })

  describe('Accessibility', () => {
    it('has proper aria-describedby for display name error', () => {
      renderWithProviders(<ProfilePage />)

      const input = screen.getByLabelText(/display name/i)

      // Type more than 100 characters
      const longName = 'a'.repeat(101)
      fireEvent.change(input, { target: { value: longName } })

      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input).toHaveAttribute('aria-describedby')
    })

    it('error messages have role="alert"', () => {
      renderWithProviders(<ProfilePage />)

      const input = screen.getByLabelText(/display name/i)
      const longName = 'a'.repeat(101)
      fireEvent.change(input, { target: { value: longName } })

      const errorMessage = screen.getByText(
        /display name must be 100 characters or less/i
      )
      expect(errorMessage).toHaveAttribute('role', 'alert')
    })

    it('success messages have role="status"', async () => {
      mockUpdateProfile.mockResolvedValueOnce({ display_name: 'New Name' })

      renderWithProviders(<ProfilePage />)

      fireEvent.change(screen.getByLabelText(/display name/i), {
        target: { value: 'New Name' },
      })
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

      await waitFor(() => {
        const successMessage = screen.getByText(/profile updated/i)
        expect(successMessage.closest('[role="status"]')).toBeInTheDocument()
      })
    })

    it('avatar button has accessible label', () => {
      renderWithProviders(<ProfilePage />)

      const avatarButton = screen.getByRole('button', {
        name: /click to change avatar/i,
      })
      expect(avatarButton).toBeInTheDocument()
    })
  })

  describe('Display Name Validation', () => {
    it('shows character count', () => {
      renderWithProviders(<ProfilePage />)

      expect(screen.getByText(/9\/100 characters/i)).toBeInTheDocument()
    })

    it('shows error when display name exceeds 100 characters', () => {
      renderWithProviders(<ProfilePage />)

      const input = screen.getByLabelText(/display name/i)
      const longName = 'a'.repeat(101)
      fireEvent.change(input, { target: { value: longName } })

      expect(
        screen.getByText(/display name must be 100 characters or less/i)
      ).toBeInTheDocument()
    })

    it('disables save button when display name too long', () => {
      renderWithProviders(<ProfilePage />)

      const input = screen.getByLabelText(/display name/i)
      const longName = 'a'.repeat(101)
      fireEvent.change(input, { target: { value: longName } })

      expect(
        screen.getByRole('button', { name: /save changes/i })
      ).toBeDisabled()
    })
  })
})
