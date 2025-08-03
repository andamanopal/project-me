import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CheckInDetail } from '@/components/checkin/CheckInDetail'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { CheckInData } from '@/hooks/useCheckIns'

// Mock the mutations hook
const mockUpdateCheckIn = jest.fn()
const mockDeleteCheckIn = jest.fn()

jest.mock('@/hooks/useCheckInMutations', () => ({
  useUpdateCheckIn: () => ({
    updateCheckIn: mockUpdateCheckIn,
    isPending: false,
    error: null,
    reset: jest.fn(),
  }),
  useDeleteCheckIn: () => ({
    deleteCheckIn: mockDeleteCheckIn,
    isPending: false,
    error: null,
    reset: jest.fn(),
  }),
}))

// Mock useAuth
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id' },
  }),
}))

// Mock Supabase client
jest.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  }),
}))

const createTestCheckIn = (overrides: Partial<CheckInData> = {}): CheckInData => ({
  id: 'test-checkin-id',
  user_id: 'test-user-id',
  status: 'completed',
  transcript: 'This is a test transcript.',
  summary: {
    events: ['Had a meeting'],
    emotions: [{ emotion: 'Happy', context: 'Good progress' }],
    goals: ['Finish project'],
    concerns: [],
    generated_at: '2025-12-31T10:00:00Z',
  },
  audio_url: 'https://example.com/audio.webm',
  created_at: '2025-12-31T09:00:00Z',
  updated_at: '2025-12-31T10:00:00Z',
  ...overrides,
})

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

const renderWithProvider = (ui: React.ReactElement) => {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('CheckInDetail Edit Mode', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows edit and delete buttons in view mode', () => {
    const checkIn = createTestCheckIn()
    renderWithProvider(
      <CheckInDetail checkIn={checkIn} onClose={jest.fn()} />
    )

    expect(screen.getByLabelText('Edit transcript')).toBeInTheDocument()
    expect(screen.getByLabelText('Delete check-in')).toBeInTheDocument()
  })

  it('toggles edit mode when edit button clicked', async () => {
    const checkIn = createTestCheckIn()
    renderWithProvider(
      <CheckInDetail checkIn={checkIn} onClose={jest.fn()} />
    )

    // Initially in view mode
    expect(screen.getByText('Check-in Details')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    // Click edit button
    await userEvent.click(screen.getByLabelText('Edit transcript'))

    // Now in edit mode
    expect(screen.getByText('Edit Check-in')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('This is a test transcript.')
  })

  it('shows regenerate summary checkbox in edit mode', async () => {
    const checkIn = createTestCheckIn()
    renderWithProvider(
      <CheckInDetail checkIn={checkIn} onClose={jest.fn()} />
    )

    await userEvent.click(screen.getByLabelText('Edit transcript'))

    expect(
      screen.getByLabelText(/Regenerate summary from edited transcript/i)
    ).toBeInTheDocument()
  })

  it('cancels edit mode without saving on cancel', async () => {
    const checkIn = createTestCheckIn()
    renderWithProvider(
      <CheckInDetail checkIn={checkIn} onClose={jest.fn()} />
    )

    await userEvent.click(screen.getByLabelText('Edit transcript'))

    // Modify the transcript
    const textarea = screen.getByRole('textbox')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Modified text')

    // Click the Cancel button (not the X button which has aria-label "Cancel edit")
    const cancelButtons = screen.getAllByRole('button', { name: /cancel/i })
    const cancelButton = cancelButtons.find((btn) => btn.textContent === 'Cancel')
    expect(cancelButton).toBeDefined()
    await userEvent.click(cancelButton!)

    // Should be back in view mode with original transcript
    expect(screen.getByText('Check-in Details')).toBeInTheDocument()
    expect(mockUpdateCheckIn).not.toHaveBeenCalled()
  })

  it('saves edited transcript on save button click', async () => {
    mockUpdateCheckIn.mockResolvedValueOnce({})
    const checkIn = createTestCheckIn()
    renderWithProvider(
      <CheckInDetail checkIn={checkIn} onClose={jest.fn()} />
    )

    await userEvent.click(screen.getByLabelText('Edit transcript'))

    // Modify the transcript
    const textarea = screen.getByRole('textbox')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'New transcript text')

    // Click save
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(mockUpdateCheckIn).toHaveBeenCalledWith({
        id: 'test-checkin-id',
        transcript: 'New transcript text',
        regenerateSummary: false,
      })
    })
  })

  it('saves with regenerateSummary when checkbox checked', async () => {
    mockUpdateCheckIn.mockResolvedValueOnce({})
    const checkIn = createTestCheckIn()
    renderWithProvider(
      <CheckInDetail checkIn={checkIn} onClose={jest.fn()} />
    )

    await userEvent.click(screen.getByLabelText('Edit transcript'))

    // Check the regenerate checkbox
    await userEvent.click(
      screen.getByLabelText(/Regenerate summary from edited transcript/i)
    )

    // Click save
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(mockUpdateCheckIn).toHaveBeenCalledWith({
        id: 'test-checkin-id',
        transcript: 'This is a test transcript.',
        regenerateSummary: true,
      })
    })
  })

  it('shows error message on save failure', async () => {
    mockUpdateCheckIn.mockRejectedValueOnce(new Error('Network error'))
    const checkIn = createTestCheckIn()
    renderWithProvider(
      <CheckInDetail checkIn={checkIn} onClose={jest.fn()} />
    )

    await userEvent.click(screen.getByLabelText('Edit transcript'))
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('disables save button when transcript is empty', async () => {
    const checkIn = createTestCheckIn()
    renderWithProvider(
      <CheckInDetail checkIn={checkIn} onClose={jest.fn()} />
    )

    await userEvent.click(screen.getByLabelText('Edit transcript'))

    const textarea = screen.getByRole('textbox')
    await userEvent.clear(textarea)

    const saveButton = screen.getByRole('button', { name: /save changes/i })
    expect(saveButton).toBeDisabled()
  })
})

describe('CheckInDetail Delete', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows confirmation dialog on delete click', async () => {
    const checkIn = createTestCheckIn()
    renderWithProvider(
      <CheckInDetail checkIn={checkIn} onClose={jest.fn()} />
    )

    await userEvent.click(screen.getByLabelText('Delete check-in'))

    expect(screen.getByText('Delete Check-in')).toBeInTheDocument()
    expect(
      screen.getByText(/This will permanently delete this check-in/i)
    ).toBeInTheDocument()
  })

  it('deletes check-in when confirmed', async () => {
    mockDeleteCheckIn.mockResolvedValueOnce(undefined)
    const onClose = jest.fn()
    const onDeleted = jest.fn()
    const checkIn = createTestCheckIn()

    renderWithProvider(
      <CheckInDetail checkIn={checkIn} onClose={onClose} onDeleted={onDeleted} />
    )

    await userEvent.click(screen.getByLabelText('Delete check-in'))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(mockDeleteCheckIn).toHaveBeenCalledWith('test-checkin-id')
      expect(onDeleted).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('cancels deletion when dialog dismissed', async () => {
    const checkIn = createTestCheckIn()
    renderWithProvider(
      <CheckInDetail checkIn={checkIn} onClose={jest.fn()} />
    )

    await userEvent.click(screen.getByLabelText('Delete check-in'))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockDeleteCheckIn).not.toHaveBeenCalled()
    // Dialog should be closed
    expect(
      screen.queryByText(/This will permanently delete this check-in/i)
    ).not.toBeInTheDocument()
  })

  it('shows error on delete failure', async () => {
    mockDeleteCheckIn.mockRejectedValueOnce(new Error('Delete failed'))
    const checkIn = createTestCheckIn()
    renderWithProvider(
      <CheckInDetail checkIn={checkIn} onClose={jest.fn()} />
    )

    await userEvent.click(screen.getByLabelText('Delete check-in'))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument()
    })
  })
})

describe('ConfirmDialog', () => {
  it('renders with title and message', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm Action"
        message="Are you sure you want to proceed?"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    )

    expect(screen.getByText('Confirm Action')).toBeInTheDocument()
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument()
  })

  it('calls onConfirm when confirm clicked', async () => {
    const onConfirm = jest.fn()
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('calls onCancel when cancel clicked', async () => {
    const onCancel = jest.fn()
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('closes on Escape key', async () => {
    const onCancel = jest.fn()
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('closes on backdrop click', async () => {
    const onCancel = jest.fn()
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />
    )

    // Click on the backdrop (the dialog container)
    const backdrop = document.querySelector('[role="alertdialog"]')
    if (backdrop) {
      await userEvent.click(backdrop)
      expect(onCancel).toHaveBeenCalled()
    }
  })

  it('shows loading state when isPending', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        isPending={true}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    )

    // The confirm button should be disabled
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('uses custom button labels', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Confirm"
        message="Are you sure?"
        confirmLabel="Yes, remove it"
        cancelLabel="No, keep it"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Yes, remove it' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No, keep it' })).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    render(
      <ConfirmDialog
        isOpen={false}
        title="Confirm"
        message="Are you sure?"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    )

    expect(screen.queryByText('Confirm')).not.toBeInTheDocument()
  })
})
