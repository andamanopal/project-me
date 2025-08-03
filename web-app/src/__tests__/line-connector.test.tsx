import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ConnectorsPage from '@/app/(dashboard)/settings/connectors/page'

// Mock next/navigation
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockSearchParams = new URLSearchParams()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => mockSearchParams,
}))

// Mock useLineConnector hook
const mockConnectLine = jest.fn()
const mockDisconnectLine = jest.fn()
const mockRefetch = jest.fn()
const mockUseLineConnector = {
  status: undefined as
    | { connected: boolean; display_name?: string; picture_url?: string }
    | undefined,
  isPending: false,
  error: null as Error | null,
  connectLine: mockConnectLine,
  isConnecting: false,
  disconnectLine: mockDisconnectLine,
  isDisconnecting: false,
  refetch: mockRefetch,
}

jest.mock('@/hooks/useLineConnector', () => ({
  useLineConnector: () => mockUseLineConnector,
}))

// Mock useLineImport hook for LineImport component
jest.mock('@/hooks/useLineImport', () => ({
  useLineImport: () => ({
    stats: undefined,
    isPending: false,
    uploadFile: jest.fn(),
    isUploading: false,
    importStatus: undefined,
    isPolling: false,
    uploadError: null,
    clearError: jest.fn(),
    refetch: jest.fn(),
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
    <QueryClientProvider client={queryClient}>{component}</QueryClientProvider>
  )
}

describe('ConnectorsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseLineConnector.status = undefined
    mockUseLineConnector.isPending = false
    mockUseLineConnector.error = null
    mockUseLineConnector.isConnecting = false
    mockUseLineConnector.isDisconnecting = false
    mockConnectLine.mockReset()
    mockDisconnectLine.mockReset()
    // Reset search params
    mockSearchParams.delete('success')
    mockSearchParams.delete('error')
  })

  describe('AC1: Access Connect LINE Option', () => {
    it('renders page with Integrations title', () => {
      mockUseLineConnector.status = { connected: false }
      renderWithProviders(<ConnectorsPage />)

      expect(screen.getByText('Integrations')).toBeInTheDocument()
      expect(
        screen.getByText(/connect external services/i)
      ).toBeInTheDocument()
    })

    it('renders Connect LINE button when not connected', () => {
      mockUseLineConnector.status = { connected: false }
      renderWithProviders(<ConnectorsPage />)

      expect(
        screen.getByRole('button', { name: /connect line/i })
      ).toBeInTheDocument()
    })

    it('shows LINE section with explanation text', () => {
      mockUseLineConnector.status = { connected: false }
      renderWithProviders(<ConnectorsPage />)

      expect(screen.getByText('LINE')).toBeInTheDocument()
      expect(
        screen.getByText(/receive messages and updates on line/i)
      ).toBeInTheDocument()
    })

    it('has LINE brand green color on Connect button', () => {
      mockUseLineConnector.status = { connected: false }
      renderWithProviders(<ConnectorsPage />)

      const button = screen.getByRole('button', { name: /connect line/i })
      expect(button).toHaveStyle({ backgroundColor: '#06C755' })
    })
  })

  describe('AC2: Initiate LINE OAuth Flow', () => {
    it('calls connectLine when Connect LINE button is clicked', () => {
      mockUseLineConnector.status = { connected: false }
      renderWithProviders(<ConnectorsPage />)

      fireEvent.click(screen.getByRole('button', { name: /connect line/i }))

      expect(mockConnectLine).toHaveBeenCalledTimes(1)
    })

    it('disables button while connecting', () => {
      mockUseLineConnector.status = { connected: false }
      mockUseLineConnector.isConnecting = true
      renderWithProviders(<ConnectorsPage />)

      const button = screen.getByRole('button', { name: /connecting/i })
      expect(button).toBeDisabled()
    })

    it('shows "Connecting..." text while in progress', () => {
      mockUseLineConnector.status = { connected: false }
      mockUseLineConnector.isConnecting = true
      renderWithProviders(<ConnectorsPage />)

      expect(screen.getByText(/connecting/i)).toBeInTheDocument()
    })
  })

  describe('AC3: Successful Authorization', () => {
    it('shows success toast when success param is in URL', async () => {
      mockSearchParams.set('success', 'true')
      mockUseLineConnector.status = { connected: true, display_name: 'Test User' }
      renderWithProviders(<ConnectorsPage />)

      await waitFor(() => {
        expect(
          screen.getByText(/line connected successfully/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe('AC4: Denied Authorization', () => {
    it('shows cancelled toast when error=cancelled in URL', async () => {
      mockSearchParams.set('error', 'cancelled')
      mockUseLineConnector.status = { connected: false }
      renderWithProviders(<ConnectorsPage />)

      await waitFor(() => {
        expect(
          screen.getByText(/line connection cancelled/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe('AC5: Error Handling', () => {
    it('shows error message when error occurs', () => {
      mockUseLineConnector.status = undefined
      mockUseLineConnector.error = new Error('Network error')
      renderWithProviders(<ConnectorsPage />)

      expect(
        screen.getByText(/unable to load line status/i)
      ).toBeInTheDocument()
    })

    it('shows error toast when oauth_failed in URL', async () => {
      mockSearchParams.set('error', 'oauth_failed')
      mockUseLineConnector.status = { connected: false }
      renderWithProviders(<ConnectorsPage />)

      await waitFor(() => {
        expect(
          screen.getByText(/unable to connect line/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe('AC6: Already Connected State', () => {
    it('shows connected status with display name', () => {
      mockUseLineConnector.status = {
        connected: true,
        display_name: 'Test User',
        picture_url: 'https://example.com/avatar.jpg',
      }
      renderWithProviders(<ConnectorsPage />)

      expect(screen.getByText('Test User')).toBeInTheDocument()
      expect(screen.getByText('Connected')).toBeInTheDocument()
    })

    it('shows profile picture when connected', () => {
      mockUseLineConnector.status = {
        connected: true,
        display_name: 'Test User',
        picture_url: 'https://example.com/avatar.jpg',
      }
      renderWithProviders(<ConnectorsPage />)

      // Alt text uses display_name when available, falls back to 'LINE profile'
      const img = screen.getByAltText('Test User')
      expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg')
    })

    it('shows Disconnect button when connected', () => {
      mockUseLineConnector.status = { connected: true, display_name: 'Test User' }
      renderWithProviders(<ConnectorsPage />)

      expect(
        screen.getByRole('button', { name: /disconnect/i })
      ).toBeInTheDocument()
    })

    it('shows disconnecting state in dialog', () => {
      mockUseLineConnector.status = { connected: true, display_name: 'Test User' }
      mockUseLineConnector.isDisconnecting = true
      renderWithProviders(<ConnectorsPage />)

      // Open dialog first
      fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))

      expect(screen.getByText(/disconnecting/i)).toBeInTheDocument()
    })
  })

  describe('Disconnect Confirmation Dialog', () => {
    beforeEach(() => {
      mockUseLineConnector.status = { connected: true, display_name: 'Test User' }
      mockDisconnectLine.mockResolvedValue(undefined)
    })

    it('opens dialog when Disconnect button is clicked', () => {
      renderWithProviders(<ConnectorsPage />)

      fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Disconnect LINE')).toBeInTheDocument()
    })

    it('has cancel and confirm buttons', () => {
      renderWithProviders(<ConnectorsPage />)

      fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /disconnect/i }).length).toBeGreaterThan(1)
    })

    it('closes dialog on cancel', () => {
      renderWithProviders(<ConnectorsPage />)

      fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('calls disconnectLine without deleteData by default', async () => {
      renderWithProviders(<ConnectorsPage />)

      fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))

      // Click confirm (not Cancel)
      const buttons = screen.getAllByRole('button', { name: /disconnect/i })
      fireEvent.click(buttons[buttons.length - 1])

      await waitFor(() => {
        expect(mockDisconnectLine).toHaveBeenCalledWith(false)
      })
    })

    it('has checkbox to delete imported data', () => {
      renderWithProviders(<ConnectorsPage />)

      fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))

      expect(screen.getByRole('checkbox')).toBeInTheDocument()
      expect(screen.getByText(/also delete imported chat history/i)).toBeInTheDocument()
    })

    it('calls disconnectLine with deleteData=true when checkbox checked', async () => {
      renderWithProviders(<ConnectorsPage />)

      fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))
      fireEvent.click(screen.getByRole('checkbox'))

      // Button text should change
      expect(screen.getByText(/disconnect & delete/i)).toBeInTheDocument()

      fireEvent.click(screen.getByText(/disconnect & delete/i))

      await waitFor(() => {
        expect(mockDisconnectLine).toHaveBeenCalledWith(true)
      })
    })
  })

  describe('Accessibility', () => {
    it('has minimum 44x44px touch targets on buttons', () => {
      mockUseLineConnector.status = { connected: false }
      renderWithProviders(<ConnectorsPage />)

      const button = screen.getByRole('button', { name: /connect line/i })
      expect(button).toHaveClass('min-h-[44px]')
    })

    it('uses role="status" for toast notifications', async () => {
      mockSearchParams.set('success', 'true')
      mockUseLineConnector.status = { connected: true }
      renderWithProviders(<ConnectorsPage />)

      await waitFor(() => {
        const toast = screen.getByRole('status')
        expect(toast).toBeInTheDocument()
      })
    })

    it('uses role="alert" for error messages', () => {
      mockUseLineConnector.status = undefined
      mockUseLineConnector.error = new Error('Error')
      renderWithProviders(<ConnectorsPage />)

      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  describe('Loading State', () => {
    it('shows skeleton loader while fetching status', () => {
      mockUseLineConnector.isPending = true
      renderWithProviders(<ConnectorsPage />)

      // Should show skeleton with animate-pulse
      const skeleton = document.querySelector('.animate-pulse')
      expect(skeleton).toBeInTheDocument()
    })

    it('does not show Connect button while loading', () => {
      mockUseLineConnector.isPending = true
      renderWithProviders(<ConnectorsPage />)

      expect(
        screen.queryByRole('button', { name: /connect line/i })
      ).not.toBeInTheDocument()
    })
  })
})
