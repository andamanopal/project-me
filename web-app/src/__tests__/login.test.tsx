import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LoginPage from '@/app/(auth)/login/page'

// Mock next/navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock useAuth hook
const mockSignIn = jest.fn()
const mockUseAuth = {
  signIn: mockSignIn,
  isSigningIn: false,
  user: null,
  isPending: false,
  error: null,
  signUp: jest.fn(),
  signOut: jest.fn(),
  isSigningUp: false,
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

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAuth.isSigningIn = false
  })

  describe('AC1: Successful Login', () => {
    it('renders login form with email and password fields', () => {
      renderWithProviders(<LoginPage />)

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })

    it('calls signIn with email and password on form submission', async () => {
      mockSignIn.mockResolvedValueOnce({
        user: { id: 'test-user-id', email: 'test@example.com' },
        session: { access_token: 'token' },
      })

      renderWithProviders(<LoginPage />)

      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
      fireEvent.change(passwordInput, { target: { value: 'password123' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123',
        })
      })
    })

    it('redirects to home page after successful login', async () => {
      mockSignIn.mockResolvedValueOnce({
        user: { id: 'test-user-id', email: 'test@example.com' },
        session: { access_token: 'token' },
      })

      renderWithProviders(<LoginPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'password123' },
      })
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/')
      })
    })
  })

  describe('AC3: Invalid Credentials Handling', () => {
    it('shows error message for invalid credentials', async () => {
      mockSignIn.mockRejectedValueOnce(new Error('Invalid login credentials'))

      renderWithProviders(<LoginPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'wrongpassword' },
      })
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
      })
    })

    it('shows network error message for connection failures', async () => {
      mockSignIn.mockRejectedValueOnce(new Error('Network error'))

      renderWithProviders(<LoginPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'password123' },
      })
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(screen.getByText(/unable to connect/i)).toBeInTheDocument()
      })
    })

    it('shows email not confirmed error message', async () => {
      mockSignIn.mockRejectedValueOnce(new Error('Email not confirmed'))

      renderWithProviders(<LoginPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'unverified@example.com' },
      })
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'password123' },
      })
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(screen.getByText(/please verify your email before logging in/i)).toBeInTheDocument()
      })
    })
  })

  describe('AC5: Email Format Validation', () => {
    it('shows validation error for invalid email format', () => {
      renderWithProviders(<LoginPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'invalid-email' },
      })

      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument()
    })

    it('does not show validation error for valid email format', () => {
      renderWithProviders(<LoginPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'valid@example.com' },
      })

      expect(screen.queryByText(/please enter a valid email address/i)).not.toBeInTheDocument()
    })

    it('does not call signIn when email is invalid', async () => {
      renderWithProviders(<LoginPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'invalid-email' },
      })
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'password123' },
      })
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(mockSignIn).not.toHaveBeenCalled()
      })
    })
  })

  describe('UX: Loading State', () => {
    it('shows loading state while signing in', async () => {
      mockUseAuth.isSigningIn = true

      renderWithProviders(<LoginPage />)

      expect(screen.getByRole('button')).toBeDisabled()
    })

    it('disables inputs while loading', async () => {
      mockUseAuth.isSigningIn = true

      renderWithProviders(<LoginPage />)

      expect(screen.getByLabelText(/email/i)).toBeDisabled()
      expect(screen.getByLabelText(/password/i)).toBeDisabled()
    })

    it('disables submit button when fields are empty', () => {
      renderWithProviders(<LoginPage />)

      expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled()
    })

    it('enables submit button when all fields are filled', () => {
      renderWithProviders(<LoginPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'password123' },
      })

      expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled()
    })
  })

  describe('Navigation Links', () => {
    it('has link to signup page', () => {
      renderWithProviders(<LoginPage />)

      const signupLink = screen.getByRole('link', { name: /create one/i })
      expect(signupLink).toHaveAttribute('href', '/signup')
    })

    it('has link to forgot password page', () => {
      renderWithProviders(<LoginPage />)

      const forgotLink = screen.getByRole('link', { name: /forgot password/i })
      expect(forgotLink).toHaveAttribute('href', '/forgot-password')
    })
  })

  describe('Accessibility', () => {
    it('has proper aria-describedby for email error', () => {
      renderWithProviders(<LoginPage />)

      const emailInput = screen.getByLabelText(/email/i)
      fireEvent.change(emailInput, { target: { value: 'invalid' } })

      expect(emailInput).toHaveAttribute('aria-invalid', 'true')
      expect(emailInput).toHaveAttribute('aria-describedby')
    })

    it('error messages have role="alert"', () => {
      renderWithProviders(<LoginPage />)

      fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: 'invalid' },
      })

      const errorMessage = screen.getByText(/please enter a valid email address/i)
      expect(errorMessage).toHaveAttribute('role', 'alert')
    })
  })
})
