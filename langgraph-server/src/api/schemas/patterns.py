"""Schemas for pattern endpoints."""

from typing import Optional

from pydantic import BaseModel


class PatternData(BaseModel):
    """Pattern data model."""

    type: str
    is_actionable: bool = False
    evidence_ids: list[str] = []

    # Type-specific fields (one of these sets will be present)
    topic: Optional[str] = None
    count: Optional[int] = None
    goal: Optional[str] = None
    mentions: Optional[int] = None
    trend: Optional[str] = None
    direction: Optional[str] = None
    summary: Optional[str] = None


class PatternRecord(BaseModel):
    """Stored pattern record from database."""

    id: str
    user_id: str
    pattern_type: str
    pattern_data: dict
    evidence_ids: list[str]
    is_actionable: bool
    detected_at: str


class PatternsResponse(BaseModel):
    """Response for patterns list."""

    patterns: list[PatternRecord]
    count: int


class RefreshResponse(BaseModel):
    """Response for pattern refresh."""

    message: str
    patterns_detected: int
