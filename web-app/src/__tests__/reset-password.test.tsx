import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ResetPasswordPage from '@/app/(auth)/reset-password/page'

// Mock next/navigation
const mockPush = jest.fn()
let mockSearchParamsData: Record<string, string | null> = {}
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParamsData[key] || null,
  }),
}))

// Mock Supabase client
const mockGetSession = jest.fn()
jest.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
  }),
}))

// Mock useAuth hook
const mockUpdatePassword = jest.fn()
let mockIsUpdatingPassword = false

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    updatePassword: mockUpdatePassword,
    isUpdatingPassword: mockIsUpdatingPassword,
    user: null,
    isPending: false,
    error: null,
    signUp: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    resetPassword: jest.fn(),
    isSigningUp: false,
    isSigningIn: false,
    isSigningOut: false,
    isResettingPassword: false,
  }),
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
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  )
}

// Helper to wait for form to be ready (after token check)
const waitForFormReady = async () => {
  // Wait for the heading to appear (not the loading skeleton)
  await screen.findByText(/set new password/i, {}, { timeout: 3000 })
}

// Helper to get password input (more specific to avoid matching "confirm new password")
const getPasswordInput = () => screen.getByLabelText(/^new password$/i)
const getConfirmPasswordInput = () => screen.getByLabelText(/confirm new password/i)

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsUpdatingPassword = false
    mockSearchParamsData = {}
    // Default: valid session (token was accepted)
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } }, error: null })
  })

  describe('AC2: Complete Password Reset', () => {
    it('renders password reset form with password fields', async () => {
      renderWithProviders(<ResetPasswordPage />)
      await waitForFormReady()

      expect(getPasswordInput()).toBeInTheDocument()
      expect(getConfirmPasswordInput()).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument()
    })

    it('calls updatePassword with new password on form submission', async () => {
      mockUpdatePassword.mockResolvedValueOnce(undefined)

      renderWithProviders(<ResetPasswordPage />)
      await waitForFormReady()

      fireEvent.change(getPasswordInput(), { target: { value: 'newpassword123' } })
      fireEvent.change(getConfirmPasswordInput(), { target: { value: 'newpassword123' } })
      fireEvent.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        expect(mockUpdatePassword).toHaveBeenCalledWith({ password: 'newpassword123' })
      })
    })

    it('shows success message and redirects after password update', async () => {
      mockUpdatePassword.mockResolvedValueOnce(undefined)

      renderWithProviders(<ResetPasswordPage />)
      await waitForFormReady()

      fireEvent.change(getPasswordInput(), { target: { value: 'newpassword123' } })
      fireEvent.change(getConfirmPasswordInput(), { target: { value: 'newpassword123' } })
      fireEvent.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        expect(screen.getByText(/password updated/i)).toBeInTheDocument()
      })
    })
  })

  describe('AC4: Password Validation', () => {
    it('shows validation error for password shorter than 8 characters', async () => {
      renderWithProviders(<ResetPasswordPage />)
      await waitForFormReady()

      fireEvent.change(getPasswordInput(), { target: { value: 'short' } })

      // Wait for error message with role="alert" to appear (not the instructional text)
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert')
        const passwordError = alerts.find(el => el.textContent?.includes('Password must be at least 8 characters'))
        expect(passwordError).toBeTruthy()
      })
    })

    it('disables submit button when password is too short', async () => {
      renderWithProviders(<ResetPasswordPage />)
      await waitForFormReady()

      fireEvent.change(getPasswordInput(), { target: { value: 'short' } })
      fireEvent.change(getConfirmPasswordInput(), { target: { value: 'short' } })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reset password/i })).toBeDisabled()
      })
    })

    it('shows error when passwords do not match', async () => {
      renderWithProviders(<ResetPasswordPage />)
      await waitForFormReady()

      fireEvent.change(getPasswordInput(), { target: { value: 'password123' } })
      fireEvent.change(getConfirmPasswordInput(), { target: { value: 'different123' } })

      // Wait for error message to appear
      const errorMessage = await screen.findByText(/passwords do not match/i)
      expect(errorMessage).toBeInTheDocument()
    })

    it('enables submit button when password is valid and matches', async () => {
      renderWithProviders(<ResetPasswordPage />)
      await waitForFormReady()

      fireEvent.change(getPasswordInput(), { target: { value: 'validpassword123' } })
      fireEvent.change(getConfirmPasswordInput(), { target: { value: 'validpassword123' } })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reset password/i })).not.toBeDisabled()
      })
    })
  })

  describe('AC5: Expired Link Handling', () => {
    it('shows expired link error when no valid session', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null })

      renderWithProviders(<ResetPasswordPage />)

      await waitFor(() => {
        expect(screen.getByText(/invalid|already been used/i)).toBeInTheDocument()
      })
    })

    it('shows expired link error from URL params', async () => {
      mockSearchParamsData = {
        error: 'access_denied',
        error_description: 'Token has expired',
      }

      renderWithProviders(<ResetPasswordPage />)

      // Use findByRole to find the heading with "Link expired"
      const heading = await screen.findByRole('heading', { name: /link expired/i })
      expect(heading).toBeInTheDocument()
    })

    it('shows request new link button on expired token', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null })

      renderWithProviders(<ResetPasswordPage />)

      const link = await screen.findByRole('link', { name: /request new reset link/i })
      expect(link).toHaveAttribute('href', '/forgot-password')
    })

    it('shows error when update fails due to expired token', async () => {
      mockUpdatePassword.mockRejectedValueOnce(new Error('Token has expired'))

      renderWithProviders(<ResetPasswordPage />)
      await waitForFormReady()

      fireEvent.change(getPasswordInput(), { target: { value: 'newpassword123' } })
      fireEvent.change(getConfirmPasswordInput(), { target: { value: 'newpassword123' } })
      fireEvent.click(screen.getByRole('button', { name: /reset password/i }))

      // Wait for the error state to show with "Link expired" heading
      const heading = await screen.findByRole('heading', { name: /link expired/i })
      expect(heading).toBeInTheDocument()
    })

    it('shows generic error when update fails for other reasons', async () => {
      mockUpdatePassword.mockRejectedValueOnce(new Error('Network error'))

      renderWithProviders(<ResetPasswordPage />)
      await waitForFormReady()

      fireEvent.change(getPasswordInput(), { target: { value: 'newpassword123' } })
      fireEvent.change(getConfirmPasswordInput(), { target: { value: 'newpassword123' } })
      fireEvent.click(screen.getByRole('button', { name: /reset password/i }))

      // Wait for the generic error message
      const errorMessage = await screen.findByText(/unable to update password/i)
      expect(errorMessage).toBeInTheDocument()
    })
  })

  describe('Loading States', () => {
    it('shows loading skeleton while checking token', () => {
      // Keep the promise pending to simulate loading
      mockGetSession.mockImplementation(() => new Promise(() => {}))

      renderWithProviders(<ResetPasswordPage />)

      // Should show skeleton (animate-pulse elements)
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
    })

    it('shows loading state while updating password', async () => {
      mockIsUpdatingPassword = true

      renderWithProviders(<ResetPasswordPage />)
      await waitForFormReady()

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('disables inputs while updating password', async () => {
      mockIsUpdatingPassword = true

      renderWithProviders(<ResetPasswordPage />)
      await waitForFormReady()

      expect(getPasswordInput()).toBeDisabled()
      expect(getConfirmPasswordInput()).toBeDisabled()
    })
  })

  describe('Accessibility', () => {
    it('has proper aria-describedby for password error', async () => {
      renderWithProviders(<ResetPasswordPage />)
      await waitForFormReady()

      const passwordInput = getPasswordInput()
      fireEvent.change(passwordInput, { target: { value: 'short' } })

      // Wait for validation to complete
      await waitFor(() => {
        expect(passwordInput).toHaveAttribute('aria-invalid', 'true')
      })
      expect(passwordInput).toHaveAttribute('aria-describedby')
    })

    it('error messages have role="alert"', async () => {
      renderWithProviders(<ResetPasswordPage />)
      await waitForFormReady()

      fireEvent.change(getPasswordInput(), { target: { value: 'short' } })

      // Wait for error message with role="alert" to appear
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert')
        const passwordError = alerts.find(el => el.textContent?.includes('Password must be at least 8 characters'))
        expect(passwordError).toBeTruthy()
        expect(passwordError).toHaveAttribute('role', 'alert')
      })
    })

    it('submit button has aria-label during loading', async () => {
      mockIsUpdatingPassword = true

      renderWithProviders(<ResetPasswordPage />)
      await waitForFormReady()

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-label', 'Updating password')
    })
  })

  describe('Navigation', () => {
    it('has back to login link', async () => {
      renderWithProviders(<ResetPasswordPage />)
      await waitForFormReady()

      const loginLink = screen.getByRole('link', { name: /back to login/i })
      expect(loginLink).toHaveAttribute('href', '/login')
    })
  })
})
