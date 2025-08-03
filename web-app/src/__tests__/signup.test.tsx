import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SignupPage from '@/app/(auth)/signup/page'

// Mock next/navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock useAuth hook
const mockSignUp = jest.fn()
const mockUseAuth = {
  signUp: mockSignUp,
  isSigningUp: false,
  user: null,
  isPending: false,
  error: null,
  signIn: jest.fn(),
  signOut: jest.fn(),
  isSigningIn: false,
  isSigningOut: false,
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

describe('SignupPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAuth.isSigningUp = false
  })

  describe('AC1: Successful Registration', () => {
    it('renders registration form with email and password fields', () => {
      renderWithProviders(<SignupPage />)

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
    })

    it('calls signUp with email and password on form submission', async () => {
      mockSignUp.mockResolvedValueOnce({
        user: { id: 'test-user-id' },
        session: null,
        profileCreated: true,
      })

      renderWithProviders(<SignupPage />)

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const submitButton = screen.getByRole('button', { name: /create account/i })

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
      fireEvent.change(passwordInput, { target: { value: 'password123' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123',
        })
      })
    })

    it('redirects to home page after successful signup', async () => {
      mockSignUp.mockResolvedValueOnce({
        user: { id: 'test-user-id' },
        session: null,
        profileCreated: true,
      })

      renderWithProviders(<SignupPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'password123' },
      })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/')
      })
    })
  })

  describe('AC2: Duplicate Email Handling', () => {
    it('shows error message when email already exists', async () => {
      mockSignUp.mockRejectedValueOnce(new Error('User already registered'))

      renderWithProviders(<SignupPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'existing@example.com' },
      })
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'password123' },
      })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(screen.getByText(/an account with this email already exists/i)).toBeInTheDocument()
      })
    })
  })

  describe('AC3: Password Validation', () => {
    it('shows validation error for password shorter than 8 characters', () => {
      renderWithProviders(<SignupPage />)

      const passwordInput = screen.getByLabelText(/password/i)
      fireEvent.change(passwordInput, { target: { value: 'short' } })

      expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument()
    })

    it('disables submit button when password is too short', () => {
      renderWithProviders(<SignupPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'short' },
      })

      expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled()
    })

    it('enables submit button when password is valid', () => {
      renderWithProviders(<SignupPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'password123' },
      })

      expect(screen.getByRole('button', { name: /create account/i })).not.toBeDisabled()
    })
  })

  describe('AC4: Email Format Validation', () => {
    it('shows validation error for invalid email format on submission', async () => {
      renderWithProviders(<SignupPage />)

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/password/i)

      fireEvent.change(emailInput, { target: { value: 'invalid-email' } })
      fireEvent.change(passwordInput, { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument()
      })

      // Should not have called signUp
      expect(mockSignUp).not.toHaveBeenCalled()
    })

    it('shows inline validation error for invalid email format', () => {
      renderWithProviders(<SignupPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'invalid-email' },
      })

      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument()
    })

    it('accepts valid email format', () => {
      renderWithProviders(<SignupPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'valid@example.com' },
      })
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'password123' },
      })

      // No validation error should appear
      expect(screen.queryByText(/please enter a valid email address/i)).not.toBeInTheDocument()
    })
  })

  describe('UX: Loading State', () => {
    it('shows loading state while submitting', async () => {
      // Set loading state
      mockUseAuth.isSigningUp = true

      renderWithProviders(<SignupPage />)

      // Button should be disabled during loading
      expect(screen.getByRole('button')).toBeDisabled()
    })

    it('disables inputs while loading', async () => {
      // Set loading state
      mockUseAuth.isSigningUp = true

      renderWithProviders(<SignupPage />)

      expect(screen.getByLabelText(/email/i)).toBeDisabled()
      expect(screen.getByLabelText(/password/i)).toBeDisabled()
    })
  })

  describe('Accessibility', () => {
    it('has proper aria-describedby for password error', () => {
      renderWithProviders(<SignupPage />)

      const passwordInput = screen.getByLabelText(/password/i)
      fireEvent.change(passwordInput, { target: { value: 'short' } })

      // Check that aria-invalid is set
      expect(passwordInput).toHaveAttribute('aria-invalid', 'true')
      // Check that aria-describedby points to error message
      expect(passwordInput).toHaveAttribute('aria-describedby')
    })

    it('has proper aria-describedby for email error', () => {
      renderWithProviders(<SignupPage />)

      const emailInput = screen.getByLabelText(/email/i)
      fireEvent.change(emailInput, { target: { value: 'invalid' } })

      // Check that aria-invalid is set
      expect(emailInput).toHaveAttribute('aria-invalid', 'true')
      // Check that aria-describedby points to error message
      expect(emailInput).toHaveAttribute('aria-describedby')
    })

    it('error messages have role="alert"', () => {
      renderWithProviders(<SignupPage />)

      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'short' },
      })

      const errorMessage = screen.getByText(/password must be at least 8 characters/i)
      expect(errorMessage).toHaveAttribute('role', 'alert')
    })
  })
})
