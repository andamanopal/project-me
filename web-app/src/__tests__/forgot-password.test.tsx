import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ForgotPasswordPage from '@/app/(auth)/forgot-password/page'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}))

// Mock useAuth hook
const mockResetPassword = jest.fn()
const mockUseAuth = {
  resetPassword: mockResetPassword,
  isResettingPassword: false,
  user: null,
  isPending: false,
  error: null,
  signUp: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  updatePassword: jest.fn(),
  isSigningUp: false,
  isSigningIn: false,
  isSigningOut: false,
  isUpdatingPassword: false,
}

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth,
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

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAuth.isResettingPassword = false
  })

  describe('AC1: Request Password Reset', () => {
    it('renders forgot password form with email field', () => {
      renderWithProviders(<ForgotPasswordPage />)

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument()
    })

    it('calls resetPassword with email on form submission', async () => {
      mockResetPassword.mockResolvedValueOnce(undefined)

      renderWithProviders(<ForgotPasswordPage />)

      const emailInput = screen.getByLabelText(/email/i)
      const submitButton = screen.getByRole('button', { name: /reset password/i })

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockResetPassword).toHaveBeenCalledWith({ email: 'test@example.com' })
      })
    })

    it('shows success confirmation after submission', async () => {
      mockResetPassword.mockResolvedValueOnce(undefined)

      renderWithProviders(<ForgotPasswordPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        expect(screen.getByText(/check your email/i)).toBeInTheDocument()
      })
    })

    it('allows user to try again from success state', async () => {
      mockResetPassword.mockResolvedValueOnce(undefined)

      renderWithProviders(<ForgotPasswordPage />)

      // Submit form to get to success state
      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: /reset password/i }))

      // Wait for success state
      await waitFor(() => {
        expect(screen.getByText(/check your email/i)).toBeInTheDocument()
      })

      // Click try again button
      fireEvent.click(screen.getByRole('button', { name: /try again/i }))

      // Should return to form state with email field visible
      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument()
      })
    })
  })

  describe('AC3: Security - No Email Enumeration', () => {
    it('shows same success message for unregistered emails', async () => {
      // Supabase doesn't return an error for unregistered emails
      mockResetPassword.mockResolvedValueOnce(undefined)

      renderWithProviders(<ForgotPasswordPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'nonexistent@example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        // Should show success even for non-existent email
        expect(screen.getByText(/check your email/i)).toBeInTheDocument()
      })
    })

    it('shows success on most errors to prevent enumeration', async () => {
      mockResetPassword.mockRejectedValueOnce(new Error('Some error'))

      renderWithProviders(<ForgotPasswordPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        // Should still show success to prevent enumeration
        expect(screen.getByText(/check your email/i)).toBeInTheDocument()
      })
    })

    it('shows rate limit error when too many requests', async () => {
      mockResetPassword.mockRejectedValueOnce(new Error('rate limit exceeded'))

      renderWithProviders(<ForgotPasswordPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: /reset password/i }))

      await waitFor(() => {
        expect(screen.getByText(/too many requests/i)).toBeInTheDocument()
      })
    })
  })

  describe('Email Validation', () => {
    it('shows validation error for invalid email format', () => {
      renderWithProviders(<ForgotPasswordPage />)

      const emailInput = screen.getByLabelText(/email/i)
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } })

      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument()
    })

    it('disables submit button when email is invalid', () => {
      renderWithProviders(<ForgotPasswordPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'invalid-email' },
      })

      expect(screen.getByRole('button', { name: /reset password/i })).toBeDisabled()
    })

    it('accepts valid email format', () => {
      renderWithProviders(<ForgotPasswordPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'valid@example.com' },
      })

      // No validation error should appear
      expect(screen.queryByText(/please enter a valid email address/i)).not.toBeInTheDocument()
    })
  })

  describe('Loading States', () => {
    it('shows loading state while submitting', () => {
      mockUseAuth.isResettingPassword = true

      renderWithProviders(<ForgotPasswordPage />)

      // Button should be disabled during loading
      expect(screen.getByRole('button')).toBeDisabled()
    })

    it('disables inputs while loading', () => {
      mockUseAuth.isResettingPassword = true

      renderWithProviders(<ForgotPasswordPage />)

      expect(screen.getByLabelText(/email/i)).toBeDisabled()
    })
  })

  describe('Accessibility', () => {
    it('has proper aria-describedby for email error', () => {
      renderWithProviders(<ForgotPasswordPage />)

      const emailInput = screen.getByLabelText(/email/i)
      fireEvent.change(emailInput, { target: { value: 'invalid' } })

      expect(emailInput).toHaveAttribute('aria-invalid', 'true')
      expect(emailInput).toHaveAttribute('aria-describedby')
    })

    it('error messages have role="alert"', () => {
      renderWithProviders(<ForgotPasswordPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'invalid' },
      })

      const errorMessage = screen.getByText(/please enter a valid email address/i)
      expect(errorMessage).toHaveAttribute('role', 'alert')
    })

    it('submit button has aria-label during loading', () => {
      mockUseAuth.isResettingPassword = true

      renderWithProviders(<ForgotPasswordPage />)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-label', 'Sending reset instructions')
    })
  })

  describe('Navigation', () => {
    it('has back to login link', () => {
      renderWithProviders(<ForgotPasswordPage />)

      const loginLink = screen.getByRole('link', { name: /back to login/i })
      expect(loginLink).toHaveAttribute('href', '/login')
    })
  })
})
