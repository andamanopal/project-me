import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LineImport } from '@/components/connectors/LineImport'

// Mock useAuth hook
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id' },
  }),
}))

// Mock useLineImport hook
const mockUploadFile = jest.fn()
const mockClearError = jest.fn()
const mockRefetch = jest.fn()
const mockUseLineImport = {
  stats: undefined as { message_count: number; last_import_at?: string } | undefined,
  isPending: false,
  error: null as Error | null,
  uploadFile: mockUploadFile,
  isUploading: false,
  currentImportId: null as string | null,
  importStatus: undefined as { status: string; message_count?: number; error?: string } | undefined,
  isPolling: false,
  uploadError: null as string | null,
  clearError: mockClearError,
  refetch: mockRefetch,
}

jest.mock('@/hooks/useLineImport', () => ({
  useLineImport: () => mockUseLineImport,
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

describe('LineImport', () => {
  const mockOnImportComplete = jest.fn()
  const mockOnToast = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseLineImport.stats = undefined
    mockUseLineImport.isPending = false
    mockUseLineImport.error = null
    mockUseLineImport.isUploading = false
    mockUseLineImport.currentImportId = null
    mockUseLineImport.importStatus = undefined
    mockUseLineImport.isPolling = false
    mockUseLineImport.uploadError = null
    mockUploadFile.mockReset()
    mockClearError.mockReset()
    mockOnImportComplete.mockReset()
    mockOnToast.mockReset()
  })

  describe('AC1: Upload LINE Export File', () => {
    it('renders upload area with instructions', () => {
      renderWithProviders(<LineImport />)

      expect(screen.getByText(/drag & drop your line export/i)).toBeInTheDocument()
      expect(screen.getByText(/or click to browse/i)).toBeInTheDocument()
    })

    it('accepts file via click', () => {
      renderWithProviders(<LineImport />)

      const uploadArea = screen.getByRole('button')
      expect(uploadArea).toBeInTheDocument()
    })

    it('shows help text with export instructions', () => {
      renderWithProviders(<LineImport />)

      expect(screen.getByText(/export your line chat history/i)).toBeInTheDocument()
      expect(screen.getByText(/open line chat/i)).toBeInTheDocument()
    })

    it('shows upload progress when uploading', () => {
      mockUseLineImport.isUploading = true
      renderWithProviders(<LineImport />)

      expect(screen.getByText(/uploading/i)).toBeInTheDocument()
    })
  })

  describe('AC2: Drag and Drop', () => {
    it('handles drag over state', () => {
      renderWithProviders(<LineImport />)

      const uploadArea = screen.getByRole('button')

      fireEvent.dragOver(uploadArea)
      expect(screen.getByText(/drop file here/i)).toBeInTheDocument()
    })

    it('handles drag leave state', () => {
      renderWithProviders(<LineImport />)

      const uploadArea = screen.getByRole('button')

      fireEvent.dragOver(uploadArea)
      fireEvent.dragLeave(uploadArea)

      expect(screen.getByText(/drag & drop/i)).toBeInTheDocument()
    })
  })

  describe('AC5: Handle Large Imports', () => {
    it('shows processing state', () => {
      mockUseLineImport.importStatus = { status: 'processing' }
      renderWithProviders(<LineImport />)

      expect(screen.getByText(/processing your messages/i)).toBeInTheDocument()
    })

    it('shows spinning indicator during processing', () => {
      mockUseLineImport.importStatus = { status: 'processing' }
      renderWithProviders(<LineImport />)

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })
  })

  describe('AC7: Error Handling', () => {
    it('shows error message when upload fails', () => {
      mockUseLineImport.uploadError = 'Please upload a .zip or .txt file exported from LINE.'
      renderWithProviders(<LineImport />)

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/please upload a .zip or .txt file/i)).toBeInTheDocument()
    })

    it('shows error message when import fails', () => {
      mockUseLineImport.importStatus = {
        status: 'failed',
        error: 'No outgoing messages found in export',
      }
      renderWithProviders(<LineImport />)

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/no outgoing messages found/i)).toBeInTheDocument()
    })
  })

  describe('Import Statistics', () => {
    it('shows import stats when available', () => {
      mockUseLineImport.stats = {
        message_count: 1234,
        last_import_at: '2025-01-01T00:00:00Z',
      }
      renderWithProviders(<LineImport />)

      expect(screen.getByText('1,234')).toBeInTheDocument()
      expect(screen.getByText(/imported messages/i)).toBeInTheDocument()
    })

    it('shows last import date', () => {
      mockUseLineImport.stats = {
        message_count: 1234,
        last_import_at: '2025-01-01T00:00:00Z',
      }
      renderWithProviders(<LineImport />)

      expect(screen.getByText(/last import/i)).toBeInTheDocument()
    })

    it('does not show stats section when no messages imported', () => {
      mockUseLineImport.stats = { message_count: 0 }
      renderWithProviders(<LineImport />)

      expect(screen.queryByText(/imported messages/i)).not.toBeInTheDocument()
    })
  })

  describe('Success State', () => {
    it('shows success message when import completes', () => {
      mockUseLineImport.importStatus = {
        status: 'completed',
        message_count: 500,
      }
      renderWithProviders(<LineImport />)

      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.getByText(/successfully imported 500 messages/i)).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has accessible upload area', () => {
      renderWithProviders(<LineImport />)

      const uploadArea = screen.getByRole('button')
      expect(uploadArea).toHaveAttribute('tabIndex', '0')
    })

    it('has hidden file input with aria-label', () => {
      renderWithProviders(<LineImport />)

      const input = document.querySelector('input[type="file"]')
      expect(input).toHaveAttribute('aria-label', 'Upload LINE export file')
    })

    it('uses role="alert" for error messages', () => {
      mockUseLineImport.uploadError = 'Error message'
      renderWithProviders(<LineImport />)

      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('uses role="status" for success message', () => {
      mockUseLineImport.importStatus = {
        status: 'completed',
        message_count: 100,
      }
      renderWithProviders(<LineImport />)

      expect(screen.getByRole('status')).toBeInTheDocument()
    })
  })

  describe('Callbacks', () => {
    it('calls onToast when import completes', () => {
      mockUseLineImport.importStatus = {
        status: 'completed',
        message_count: 100,
      }
      renderWithProviders(
        <LineImport onToast={mockOnToast} onImportComplete={mockOnImportComplete} />
      )

      expect(mockOnToast).toHaveBeenCalledWith('Imported 100 messages', 'success')
    })

    it('calls onToast when import fails', () => {
      mockUseLineImport.importStatus = {
        status: 'failed',
        error: 'Something went wrong',
      }
      renderWithProviders(<LineImport onToast={mockOnToast} />)

      expect(mockOnToast).toHaveBeenCalledWith('Something went wrong', 'error')
    })
  })
})
