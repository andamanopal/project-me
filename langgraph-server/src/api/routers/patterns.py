"""Pattern detection endpoints for Project-Me.

Endpoints:
- GET /api/patterns - Get user's detected patterns
- POST /api/patterns/refresh - Trigger on-demand pattern detection

This router exposes the pattern detection service from Story 3-3
to provide user-scoped pattern insights via REST API.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

from src.api.deps import get_user_id_from_request
from src.api.schemas import PatternRecord, PatternsResponse, RefreshResponse
from src.services.pattern_detector import (
    PatternDetectionError,
    detect_patterns,
    get_user_patterns,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/patterns", tags=["patterns"])


@router.get("", response_model=PatternsResponse)
async def list_patterns(
    request: Request,
    pattern_type: Optional[str] = Query(
        None,
        description="Filter by pattern type: recurring_topic, unmet_goal, emotional_trend",
    ),
    actionable_only: bool = Query(False, description="Only return actionable patterns"),
) -> PatternsResponse:
    """Get user's detected patterns.

    Returns patterns detected during nightly batch processing or on-demand refresh.
    Patterns include:
    - recurring_topic: Topics mentioned 3+ times
    - unmet_goal: Goals mentioned but not achieved (flagged as actionable)
    - emotional_trend: Sentiment patterns over time

    Args:
        request: FastAPI request (for auth).
        pattern_type: Optional filter by pattern type.
        actionable_only: If True, only return patterns flagged for proactive nudges.

    Returns:
        PatternsResponse with user's patterns and count.

    Raises:
        HTTPException: If authentication fails.
    """
    user_id = get_user_id_from_request(request)

    try:
        patterns = await get_user_patterns(
            user_id=user_id,
            pattern_type=pattern_type,
            actionable_only=actionable_only,
        )

        # Convert to response model
        pattern_records = []
        for p in patterns:
            pattern_records.append(
                PatternRecord(
                    id=p.get("id", ""),
                    user_id=p.get("user_id", ""),
                    pattern_type=p.get("pattern_type", ""),
                    pattern_data=p.get("pattern_data", {}),
                    evidence_ids=p.get("evidence_ids", []),
                    is_actionable=p.get("is_actionable", False),
                    detected_at=p.get("detected_at", ""),
                )
            )

        logger.info(
            f"Patterns list: user={user_id[:8]}... "
            f"type={pattern_type} actionable={actionable_only} "
            f"found={len(pattern_records)}"
        )

        return PatternsResponse(
            patterns=pattern_records,
            count=len(pattern_records),
        )

    except Exception as e:
        logger.error(f"Patterns list failed: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "PATTERNS_ERROR",
                    "message": "Failed to fetch patterns.",
                }
            },
        )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_patterns(request: Request) -> RefreshResponse:
    """Trigger on-demand pattern detection.

    Analyzes user's recent memories (last 30 days) to detect patterns.
    Requires at least 10 check-ins for meaningful pattern detection.

    This is a potentially slow operation (uses LLM analysis) and should
    be called sparingly. Patterns are normally updated by nightly batch job.

    Args:
        request: FastAPI request (for auth).

    Returns:
        RefreshResponse with count of patterns detected.

    Raises:
        HTTPException: If detection fails or insufficient data.
    """
    user_id = get_user_id_from_request(request)

    try:
        patterns = await detect_patterns(user_id)

        if not patterns:
            return RefreshResponse(
                message="Not enough check-ins for pattern detection (need 10+)",
                patterns_detected=0,
            )

        logger.info(
            f"Pattern refresh: user={user_id[:8]}... detected={len(patterns)}"
        )

        return RefreshResponse(
            message=f"Successfully detected {len(patterns)} patterns",
            patterns_detected=len(patterns),
        )

    except PatternDetectionError as e:
        logger.error(f"Pattern refresh failed: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "PATTERN_DETECTION_ERROR",
                    "message": str(e),
                }
            },
        )
    except Exception as e:
        logger.error(f"Pattern refresh failed: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "REFRESH_ERROR",
                    "message": "Failed to refresh patterns.",
                }
            },
        )
