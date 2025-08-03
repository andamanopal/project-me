import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useConversations,
  useConversation,
  useCreateConversation,
} from '@/hooks/useConversations'

// Mock useAuth hook
const mockUser = { id: 'test-user-id', email: 'test@example.com' }
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, isPending: false }),
}))

// Mock Supabase client
const mockGetSession = jest.fn()
jest.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
  }),
}))

// Mock fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

// Helper to wrap hook with providers
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useConversations', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    })
  })

  it('returns empty array when no conversations exist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    })

    const { result } = renderHook(() => useConversations(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    expect(result.current.conversations).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('returns conversations list on success', async () => {
    const mockConversations = [
      {
        id: 'conv-1',
        user_id: 'test-user-id',
        title: 'First Chat',
        created_at: '2026-01-01T10:00:00Z',
        updated_at: '2026-01-01T11:00:00Z',
      },
    ]

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConversations),
    })

    const { result } = renderHook(() => useConversations(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    expect(result.current.conversations).toHaveLength(1)
    expect(result.current.conversations[0].title).toBe('First Chat')
  })

  it('passes pagination parameters to API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    })

    renderHook(() => useConversations({ limit: 10, offset: 5 }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    const fetchUrl = mockFetch.mock.calls[0][0]
    expect(fetchUrl).toContain('limit=10')
    expect(fetchUrl).toContain('offset=5')
  })

  it('includes auth headers in request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    })

    renderHook(() => useConversations(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    const fetchOptions = mockFetch.mock.calls[0][1]
    expect(fetchOptions.headers.Authorization).toBe('Bearer test-token')
    expect(fetchOptions.headers['X-User-Id']).toBe('test-user-id')
  })

  it('handles fetch error', async () => {
    // Mock fetch to fail consistently (hook retries 2 times)
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: 'Server error' } }),
    })

    const { result } = renderHook(() => useConversations(), {
      wrapper: createWrapper(),
    })

    // Wait longer due to retry behavior (2 retries with 1s delay each)
    await waitFor(
      () => {
        expect(result.current.error).not.toBeNull()
      },
      { timeout: 5000 }
    )

    expect(result.current.error?.message).toContain('Server error')
  })
})

describe('useConversation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    })
  })

  it('returns null when no conversationId provided', async () => {
    const { result } = renderHook(() => useConversation(undefined), {
      wrapper: createWrapper(),
    })

    // Should not fetch, return null immediately
    expect(result.current.conversation).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches conversation with messages', async () => {
    const mockConversation = {
      id: 'conv-1',
      user_id: 'test-user-id',
      title: 'Test Chat',
      created_at: '2026-01-01T10:00:00Z',
      updated_at: '2026-01-01T11:00:00Z',
      messages: [
        {
          id: 'msg-1',
          conversation_id: 'conv-1',
          role: 'user',
          content: 'Hello',
          created_at: '2026-01-01T10:00:00Z',
        },
      ],
      welcome_message: 'Good morning!',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConversation),
    })

    const { result } = renderHook(() => useConversation('conv-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    expect(result.current.conversation).not.toBeNull()
    expect(result.current.conversation?.id).toBe('conv-1')
    expect(result.current.conversation?.messages).toHaveLength(1)
    expect(result.current.conversation?.welcome_message).toBe('Good morning!')
  })

  it('returns null for 404 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    const { result } = renderHook(() => useConversation('nonexistent'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
    })

    expect(result.current.conversation).toBeNull()
  })
})

describe('useCreateConversation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    })
  })

  it('creates conversation via POST request', async () => {
    const mockNewConversation = {
      id: 'new-conv-id',
      user_id: 'test-user-id',
      title: null,
      created_at: '2026-01-01T10:00:00Z',
      updated_at: '2026-01-01T10:00:00Z',
      messages: [],
      welcome_message: 'Good morning!',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockNewConversation),
    })

    const { result } = renderHook(() => useCreateConversation(), {
      wrapper: createWrapper(),
    })

    const conversation = await result.current.createConversation()

    expect(conversation.id).toBe('new-conv-id')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/conversations'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        }),
      })
    )
  })

  it('sends title in request body when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'new-conv-id',
          title: 'Custom Title',
          messages: [],
        }),
    })

    const { result } = renderHook(() => useCreateConversation(), {
      wrapper: createWrapper(),
    })

    await result.current.createConversation('Custom Title')

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(fetchBody.title).toBe('Custom Title')
  })

  it('throws error on failed creation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: 'Creation failed' } }),
    })

    const { result } = renderHook(() => useCreateConversation(), {
      wrapper: createWrapper(),
    })

    await expect(result.current.createConversation()).rejects.toThrow(
      'Creation failed'
    )
  })
})
