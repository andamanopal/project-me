"""Pattern detection service for Story 3.3.

Detects recurring patterns in user check-in history:
- recurring_topic: Topics mentioned 3+ times
- unmet_goal: Goals mentioned but not achieved
- emotional_trend: Sentiment patterns over time

Uses Claude Haiku for cost-effective analysis.
"""

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

from src.services.daily_summary import search_daily_summaries
from src.services.supabase import get_supabase_client

logger = logging.getLogger(__name__)

# Use Haiku for cost optimization
PATTERN_MODEL = "claude-3-haiku-20240307"
PATTERN_TIMEOUT = 30.0
MIN_CHECKINS_FOR_PATTERNS = 10


class PatternDetectionError(Exception):
    """Raised when pattern detection fails."""

    pass


def thirty_days_ago() -> date:
    """Get date for 30 days ago."""
    return (datetime.now(timezone.utc) - timedelta(days=30)).date()


def format_summaries_for_analysis(summaries: list[dict]) -> str:
    """Format daily summaries for LLM analysis.

    Args:
        summaries: List of daily summary documents from elasticsearch.

    Returns:
        Formatted string for LLM prompt.
    """
    formatted = []
    for i, summary in enumerate(summaries, 1):
        content = summary.get("content", "")[:500]  # Truncate long content
        summary_date = summary.get("metadata", {}).get("summary_date", "unknown")

        formatted.append(f"[{i}] Date: {summary_date}\nContent: {content}\n")

    return "\n".join(formatted)


async def detect_patterns(
    user_id: str,
    min_checkins: int = MIN_CHECKINS_FOR_PATTERNS,
) -> list[dict]:
    """Detect patterns in user's memory history.

    Only runs if user has sufficient check-in entries.

    Args:
        user_id: User ID for scoping.
        min_checkins: Minimum number of check-ins required.

    Returns:
        List of detected patterns.

    Raises:
        PatternDetectionError: If detection fails.
    """
    try:
        # 1. Fetch recent daily summaries (last 30 days, max 50)
        memories = search_daily_summaries(
            query=None,  # No query = time-based fetch
            user_id=user_id,
            top_k=50,
            start_date=thirty_days_ago(),
        )

        if len(memories) < min_checkins:
            logger.info(
                f"User {user_id[:8]}... has {len(memories)} daily summaries, "
                f"need {min_checkins} for pattern detection"
            )
            return []

        # 2. Use Claude Haiku to extract patterns
        llm = ChatAnthropic(
            model=PATTERN_MODEL,
            timeout=PATTERN_TIMEOUT,
        )

        prompt_template = ChatPromptTemplate.from_template(
            """Analyze these check-in summaries and identify patterns:

{memories}

Extract and return JSON with these pattern types:
1. RECURRING TOPICS: Topics mentioned 3+ times
2. UNMET GOALS: Goals mentioned repeatedly but not marked as completed
3. EMOTIONAL TRENDS: Overall sentiment patterns (improving, declining, stable)

IMPORTANT:
- Only include patterns with clear evidence (3+ mentions for topics/goals)
- Mark unmet_goal patterns as is_actionable=true (for proactive nudges)
- Include the memory indices (1-indexed) as evidence

Return valid JSON only:
{{
  "patterns": [
    {{"type": "recurring_topic", "topic": "health", "count": 5, "evidence_indices": [1, 3, 7, 12, 15]}},
    {{"type": "unmet_goal", "goal": "start exercising", "mentions": 4, "is_actionable": true, "evidence_indices": [2, 8, 14, 18]}},
    {{"type": "emotional_trend", "trend": "improving", "direction": "positive", "summary": "Mood has been steadily improving over the past 2 weeks"}}
  ]
}}

If no clear patterns are found, return: {{"patterns": []}}"""
        )

        chain = prompt_template | llm

        formatted_summaries = format_summaries_for_analysis(memories)
        response = await chain.ainvoke({"memories": formatted_summaries})

        # 3. Parse LLM response
        patterns = _parse_pattern_response(response.content)

        # 4. Convert evidence indices to summary dates
        patterns_with_ids = []
        for pattern in patterns:
            evidence_indices = pattern.pop("evidence_indices", [])
            evidence_ids = []
            for idx in evidence_indices:
                if 0 < idx <= len(memories):
                    summary = memories[idx - 1]
                    # Use summary_date from metadata
                    summary_date = summary.get("metadata", {}).get("summary_date", "")
                    if summary_date:
                        evidence_ids.append(summary_date)
            pattern["evidence_ids"] = evidence_ids
            patterns_with_ids.append(pattern)

        # 5. Store patterns in Supabase
        client = get_supabase_client()
        if client:
            for pattern in patterns_with_ids:
                await _store_pattern(client, user_id, pattern)

        logger.info(
            f"Detected {len(patterns_with_ids)} patterns for user {user_id[:8]}..."
        )
        return patterns_with_ids

    except Exception as e:
        logger.error(f"Pattern detection failed for user {user_id[:8]}: {e}")
        raise PatternDetectionError(f"Pattern detection failed: {e}") from e


def _parse_pattern_response(content: str) -> list[dict]:
    """Parse LLM response to extract patterns.

    Args:
        content: Raw LLM response content.

    Returns:
        List of pattern dictionaries.

    Raises:
        PatternDetectionError: If parsing fails.
    """
    try:
        # Handle markdown code blocks
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]

        content = content.strip()
        result = json.loads(content)
        return result.get("patterns", [])
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse pattern response: {e}")
        raise PatternDetectionError(f"Invalid pattern response: {e}") from e


async def _store_pattern(
    client: Any,
    user_id: str,
    pattern: dict,
) -> Optional[dict]:
    """Store or update a pattern in Supabase.

    Uses upsert to avoid duplicates for same topic/goal.

    Args:
        client: Supabase client.
        user_id: User ID.
        pattern: Pattern data to store.

    Returns:
        Stored pattern record or None on error.
    """
    try:
        pattern_type = pattern.get("type", "")

        # Build pattern_data based on type
        if pattern_type == "recurring_topic":
            pattern_data = {
                "topic": pattern.get("topic", ""),
                "count": pattern.get("count", 0),
                "first_seen": datetime.now(timezone.utc).isoformat(),
                "last_seen": datetime.now(timezone.utc).isoformat(),
            }
        elif pattern_type == "unmet_goal":
            pattern_data = {
                "goal": pattern.get("goal", ""),
                "mentions": pattern.get("mentions", 0),
                "first_mentioned": datetime.now(timezone.utc).isoformat(),
                "last_mentioned": datetime.now(timezone.utc).isoformat(),
            }
        elif pattern_type == "emotional_trend":
            pattern_data = {
                "trend": pattern.get("trend", ""),
                "direction": pattern.get("direction", "stable"),
                "summary": pattern.get("summary", ""),
            }
        else:
            logger.warning(f"Unknown pattern type: {pattern_type}")
            return None

        data = {
            "user_id": user_id,
            "pattern_type": pattern_type,
            "pattern_data": pattern_data,
            "evidence_ids": pattern.get("evidence_ids", []),
            "is_actionable": pattern.get("is_actionable", False),
            "detected_at": datetime.now(timezone.utc).isoformat(),
        }

        # Use upsert for recurring_topic and unmet_goal to update counts
        response = client.table("user_patterns").insert(data).execute()
        return response.data[0] if response.data else None

    except Exception as e:
        # Unique constraint violation - update existing
        if "duplicate key" in str(e).lower() or "23505" in str(e):
            return await _update_existing_pattern(client, user_id, pattern)
        logger.error(f"Error storing pattern: {e}")
        return None


def _build_pattern_data(pattern: dict) -> dict:
    """Build pattern_data dict based on pattern type.

    Args:
        pattern: Pattern dict from LLM analysis.

    Returns:
        Formatted pattern_data for storage.
    """
    pattern_type = pattern.get("type", "")

    if pattern_type == "recurring_topic":
        return {
            "topic": pattern.get("topic", ""),
            "count": pattern.get("count", 0),
            "last_seen": datetime.now(timezone.utc).isoformat(),
        }
    elif pattern_type == "unmet_goal":
        return {
            "goal": pattern.get("goal", ""),
            "mentions": pattern.get("mentions", 0),
            "last_mentioned": datetime.now(timezone.utc).isoformat(),
        }
    elif pattern_type == "emotional_trend":
        return {
            "trend": pattern.get("trend", ""),
            "direction": pattern.get("direction", "stable"),
            "summary": pattern.get("summary", ""),
        }
    return {}


async def _update_existing_pattern(
    client: Any,
    user_id: str,
    pattern: dict,
) -> Optional[dict]:
    """Update an existing pattern with new data.

    Args:
        client: Supabase client.
        user_id: User ID.
        pattern: Updated pattern data.

    Returns:
        Updated pattern record or None on error.
    """
    try:
        pattern_type = pattern.get("type", "")

        # Build the update query with pattern_data
        query = (
            client.table("user_patterns")
            .update({
                "pattern_data": _build_pattern_data(pattern),
                "evidence_ids": pattern.get("evidence_ids", []),
                "is_actionable": pattern.get("is_actionable", False),
                "detected_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("user_id", user_id)
            .eq("pattern_type", pattern_type)
        )

        response = query.execute()
        return response.data[0] if response.data else None

    except Exception as e:
        logger.error(f"Error updating existing pattern: {e}")
        return None


async def get_user_patterns(
    user_id: str,
    pattern_type: Optional[str] = None,
    actionable_only: bool = False,
) -> list[dict]:
    """Fetch user's detected patterns from Supabase.

    Args:
        user_id: User ID for filtering.
        pattern_type: Optional filter by pattern type.
        actionable_only: If True, only return actionable patterns.

    Returns:
        List of pattern records.
    """
    client = get_supabase_client()
    if not client:
        return []

    try:
        query = (
            client.table("user_patterns")
            .select("*")
            .eq("user_id", user_id)
            .order("detected_at", desc=True)
        )

        if pattern_type:
            query = query.eq("pattern_type", pattern_type)

        if actionable_only:
            query = query.eq("is_actionable", True)

        response = query.execute()
        return response.data or []

    except Exception as e:
        logger.error(f"Error fetching patterns: {e}")
        return []


async def get_users_needing_pattern_update() -> list[str]:
    """Find users with new check-ins since last pattern detection.

    Returns:
        List of user IDs that need pattern updates.
    """
    client = get_supabase_client()
    if not client:
        return []

    try:
        # Get users with check-ins in the last 24 hours
        yesterday = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

        response = (
            client.table("check_ins")
            .select("user_id")
            .gte("created_at", yesterday)
            .execute()
        )

        # Deduplicate user IDs
        user_ids = list(set(row["user_id"] for row in response.data or []))
        return user_ids

    except Exception as e:
        logger.error(f"Error finding users for pattern update: {e}")
        return []
