"""Schemas for import endpoints."""

from typing import Optional

from pydantic import BaseModel


class ImportResponse(BaseModel):
    """Response for import initiation."""

    success: bool
    message: str
    import_id: str


class ImportStatusResponse(BaseModel):
    """Response for import status check."""

    status: str  # pending, processing, completed, failed
    message_count: Optional[int] = None
    error: Optional[str] = None
    completed_at: Optional[str] = None


class ImportStatsResponse(BaseModel):
    """Response for import statistics."""

    message_count: int
    oldest_message: Optional[str] = None
    newest_message: Optional[str] = None
    last_import_at: Optional[str] = None
