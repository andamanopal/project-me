"""Schemas for check-in endpoints."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class EmotionData(BaseModel):
    """Emotion with context from summary."""

    emotion: str
    context: str


class SummaryData(BaseModel):
    """Structured summary from LLM extraction."""

    events: List[str] = []
    emotions: List[EmotionData] = []
    goals: List[str] = []
    concerns: List[str] = []
    generated_at: Optional[str] = None
    error: Optional[str] = None


class CheckInResponse(BaseModel):
    """Response for a single check-in."""

    id: str
    user_id: str
    status: str
    transcript: Optional[str] = None
    summary: Optional[SummaryData] = None
    audio_url: Optional[str] = None
    created_at: str
    updated_at: str


class UpdateCheckInRequest(BaseModel):
    """Request body for updating a check-in."""

    transcript: str
    regenerate_summary: bool = False
