"""Schemas for chat endpoints."""

from pydantic import BaseModel


class ChatStreamRequest(BaseModel):
    """Request body for chat streaming."""

    message: str
    conversation_id: str
