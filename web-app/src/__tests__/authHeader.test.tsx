import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthHeader } from '@/components/AuthHeader'

// Mock next/navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock useAuth hook
const mockSignOut = jest.fn()
const mockUseAuth = {
  user: null as { email: string } | null,
  isPending: false,
  signOut: mockSignOut,
  isSigningOut: false,
  signUp: jest.fn(),
  signIn: jest.fn(),
  isSigningUp: false,
  isSigningIn: false,
  error: null,
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

describe('AuthHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAuth.user = null
    mockUseAuth.isPending = false
    mockUseAuth.isSigningOut = false
  })

  describe('Loading State', () => {
    it('shows skeleton loading state while auth is pending', () => {
      mockUseAuth.isPending = true

      renderWithProviders(<AuthHeader />)

      // Should show skeleton loader
      expect(screen.getByText('Project-Me')).toBeInTheDocument()
      // Should have animate-pulse element (skeleton)
      const header = screen.getByRole('banner')
      expect(header.querySelector('.animate-pulse')).toBeInTheDocument()
    })
  })

  describe('Logged Out State', () => {
    it('shows sign in and sign up links when not logged in', () => {
      mockUseAuth.user = null

      renderWithProviders(<AuthHeader />)

      expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
      expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/signup')
    })

    it('does not show user email when logged out', () => {
      mockUseAuth.user = null

      renderWithProviders(<AuthHeader />)

      expect(screen.queryByText(/test@example.com/)).not.toBeInTheDocument()
    })
  })

  describe('Logged In State', () => {
    it('shows user email when logged in', () => {
      mockUseAuth.user = { email: 'test@example.com' }

      renderWithProviders(<AuthHeader />)

      expect(screen.getByText('test@example.com')).toBeInTheDocument()
    })

    it('shows sign out button when logged in', () => {
      mockUseAuth.user = { email: 'test@example.com' }

      renderWithProviders(<AuthHeader />)

      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
    })

    it('does not show sign in/up links when logged in', () => {
      mockUseAuth.user = { email: 'test@example.com' }

      renderWithProviders(<AuthHeader />)

      expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /sign up/i })).not.toBeInTheDocument()
    })
  })

  describe('AC2: Successful Logout', () => {
    it('calls signOut when logout button is clicked', async () => {
      mockUseAuth.user = { email: 'test@example.com' }
      mockSignOut.mockResolvedValueOnce(undefined)

      renderWithProviders(<AuthHeader />)

      const logoutButton = screen.getByRole('button', { name: /sign out/i })
      fireEvent.click(logoutButton)

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled()
      })
    })

    it('redirects to login page after successful logout', async () => {
      mockUseAuth.user = { email: 'test@example.com' }
      mockSignOut.mockResolvedValueOnce(undefined)

      renderWithProviders(<AuthHeader />)

      fireEvent.click(screen.getByRole('button', { name: /sign out/i }))

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login')
      })
    })

    it('disables logout button while signing out', () => {
      mockUseAuth.user = { email: 'test@example.com' }
      mockUseAuth.isSigningOut = true

      renderWithProviders(<AuthHeader />)

      const logoutButton = screen.getByRole('button')
      expect(logoutButton).toBeDisabled()
    })

    it('shows loading state while signing out', () => {
      mockUseAuth.user = { email: 'test@example.com' }
      mockUseAuth.isSigningOut = true

      renderWithProviders(<AuthHeader />)

      expect(screen.getByText(/signing out/i)).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('does not redirect on logout failure', async () => {
      mockUseAuth.user = { email: 'test@example.com' }
      mockSignOut.mockRejectedValueOnce(new Error('Network error'))

      renderWithProviders(<AuthHeader />)

      fireEvent.click(screen.getByRole('button', { name: /sign out/i }))

      // Wait for error to be handled
      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalled()
      })

      // Should NOT redirect on error
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('shows error message when logout fails', async () => {
      mockUseAuth.user = { email: 'test@example.com' }
      mockSignOut.mockRejectedValueOnce(new Error('Network error'))

      renderWithProviders(<AuthHeader />)

      fireEvent.click(screen.getByRole('button', { name: /sign out/i }))

      await waitFor(() => {
        expect(screen.getByText(/unable to sign out/i)).toBeInTheDocument()
      })
    })
  })

  describe('Navigation', () => {
    it('has clickable logo that links to home', () => {
      mockUseAuth.user = null

      renderWithProviders(<AuthHeader />)

      const logoLink = screen.getByRole('link', { name: /project-me/i })
      expect(logoLink).toHaveAttribute('href', '/')
    })
  })

  describe('Accessibility', () => {
    it('header has proper banner role', () => {
      renderWithProviders(<AuthHeader />)

      expect(screen.getByRole('banner')).toBeInTheDocument()
    })

    it('logout button has aria-label during loading', () => {
      mockUseAuth.user = { email: 'test@example.com' }
      mockUseAuth.isSigningOut = true

      renderWithProviders(<AuthHeader />)

      const logoutButton = screen.getByRole('button')
      expect(logoutButton).toHaveAttribute('aria-label', 'Signing out')
    })
  })
})
