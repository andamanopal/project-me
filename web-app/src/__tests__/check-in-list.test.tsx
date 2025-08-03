import { render, screen, fireEvent } from '@testing-library/react'
import { CheckInList } from '@/components/checkin/CheckInList'
import { useCheckIns, type CheckInData } from '@/hooks/useCheckIns'

// Mock the useCheckIns hook
jest.mock('@/hooks/useCheckIns')

const mockUseCheckIns = useCheckIns as jest.MockedFunction<typeof useCheckIns>

// Sample check-in data for tests
const mockCheckIn: CheckInData = {
  id: 'test-id-1',
  user_id: 'user-1',
  status: 'completed',
  transcript: 'Today was a productive day. I finished the project.',
  summary: {
    events: ['Finished project', 'Had team meeting'],
    emotions: [
      { emotion: 'accomplished', context: 'completing the project' },
      { emotion: 'tired', context: 'long workday' },
    ],
    goals: ['Start next sprint planning'],
    concerns: [],
    generated_at: '2025-12-31T10:00:00Z',
  },
  audio_url: 'https://example.com/audio.webm',
  created_at: '2025-12-31T08:00:00Z',
  updated_at: '2025-12-31T08:05:00Z',
}

const mockProcessingCheckIn: CheckInData = {
  ...mockCheckIn,
  id: 'test-id-2',
  status: 'processing',
  transcript: null,
  summary: null,
}

describe('CheckInList', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Loading State', () => {
    it('shows skeleton loading while data is pending', () => {
      mockUseCheckIns.mockReturnValue({
        checkIns: [],
        isPending: true,
        hasProcessing: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<CheckInList />)

      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        'Loading check-ins'
      )
    })

    it('renders multiple skeleton items during loading', () => {
      mockUseCheckIns.mockReturnValue({
        checkIns: [],
        isPending: true,
        hasProcessing: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<CheckInList />)

      const skeletons = screen.getAllByRole('article', { hidden: true })
      expect(skeletons).toHaveLength(5) // Default non-compact mode
    })

    it('renders fewer skeletons in compact mode', () => {
      mockUseCheckIns.mockReturnValue({
        checkIns: [],
        isPending: true,
        hasProcessing: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<CheckInList compact />)

      const skeletons = screen.getAllByRole('article', { hidden: true })
      expect(skeletons).toHaveLength(3) // Compact mode
    })
  })

  describe('Error State', () => {
    it('shows error message when fetch fails', () => {
      mockUseCheckIns.mockReturnValue({
        checkIns: [],
        isPending: false,
        hasProcessing: false,
        error: new Error('Network error'),
        refetch: jest.fn(),
      })

      render(<CheckInList />)

      expect(screen.getByText("Couldn't load check-ins")).toBeInTheDocument()
    })

    it('shows retry button on error', () => {
      mockUseCheckIns.mockReturnValue({
        checkIns: [],
        isPending: false,
        hasProcessing: false,
        error: new Error('Network error'),
        refetch: jest.fn(),
      })

      render(<CheckInList />)

      expect(screen.getByText('Tap to retry')).toBeInTheDocument()
    })

    it('calls refetch when retry button is clicked', () => {
      const refetch = jest.fn()
      mockUseCheckIns.mockReturnValue({
        checkIns: [],
        isPending: false,
        hasProcessing: false,
        error: new Error('Network error'),
        refetch,
      })

      render(<CheckInList />)

      fireEvent.click(screen.getByText('Tap to retry'))
      expect(refetch).toHaveBeenCalled()
    })
  })

  describe('Empty State', () => {
    it('shows empty state when no check-ins exist', () => {
      mockUseCheckIns.mockReturnValue({
        checkIns: [],
        isPending: false,
        hasProcessing: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<CheckInList />)

      expect(screen.getByText('No check-ins yet')).toBeInTheDocument()
    })

    it('shows generic empty message without date filter', () => {
      mockUseCheckIns.mockReturnValue({
        checkIns: [],
        isPending: false,
        hasProcessing: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<CheckInList />)

      expect(
        screen.getByText(/Start your first one! Record your thoughts/)
      ).toBeInTheDocument()
    })

    it('shows date-specific empty message with date filter', () => {
      mockUseCheckIns.mockReturnValue({
        checkIns: [],
        isPending: false,
        hasProcessing: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<CheckInList date="2025-12-31" />)

      expect(
        screen.getByText('No check-ins recorded on this date.')
      ).toBeInTheDocument()
    })
  })

  describe('Check-in Display', () => {
    it('renders check-in cards when data is available', () => {
      mockUseCheckIns.mockReturnValue({
        checkIns: [mockCheckIn],
        isPending: false,
        hasProcessing: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<CheckInList />)

      // The CheckInSummaryCard should render - check for events from summary
      expect(screen.getByText('Finished project')).toBeInTheDocument()
    })

    it('renders multiple check-ins', () => {
      const secondCheckIn = { ...mockCheckIn, id: 'test-id-3' }
      mockUseCheckIns.mockReturnValue({
        checkIns: [mockCheckIn, secondCheckIn],
        isPending: false,
        hasProcessing: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<CheckInList />)

      // Should have two cards with events
      const eventElements = screen.getAllByText('Finished project')
      expect(eventElements).toHaveLength(2)
    })
  })

  describe('Compact Mode', () => {
    it('shows "View all" button when check-ins >= limit in compact mode', () => {
      const checkIns = Array(5)
        .fill(null)
        .map((_, i) => ({
          ...mockCheckIn,
          id: `test-id-${i}`,
        }))

      mockUseCheckIns.mockReturnValue({
        checkIns,
        isPending: false,
        hasProcessing: false,
        error: null,
        refetch: jest.fn(),
      })

      const onViewAll = jest.fn()
      render(<CheckInList compact limit={5} onViewAll={onViewAll} />)

      expect(screen.getByText('View all check-ins →')).toBeInTheDocument()
    })

    it('calls onViewAll when "View all" is clicked', () => {
      const checkIns = Array(5)
        .fill(null)
        .map((_, i) => ({
          ...mockCheckIn,
          id: `test-id-${i}`,
        }))

      mockUseCheckIns.mockReturnValue({
        checkIns,
        isPending: false,
        hasProcessing: false,
        error: null,
        refetch: jest.fn(),
      })

      const onViewAll = jest.fn()
      render(<CheckInList compact limit={5} onViewAll={onViewAll} />)

      fireEvent.click(screen.getByText('View all check-ins →'))
      expect(onViewAll).toHaveBeenCalled()
    })

    it('does not show "View all" when fewer check-ins than limit', () => {
      mockUseCheckIns.mockReturnValue({
        checkIns: [mockCheckIn],
        isPending: false,
        hasProcessing: false,
        error: null,
        refetch: jest.fn(),
      })

      const onViewAll = jest.fn()
      render(<CheckInList compact limit={5} onViewAll={onViewAll} />)

      expect(
        screen.queryByText('View all check-ins →')
      ).not.toBeInTheDocument()
    })
  })

  describe('Detail Modal', () => {
    it('opens detail modal when check-in is clicked', () => {
      mockUseCheckIns.mockReturnValue({
        checkIns: [mockCheckIn],
        isPending: false,
        hasProcessing: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<CheckInList />)

      // Click on the check-in card (use the article element)
      const card = screen.getByRole('article', {
        name: /Check-in from/i,
      })
      fireEvent.click(card)

      // Modal should open
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  describe('Hook Integration', () => {
    it('passes date filter to useCheckIns', () => {
      mockUseCheckIns.mockReturnValue({
        checkIns: [],
        isPending: false,
        hasProcessing: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<CheckInList date="2025-12-25" />)

      expect(mockUseCheckIns).toHaveBeenCalledWith({
        date: '2025-12-25',
        limit: 20,
      })
    })

    it('passes limit to useCheckIns', () => {
      mockUseCheckIns.mockReturnValue({
        checkIns: [],
        isPending: false,
        hasProcessing: false,
        error: null,
        refetch: jest.fn(),
      })

      render(<CheckInList limit={10} />)

      expect(mockUseCheckIns).toHaveBeenCalledWith({
        date: undefined,
        limit: 10,
      })
    })
  })
})

describe('CheckInSummaryCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('displays processing state for in-progress check-ins', () => {
    mockUseCheckIns.mockReturnValue({
      checkIns: [mockProcessingCheckIn],
      isPending: false,
      hasProcessing: true,
      error: null,
      refetch: jest.fn(),
    })

    render(<CheckInList />)

    // Processing check-ins show a skeleton with aria-busy
    const skeleton = screen.getByRole('article', { name: /Loading check-in/i })
    expect(skeleton).toHaveAttribute('aria-busy', 'true')
  })

  it('shows summary sections when available', () => {
    mockUseCheckIns.mockReturnValue({
      checkIns: [mockCheckIn],
      isPending: false,
      hasProcessing: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<CheckInList />)

    // Summary sections should be visible directly on the card
    // Events section
    expect(screen.getByText('Finished project')).toBeInTheDocument()

    // Emotions section (in Feelings section)
    expect(screen.getByText('accomplished')).toBeInTheDocument()
  })

  it('shows events and feelings sections', () => {
    mockUseCheckIns.mockReturnValue({
      checkIns: [mockCheckIn],
      isPending: false,
      hasProcessing: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<CheckInList />)

    expect(screen.getByText('Events')).toBeInTheDocument()
    expect(screen.getByText('Feelings')).toBeInTheDocument()
  })
})
