"""Schemas for daily summaries endpoints."""

from pydantic import BaseModel


class SourceEntry(BaseModel):
    """A source that contributed to the daily summary."""

    source_type: str  # "check_in", "lifelog", etc.
    source_id: str
    timestamp: str | None = None


class DailySummaryResponse(BaseModel):
    """Single daily summary response."""

    id: str
    summary_date: str  # YYYY-MM-DD
    summary_text: str | None
    source_entries: list[SourceEntry]
    generated_at: str | None
    created_at: str
    updated_at: str


class DailySummarySearchResult(BaseModel):
    """Search result from daily summaries."""

    summary_date: str
    snippet: str
    content: str


class DailySummarySearchResponse(BaseModel):
    """Response for daily summary search."""

    query: str
    results: list[DailySummarySearchResult]
    count: int


class CalendarResponse(BaseModel):
    """Response for calendar data."""

    year: int
    month: int
    dates: dict[str, int]  # {"2025-01-15": 1, "2025-01-16": 1} - 1 if summary exists


class DateSummaryResponse(BaseModel):
    """Response for a specific date's summary with drill-down."""

    date: str
    summary: DailySummaryResponse | None
    source_count: int


class UpdateDailySummaryRequest(BaseModel):
    """Request body for updating a daily summary."""

    summary_text: str
