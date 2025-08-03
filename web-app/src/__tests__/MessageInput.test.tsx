import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MessageInput } from '@/components/chat/MessageInput'

describe('MessageInput', () => {
  const mockOnSendMessage = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders textarea and send button', () => {
    render(<MessageInput onSendMessage={mockOnSendMessage} />)

    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument()
  })

  it('calls onSendMessage when send button is clicked', async () => {
    const user = userEvent.setup()
    render(<MessageInput onSendMessage={mockOnSendMessage} />)

    const input = screen.getByRole('textbox')
    await user.type(input, 'Hello world')

    const sendButton = screen.getByRole('button', { name: /send message/i })
    await user.click(sendButton)

    expect(mockOnSendMessage).toHaveBeenCalledWith('Hello world')
  })

  it('calls onSendMessage when Enter is pressed', async () => {
    const user = userEvent.setup()
    render(<MessageInput onSendMessage={mockOnSendMessage} />)

    const input = screen.getByRole('textbox')
    await user.type(input, 'Hello{enter}')

    expect(mockOnSendMessage).toHaveBeenCalledWith('Hello')
  })

  it('does not send on Shift+Enter (allows newline)', async () => {
    const user = userEvent.setup()
    render(<MessageInput onSendMessage={mockOnSendMessage} />)

    const input = screen.getByRole('textbox')
    await user.type(input, 'Hello{Shift>}{enter}{/Shift}')

    expect(mockOnSendMessage).not.toHaveBeenCalled()
  })

  it('clears input after sending', async () => {
    const user = userEvent.setup()
    render(<MessageInput onSendMessage={mockOnSendMessage} />)

    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    await user.type(input, 'Hello')

    const sendButton = screen.getByRole('button', { name: /send message/i })
    await user.click(sendButton)

    expect(input.value).toBe('')
  })

  it('disables send button when input is empty', () => {
    render(<MessageInput onSendMessage={mockOnSendMessage} />)

    const sendButton = screen.getByRole('button', { name: /send message/i })
    expect(sendButton).toBeDisabled()
  })

  it('enables send button when input has content', async () => {
    const user = userEvent.setup()
    render(<MessageInput onSendMessage={mockOnSendMessage} />)

    const input = screen.getByRole('textbox')
    await user.type(input, 'Hello')

    const sendButton = screen.getByRole('button', { name: /send message/i })
    expect(sendButton).not.toBeDisabled()
  })

  it('disables input and button when disabled prop is true', () => {
    render(<MessageInput onSendMessage={mockOnSendMessage} disabled />)

    const input = screen.getByRole('textbox')
    const sendButton = screen.getByRole('button', { name: /send message/i })

    expect(input).toBeDisabled()
    expect(sendButton).toBeDisabled()
  })

  it('shows "Thinking..." when isSending is true', () => {
    render(<MessageInput onSendMessage={mockOnSendMessage} isSending />)

    expect(screen.getByText('Thinking...')).toBeInTheDocument()
  })

  it('disables input while sending', () => {
    render(<MessageInput onSendMessage={mockOnSendMessage} isSending />)

    const input = screen.getByRole('textbox')
    expect(input).toBeDisabled()
  })

  it('has proper touch target size (44x44px)', () => {
    render(<MessageInput onSendMessage={mockOnSendMessage} />)

    const sendButton = screen.getByRole('button', { name: /send message/i })
    expect(sendButton).toHaveClass('min-h-[44px]')
    expect(sendButton).toHaveClass('min-w-[44px]')
  })

  it('trims whitespace from message', async () => {
    const user = userEvent.setup()
    render(<MessageInput onSendMessage={mockOnSendMessage} />)

    const input = screen.getByRole('textbox')
    await user.type(input, '  Hello world  ')

    const sendButton = screen.getByRole('button', { name: /send message/i })
    await user.click(sendButton)

    expect(mockOnSendMessage).toHaveBeenCalledWith('Hello world')
  })

  it('does not send empty or whitespace-only message', async () => {
    const user = userEvent.setup()
    render(<MessageInput onSendMessage={mockOnSendMessage} />)

    const input = screen.getByRole('textbox')
    await user.type(input, '   ')

    const sendButton = screen.getByRole('button', { name: /send message/i })
    // Button should still be disabled for whitespace-only
    expect(sendButton).toBeDisabled()
  })
})
