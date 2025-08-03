import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ChatPage from '@/app/(dashboard)/chat/page'
import { ConversationList } from '@/components/chat/ConversationList'
import { ChatContainer } from '@/components/chat/ChatContainer'
import { WelcomeMessage } from '@/components/chat/WelcomeMessage'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}))

// Mock useAuth hook
const mockUseAuth: {
  user: { id: string; email: string } | null
  isPending: boolean
} = {
  user: { id: 'test-user-id', email: 'test@example.com' },
  isPending: false,
}

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth,
}))

// Mock useConversations hooks
const mockUseConversations = jest.fn()
const mockUseConversation = jest.fn()
const mockUseCreateConversation = jest.fn()

jest.mock('@/hooks/useConversations', () => ({
  useConversations: () => mockUseConversations(),
  useConversation: (id: string | undefined) => mockUseConversation(id),
  useCreateConversation: () => mockUseCreateConversation(),
}))

// Mock useChatStream hook
const mockSendMessage = jest.fn()
const mockClearStream = jest.fn()
const mockCancelStream = jest.fn()

jest.mock('@/hooks/useChatStream', () => ({
  useChatStream: () => ({
    isStreaming: false,
    streamedContent: '',
    error: null,
    sendMessage: mockSendMessage,
    clearStream: mockClearStream,
    cancelStream: mockCancelStream,
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

describe('ChatPage', () => {
  beforeEach(() => {
    mockUseAuth.user = { id: 'test-user-id', email: 'test@example.com' }
    mockUseAuth.isPending = false

    // Set up conversation hook mocks with default return values
    mockUseConversations.mockReturnValue({
      conversations: [],
      isPending: false,
      error: null,
      refetch: jest.fn(),
    })
    mockUseConversation.mockReturnValue({
      conversation: null,
      isPending: false,
      error: null,
    })
    mockUseCreateConversation.mockReturnValue({
      createConversation: jest.fn().mockResolvedValue({ id: 'new-conv' }),
      isPending: false,
    })
  })

  it('renders chat container when authenticated', async () => {
    renderWithProviders(<ChatPage />)

    // Should show loading initially
    await waitFor(() => {
      expect(screen.getByText('Chat')).toBeInTheDocument()
    })
  })

  it('shows loading skeleton while checking auth', () => {
    mockUseAuth.isPending = true

    renderWithProviders(<ChatPage />)

    // Should show loading skeleton (pulse animation)
    const skeleton = document.querySelector('.animate-pulse')
    expect(skeleton).toBeInTheDocument()
  })

  it('does not render when not authenticated', () => {
    mockUseAuth.user = null
    mockUseAuth.isPending = false

    const { container } = renderWithProviders(<ChatPage />)

    // Should render nothing (will redirect)
    expect(container.innerHTML).toBe('')
  })
})

describe('ConversationList', () => {
  const mockConversations = [
    {
      id: 'conv-1',
      title: 'First Chat',
      created_at: '2026-01-01T10:00:00Z',
      updated_at: '2026-01-01T11:00:00Z',
    },
    {
      id: 'conv-2',
      title: null,
      created_at: '2026-01-01T09:00:00Z',
      updated_at: '2026-01-01T09:30:00Z',
    },
  ]

  it('renders new conversation button', () => {
    const onNewConversation = jest.fn()

    render(
      <ConversationList
        conversations={[]}
        onSelect={jest.fn()}
        onNewConversation={onNewConversation}
        isPending={false}
      />
    )

    const button = screen.getByRole('button', { name: /new conversation/i })
    expect(button).toBeInTheDocument()

    fireEvent.click(button)
    expect(onNewConversation).toHaveBeenCalled()
  })

  it('renders conversation list items', () => {
    render(
      <ConversationList
        conversations={mockConversations}
        onSelect={jest.fn()}
        onNewConversation={jest.fn()}
        isPending={false}
      />
    )

    expect(screen.getByText('First Chat')).toBeInTheDocument()
    // Null title should show "New conversation"
    expect(screen.getByText('New conversation')).toBeInTheDocument()
  })

  it('shows loading skeleton when pending', () => {
    render(
      <ConversationList
        conversations={[]}
        onSelect={jest.fn()}
        onNewConversation={jest.fn()}
        isPending={true}
      />
    )

    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows empty state when no conversations', () => {
    render(
      <ConversationList
        conversations={[]}
        onSelect={jest.fn()}
        onNewConversation={jest.fn()}
        isPending={false}
      />
    )

    expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument()
  })

  it('highlights selected conversation', () => {
    render(
      <ConversationList
        conversations={mockConversations}
        selectedId="conv-1"
        onSelect={jest.fn()}
        onNewConversation={jest.fn()}
        isPending={false}
      />
    )

    const selectedButton = screen.getByRole('button', { name: /first chat/i })
    expect(selectedButton).toHaveAttribute('aria-selected', 'true')
  })

  it('calls onSelect when conversation clicked', () => {
    const onSelect = jest.fn()

    render(
      <ConversationList
        conversations={mockConversations}
        onSelect={onSelect}
        onNewConversation={jest.fn()}
        isPending={false}
      />
    )

    fireEvent.click(screen.getByText('First Chat'))
    expect(onSelect).toHaveBeenCalledWith('conv-1')
  })

  it('has proper touch target size (44x44px)', () => {
    render(
      <ConversationList
        conversations={[]}
        onSelect={jest.fn()}
        onNewConversation={jest.fn()}
        isPending={false}
      />
    )

    const newButton = screen.getByRole('button', { name: /new conversation/i })
    expect(newButton).toHaveClass('min-h-[44px]')
  })
})

describe('ChatContainer', () => {
  const mockConversation = {
    id: 'conv-1',
    title: 'Test Chat',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T11:00:00Z',
    messages: [],
    welcome_message: 'Good morning! How can I help?',
  }

  it('shows welcome message for empty conversation', () => {
    render(
      <ChatContainer
        conversations={[]}
        selectedConversation={mockConversation}
        onSelectConversation={jest.fn()}
        onNewConversation={jest.fn()}
        isLoadingList={false}
        isLoadingConversation={false}
      />
    )

    expect(screen.getByText('Good morning! How can I help?')).toBeInTheDocument()
  })

  it('shows placeholder when no conversation selected', () => {
    render(
      <ChatContainer
        conversations={[]}
        selectedConversation={undefined}
        onSelectConversation={jest.fn()}
        onNewConversation={jest.fn()}
        isLoadingList={false}
        isLoadingConversation={false}
      />
    )

    expect(screen.getByText(/select a conversation/i)).toBeInTheDocument()
  })

  it('shows skeleton when loading conversation', () => {
    render(
      <ChatContainer
        conversations={[]}
        selectedConversation={undefined}
        onSelectConversation={jest.fn()}
        onNewConversation={jest.fn()}
        isLoadingList={false}
        isLoadingConversation={true}
      />
    )

    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('displays messages when conversation has them', () => {
    const conversationWithMessages = {
      ...mockConversation,
      messages: [
        {
          id: 'msg-1',
          conversation_id: 'conv-1',
          role: 'user' as const,
          content: 'Hello!',
          created_at: '2026-01-01T10:00:00Z',
        },
        {
          id: 'msg-2',
          conversation_id: 'conv-1',
          role: 'assistant' as const,
          content: 'Hi there!',
          created_at: '2026-01-01T10:00:01Z',
        },
      ],
    }

    render(
      <ChatContainer
        conversations={[]}
        selectedConversation={conversationWithMessages}
        onSelectConversation={jest.fn()}
        onNewConversation={jest.fn()}
        isLoadingList={false}
        isLoadingConversation={false}
      />
    )

    expect(screen.getByText('Hello!')).toBeInTheDocument()
    expect(screen.getByText('Hi there!')).toBeInTheDocument()
  })

  it('has mobile menu button', () => {
    render(
      <ChatContainer
        conversations={[]}
        selectedConversation={undefined}
        onSelectConversation={jest.fn()}
        onNewConversation={jest.fn()}
        isLoadingList={false}
        isLoadingConversation={false}
      />
    )

    const menuButton = screen.getByRole('button', { name: /open conversation list/i })
    expect(menuButton).toBeInTheDocument()
  })
})

describe('WelcomeMessage', () => {
  it('displays the provided message', () => {
    render(<WelcomeMessage message="Hello from Project-Me!" />)

    expect(screen.getByText('Hello from Project-Me!')).toBeInTheDocument()
  })

  it('displays default message when none provided', () => {
    render(<WelcomeMessage />)

    expect(screen.getByText(/I'm here to help/i)).toBeInTheDocument()
  })

  it('shows Project-Me branding', () => {
    render(<WelcomeMessage />)

    expect(screen.getByText('Project-Me')).toBeInTheDocument()
  })

  it('shows suggested prompts', () => {
    render(<WelcomeMessage />)

    expect(screen.getByText('How am I feeling today?')).toBeInTheDocument()
    expect(screen.getByText('What did I do yesterday?')).toBeInTheDocument()
    expect(screen.getByText('Any patterns in my week?')).toBeInTheDocument()
  })

  it('has fade-in animation class', () => {
    const { container } = render(<WelcomeMessage />)

    const animatedElement = container.querySelector('.animate-fade-in')
    expect(animatedElement).toBeInTheDocument()
  })
})
