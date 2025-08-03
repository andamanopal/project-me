"""Schemas for voice endpoints."""

from typing import Any, Dict, Optional

from pydantic import BaseModel


class TranscribeResponse(BaseModel):
    """Response for transcription trigger."""

    status: str
    check_in_id: str
    message: str


class CheckInStatusResponse(BaseModel):
    """Response for check-in status query."""

    id: str
    status: str
    transcript: Optional[str] = None
    summary: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: str
    updated_at: str
