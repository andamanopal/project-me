import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AccountSettingsPage from '@/app/(dashboard)/settings/account/page'
import { DeleteAccountDialog } from '@/components/DeleteAccountDialog'

// Mock next/navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock useAccountDeletion hook
const mockDeleteAccount = jest.fn()
const mockUseAccountDeletion = {
  deleteAccount: mockDeleteAccount,
  isDeleting: false,
  deleteError: null as Error | null,
}

jest.mock('@/hooks/useAccountDeletion', () => ({
  useAccountDeletion: () => mockUseAccountDeletion,
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

describe('AccountSettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAccountDeletion.isDeleting = false
    mockUseAccountDeletion.deleteError = null
    mockDeleteAccount.mockReset()
  })

  describe('AC1: Access Delete Account Option', () => {
    it('renders delete account button in settings', () => {
      renderWithProviders(<AccountSettingsPage />)

      expect(
        screen.getByRole('button', { name: /delete account/i })
      ).toBeInTheDocument()
    })

    it('shows danger zone section with warning styling', () => {
      renderWithProviders(<AccountSettingsPage />)

      expect(screen.getByText(/danger zone/i)).toBeInTheDocument()
      expect(
        screen.getByText(/permanently delete your account/i)
      ).toBeInTheDocument()
    })

    it('has page title and description', () => {
      renderWithProviders(<AccountSettingsPage />)

      expect(screen.getByText('Account Settings')).toBeInTheDocument()
      expect(screen.getByText(/manage your account/i)).toBeInTheDocument()
    })
  })

  describe('AC2: Confirmation Dialog', () => {
    it('opens confirmation dialog on delete button click', () => {
      renderWithProviders(<AccountSettingsPage />)

      // Click delete button
      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      // Dialog should appear
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      // Check for warning text within the dialog
      const dialog = screen.getByRole('alertdialog')
      expect(dialog).toHaveTextContent(/this action cannot be undone/i)
    })

    it('shows what will be deleted in dialog', () => {
      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      expect(screen.getByText(/your profile and preferences/i)).toBeInTheDocument()
      expect(screen.getByText(/all check-ins and memories/i)).toBeInTheDocument()
      expect(screen.getByText(/all conversation history/i)).toBeInTheDocument()
      expect(screen.getByText(/your account credentials/i)).toBeInTheDocument()
    })

    it('has text input for typing DELETE', () => {
      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      const input = screen.getByPlaceholderText(/type delete/i)
      expect(input).toBeInTheDocument()
    })

    it('has cancel and confirm buttons', () => {
      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /confirm delete account/i })
      ).toBeInTheDocument()
    })
  })

  describe('AC2: Confirm Button Disabled Until DELETE Typed', () => {
    it('confirm button is disabled initially', () => {
      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      const confirmButton = screen.getByRole('button', {
        name: /confirm delete account/i,
      })
      expect(confirmButton).toBeDisabled()
    })

    it('confirm button remains disabled with partial text', () => {
      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      const input = screen.getByPlaceholderText(/type delete/i)
      fireEvent.change(input, { target: { value: 'DEL' } })

      const confirmButton = screen.getByRole('button', {
        name: /confirm delete account/i,
      })
      expect(confirmButton).toBeDisabled()
    })

    it('confirm button enables when DELETE is typed exactly', () => {
      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      const input = screen.getByPlaceholderText(/type delete/i)
      fireEvent.change(input, { target: { value: 'DELETE' } })

      const confirmButton = screen.getByRole('button', {
        name: /confirm delete account/i,
      })
      expect(confirmButton).not.toBeDisabled()
    })

    it('confirm button disabled with lowercase delete', () => {
      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      const input = screen.getByPlaceholderText(/type delete/i)
      fireEvent.change(input, { target: { value: 'delete' } })

      const confirmButton = screen.getByRole('button', {
        name: /confirm delete account/i,
      })
      expect(confirmButton).toBeDisabled()
    })
  })

  describe('AC4: Cancel Deletion', () => {
    it('closes dialog on cancel button click', () => {
      renderWithProviders(<AccountSettingsPage />)

      // Open dialog
      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()

      // Click cancel
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

      // Dialog should close
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('does not call deleteAccount on cancel', () => {
      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

      expect(mockDeleteAccount).not.toHaveBeenCalled()
    })

    it('closes dialog on escape key', () => {
      renderWithProviders(<AccountSettingsPage />)

      // Open dialog
      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()

      // Press escape
      fireEvent.keyDown(window, { key: 'Escape' })

      // Dialog should close
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('does not close on escape while deleting', () => {
      mockUseAccountDeletion.isDeleting = true

      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
      fireEvent.keyDown(window, { key: 'Escape' })

      // Dialog should remain open
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })
  })

  describe('AC3: Successful Deletion', () => {
    it('calls deleteAccount when confirmed', async () => {
      mockDeleteAccount.mockResolvedValueOnce({ success: true })

      renderWithProviders(<AccountSettingsPage />)

      // Open dialog
      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      // Type DELETE
      const input = screen.getByPlaceholderText(/type delete/i)
      fireEvent.change(input, { target: { value: 'DELETE' } })

      // Click confirm
      fireEvent.click(
        screen.getByRole('button', { name: /confirm delete account/i })
      )

      await waitFor(() => {
        expect(mockDeleteAccount).toHaveBeenCalledTimes(1)
      })
    })

    it('shows success toast after deletion', async () => {
      mockDeleteAccount.mockResolvedValueOnce({ success: true })

      renderWithProviders(<AccountSettingsPage />)

      // Open dialog
      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      // Type DELETE
      fireEvent.change(screen.getByPlaceholderText(/type delete/i), {
        target: { value: 'DELETE' },
      })

      // Click confirm
      fireEvent.click(
        screen.getByRole('button', { name: /confirm delete account/i })
      )

      await waitFor(() => {
        expect(screen.getByText(/account deleted/i)).toBeInTheDocument()
      })
    })

    it('redirects to landing page after successful deletion', async () => {
      jest.useFakeTimers()
      mockDeleteAccount.mockResolvedValueOnce({ success: true })

      renderWithProviders(<AccountSettingsPage />)

      // Open dialog
      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      // Type DELETE
      fireEvent.change(screen.getByPlaceholderText(/type delete/i), {
        target: { value: 'DELETE' },
      })

      // Click confirm
      fireEvent.click(
        screen.getByRole('button', { name: /confirm delete account/i })
      )

      // Wait for deletion to complete
      await waitFor(() => {
        expect(screen.getByText(/account deleted/i)).toBeInTheDocument()
      })

      // Fast-forward timer for redirect
      jest.advanceTimersByTime(1500)

      expect(mockPush).toHaveBeenCalledWith('/')

      jest.useRealTimers()
    })
  })

  describe('AC5: Error Handling', () => {
    it('shows error message when deletion fails', async () => {
      mockDeleteAccount.mockRejectedValueOnce(
        new Error('Unable to delete account. Please try again.')
      )

      renderWithProviders(<AccountSettingsPage />)

      // Open dialog
      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      // Type DELETE
      fireEvent.change(screen.getByPlaceholderText(/type delete/i), {
        target: { value: 'DELETE' },
      })

      // Click confirm
      fireEvent.click(
        screen.getByRole('button', { name: /confirm delete account/i })
      )

      await waitFor(() => {
        expect(
          screen.getByText(/unable to delete account/i)
        ).toBeInTheDocument()
      })
    })

    it('dialog remains open on error', async () => {
      mockDeleteAccount.mockRejectedValueOnce(new Error('Network error'))

      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
      fireEvent.change(screen.getByPlaceholderText(/type delete/i), {
        target: { value: 'DELETE' },
      })
      fireEvent.click(
        screen.getByRole('button', { name: /confirm delete account/i })
      )

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      })
    })

    it('error message has role="alert"', async () => {
      mockDeleteAccount.mockRejectedValueOnce(new Error('Network error'))

      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
      fireEvent.change(screen.getByPlaceholderText(/type delete/i), {
        target: { value: 'DELETE' },
      })
      fireEvent.click(
        screen.getByRole('button', { name: /confirm delete account/i })
      )

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })
  })

  describe('Loading States', () => {
    it('shows loading state during deletion', () => {
      mockUseAccountDeletion.isDeleting = true

      renderWithProviders(<AccountSettingsPage />)

      // Open dialog
      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      // Check for the loading spinner button
      expect(
        screen.getByRole('button', { name: /deleting account/i })
      ).toBeInTheDocument()
    })

    it('disables cancel button during deletion', () => {
      mockUseAccountDeletion.isDeleting = true

      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
    })

    it('disables input during deletion', () => {
      mockUseAccountDeletion.isDeleting = true

      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      expect(screen.getByPlaceholderText(/type delete/i)).toBeDisabled()
    })
  })

  describe('Accessibility', () => {
    it('dialog has role="alertdialog"', () => {
      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })

    it('dialog has aria-labelledby and aria-describedby', () => {
      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      const dialog = screen.getByRole('alertdialog')
      expect(dialog).toHaveAttribute('aria-labelledby')
      expect(dialog).toHaveAttribute('aria-describedby')
    })

    it('delete button has aria-haspopup', () => {
      renderWithProviders(<AccountSettingsPage />)

      const deleteButton = screen.getByRole('button', { name: /delete account/i })
      expect(deleteButton).toHaveAttribute('aria-haspopup', 'dialog')
    })

    it('confirm button has appropriate aria-label during loading', () => {
      mockUseAccountDeletion.isDeleting = true

      renderWithProviders(<AccountSettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

      expect(
        screen.getByRole('button', { name: /deleting account/i })
      ).toBeInTheDocument()
    })
  })
})

describe('DeleteAccountDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    isDeleting: false,
    error: null,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not render when closed', () => {
    render(<DeleteAccountDialog {...defaultProps} isOpen={false} />)

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('renders when open', () => {
    render(<DeleteAccountDialog {...defaultProps} />)

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('resets input when reopened', () => {
    const { rerender } = render(<DeleteAccountDialog {...defaultProps} />)

    // Type something
    const input = screen.getByPlaceholderText(/type delete/i)
    fireEvent.change(input, { target: { value: 'DELETE' } })
    expect(input).toHaveValue('DELETE')

    // Close and reopen
    rerender(<DeleteAccountDialog {...defaultProps} isOpen={false} />)
    rerender(<DeleteAccountDialog {...defaultProps} isOpen={true} />)

    // Input should be reset
    expect(screen.getByPlaceholderText(/type delete/i)).toHaveValue('')
  })

  it('displays error when provided', () => {
    render(
      <DeleteAccountDialog {...defaultProps} error="Test error message" />
    )

    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('closes on backdrop click when not deleting', () => {
    const onClose = jest.fn()
    render(<DeleteAccountDialog {...defaultProps} onClose={onClose} />)

    // Click the backdrop (the outer div)
    const backdrop = screen.getByRole('alertdialog').parentElement
    fireEvent.click(backdrop!)

    expect(onClose).toHaveBeenCalled()
  })

  it('does not close on backdrop click when deleting', () => {
    const onClose = jest.fn()
    render(
      <DeleteAccountDialog {...defaultProps} onClose={onClose} isDeleting={true} />
    )

    const backdrop = screen.getByRole('alertdialog').parentElement
    fireEvent.click(backdrop!)

    expect(onClose).not.toHaveBeenCalled()
  })
})
