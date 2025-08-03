"""Schemas for conversation endpoints."""

from typing import List, Optional

from pydantic import BaseModel


class MessageResponse(BaseModel):
    """Response for a single message.

    Note: No created_at field because LangGraph checkpoints don't store
    per-message timestamps. This is intentional and matches industry
    standard for AI chat apps (ChatGPT, Claude web don't show message times).
    """

    id: str
    conversation_id: str
    role: str
    content: str


class ConversationResponse(BaseModel):
    """Response for a single conversation."""

    id: str
    user_id: str
    title: Optional[str] = None
    created_at: str
    updated_at: str


class ConversationWithMessagesResponse(BaseModel):
    """Response for a conversation with its messages."""

    id: str
    user_id: str
    title: Optional[str] = None
    created_at: str
    updated_at: str
    messages: List[MessageResponse] = []
    welcome_message: Optional[str] = None


class CreateConversationRequest(BaseModel):
    """Request body for creating a conversation."""

    title: Optional[str] = None
