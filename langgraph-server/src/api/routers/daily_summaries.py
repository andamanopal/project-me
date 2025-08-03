"""Daily Summaries endpoints for Project-Me.

Endpoints:
- GET /api/daily-summaries/calendar - Get calendar data for a month
- GET /api/daily-summaries/{date_str} - Get summary for a specific date
- PATCH /api/daily-summaries/{date_str} - Update summary text (auto-syncs to ES)
- GET /api/daily-summaries/search - Search user memories

Uses Supabase as source of truth for calendar/date views.
Uses Elasticsearch for semantic search.
"""

import logging
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Path, Query, Request

from src.api.deps import get_user_id_from_request
from src.api.schemas.daily_summaries import (
    CalendarResponse,
    DailySummaryResponse,
    DailySummarySearchResponse,
    DailySummarySearchResult,
    DateSummaryResponse,
    SourceEntry,
    UpdateDailySummaryRequest,
)
from src.services.daily_summary import (
    _index_summary_to_es,
    get_daily_summary,
    search_daily_summaries,
)
from src.services.supabase import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/daily-summaries", tags=["daily-summaries"])


def extract_snippet(content: str, query: str, max_length: int = 150) -> str:
    """Extract snippet around query match."""
    if not content:
        return ""

    query_lower = query.lower()
    content_lower = content.lower()
    idx = content_lower.find(query_lower)

    if idx == -1:
        return content[:max_length] + "..." if len(content) > max_length else content

    start = max(0, idx - 50)
    end = min(len(content), idx + len(query) + 100)
    snippet = content[start:end]

    if start > 0:
        snippet = "..." + snippet
    if end < len(content):
        snippet = snippet + "..."

    return snippet


@router.get("/search", response_model=DailySummarySearchResponse)
async def search_summaries(
    request: Request,
    query: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=50, description="Maximum results to return"),
) -> DailySummarySearchResponse:
    """Search user's daily summaries by keyword.

    Uses hybrid search (BM25 + vector similarity) with recency boost
    on the daily_summaries Elasticsearch index.

    Args:
        request: FastAPI request (for auth).
        query: Search query string.
        limit: Maximum number of results (default: 20, max: 50).

    Returns:
        DailySummarySearchResponse with matching results and snippets.
    """
    user_id = get_user_id_from_request(request)

    try:
        raw_results = search_daily_summaries(
            query=query,
            user_id=user_id,
            top_k=limit,
        )

        results = []
        for r in raw_results:
            content = r.get("content", "")
            metadata = r.get("metadata", {})

            results.append(
                DailySummarySearchResult(
                    summary_date=metadata.get("summary_date", ""),
                    snippet=extract_snippet(content, query),
                    content=content,
                )
            )

        logger.info(
            f"Daily summary search: query='{query[:30]}...' user={user_id[:8]}... "
            f"found={len(results)}"
        )

        return DailySummarySearchResponse(
            query=query,
            results=results,
            count=len(results),
        )

    except Exception as e:
        logger.error(f"Daily summary search failed: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "SEARCH_ERROR",
                    "message": "Failed to search daily summaries.",
                }
            },
        )


@router.get("/calendar", response_model=CalendarResponse)
async def get_calendar_data(
    request: Request,
    year: int = Query(..., ge=2020, le=2100, description="Year"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
) -> CalendarResponse:
    """Get calendar data for a specific month.

    Returns dates that have daily summaries.
    Queries Supabase directly (source of truth).

    Args:
        request: FastAPI request (for auth).
        year: Year to query.
        month: Month to query (1-12).

    Returns:
        CalendarResponse with dates and their summary status.
    """
    user_id = get_user_id_from_request(request)

    try:
        client = get_supabase_client()
        if not client:
            return CalendarResponse(year=year, month=month, dates={})

        # Calculate month bounds
        start_date = f"{year}-{month:02d}-01"
        if month == 12:
            end_date = f"{year + 1}-01-01"
        else:
            end_date = f"{year}-{month + 1:02d}-01"

        # Query Supabase for summaries in this month
        response = (
            client.table("daily_summaries")
            .select("summary_date")
            .eq("user_id", user_id)
            .gte("summary_date", start_date)
            .lt("summary_date", end_date)
            .execute()
        )

        # Format: {"2025-01-15": 1, "2025-01-16": 1}
        dates: dict[str, int] = {}
        for row in response.data or []:
            dates[row["summary_date"]] = 1  # 1 summary per day

        logger.info(
            f"Calendar data: user={user_id[:8]}... year={year} month={month} "
            f"days_with_summaries={len(dates)}"
        )

        return CalendarResponse(year=year, month=month, dates=dates)

    except Exception as e:
        logger.error(f"Calendar data fetch failed: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "CALENDAR_ERROR",
                    "message": "Failed to fetch calendar data.",
                }
            },
        )


@router.get("/{date_str}", response_model=DateSummaryResponse)
async def get_date_summary(
    request: Request,
    date_str: str = Path(..., description="Date in YYYY-MM-DD format"),
) -> DateSummaryResponse:
    """Get daily summary for a specific date.

    Queries Supabase (source of truth) for the summary and source entries.
    Allows drill-down to individual sources.

    Args:
        request: FastAPI request (for auth).
        date_str: Date string in YYYY-MM-DD format.

    Returns:
        DateSummaryResponse with summary and source entries.
    """
    user_id = get_user_id_from_request(request)

    try:
        # Validate date format
        if len(date_str) != 10 or date_str[4] != "-" or date_str[7] != "-":
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INVALID_DATE",
                        "message": "Date must be in YYYY-MM-DD format.",
                    }
                },
            )

        # Parse date to validate
        try:
            target_date = date.fromisoformat(date_str)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INVALID_DATE",
                        "message": "Invalid date format.",
                    }
                },
            )

        # Get summary from Supabase (source of truth)
        summary_data = await get_daily_summary(user_id, target_date)

        if not summary_data:
            return DateSummaryResponse(
                date=date_str,
                summary=None,
                source_count=0,
            )

        # Parse source entries
        source_entries = []
        raw_sources = summary_data.get("source_entries", [])
        for s in raw_sources:
            source_entries.append(
                SourceEntry(
                    source_type=s.get("source_type", ""),
                    source_id=s.get("source_id", ""),
                    timestamp=s.get("timestamp"),
                )
            )

        summary = DailySummaryResponse(
            id=summary_data["id"],
            summary_date=summary_data["summary_date"],
            summary_text=summary_data.get("summary_text"),
            source_entries=source_entries,
            generated_at=summary_data.get("generated_at"),
            created_at=summary_data["created_at"],
            updated_at=summary_data["updated_at"],
        )

        logger.info(
            f"Date summary: user={user_id[:8]}... date={date_str} "
            f"sources={len(source_entries)}"
        )

        return DateSummaryResponse(
            date=date_str,
            summary=summary,
            source_count=len(source_entries),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Date summary fetch failed: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "DATE_SUMMARY_ERROR",
                    "message": "Failed to fetch date summary.",
                }
            },
        )


@router.patch("/{date_str}", response_model=DateSummaryResponse)
async def update_date_summary(
    request: Request,
    body: UpdateDailySummaryRequest,
    date_str: str = Path(..., description="Date in YYYY-MM-DD format"),
) -> DateSummaryResponse:
    """Update daily summary text for a specific date.

    Updates the summary in Supabase (source of truth) and
    automatically re-indexes to Elasticsearch.

    Args:
        request: FastAPI request (for auth).
        body: Request body with new summary_text.
        date_str: Date string in YYYY-MM-DD format.

    Returns:
        DateSummaryResponse with updated summary.
    """
    user_id = get_user_id_from_request(request)

    try:
        # Validate date format
        if len(date_str) != 10 or date_str[4] != "-" or date_str[7] != "-":
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INVALID_DATE",
                        "message": "Date must be in YYYY-MM-DD format.",
                    }
                },
            )

        # Parse date
        try:
            target_date = date.fromisoformat(date_str)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INVALID_DATE",
                        "message": "Invalid date format.",
                    }
                },
            )

        # Check if summary exists
        existing = await get_daily_summary(user_id, target_date)
        if not existing:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": {
                        "code": "NOT_FOUND",
                        "message": f"No summary found for {date_str}.",
                    }
                },
            )

        # Update in Supabase
        client = get_supabase_client()
        if not client:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": {
                        "code": "DATABASE_ERROR",
                        "message": "Database not available.",
                    }
                },
            )

        response = (
            client.table("daily_summaries")
            .update({
                "summary_text": body.summary_text,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("user_id", user_id)
            .eq("summary_date", date_str)
            .execute()
        )

        if not response.data:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": {
                        "code": "UPDATE_FAILED",
                        "message": "Failed to update summary.",
                    }
                },
            )

        # Re-index to Elasticsearch
        await _index_summary_to_es(
            user_id=user_id,
            summary_date=target_date,
            summary_text=body.summary_text,
        )

        logger.info(f"Updated summary: user={user_id[:8]}... date={date_str}")

        # Return updated summary
        updated = response.data[0]
        source_entries = []
        for s in updated.get("source_entries", []) or []:
            source_entries.append(
                SourceEntry(
                    source_type=s.get("source_type", ""),
                    source_id=s.get("source_id", ""),
                    timestamp=s.get("timestamp"),
                )
            )

        summary = DailySummaryResponse(
            id=updated["id"],
            summary_date=updated["summary_date"],
            summary_text=updated.get("summary_text"),
            source_entries=source_entries,
            generated_at=updated.get("generated_at"),
            created_at=updated["created_at"],
            updated_at=updated["updated_at"],
        )

        return DateSummaryResponse(
            date=date_str,
            summary=summary,
            source_count=len(source_entries),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Date summary update failed: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "UPDATE_ERROR",
                    "message": "Failed to update daily summary.",
                }
            },
        )
