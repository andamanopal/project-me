"""Daily summary search tool for LangGraph agent.

Provides unified search across all user memories via the daily_summaries index.
Replaces both search_memories and search_lifelog tools.
"""

import logging
from typing import Optional

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from src.services.daily_summary import search_daily_summaries

logger = logging.getLogger(__name__)

# Hardcoded for now - agent doesn't need to control this
DEFAULT_TOP_K = 5


@tool
def search_daily_summaries_tool(
    query: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    *,
    config: RunnableConfig,
) -> dict:
    """Search user's memories across all sources (check-ins, lifelogs, etc.).

    Uses hybrid search (BM25 + vector similarity) on the unified daily_summaries
    index which aggregates all user memory sources into per-day summaries.

    Args:
        query: Natural language search query describing what to find.
               Use this to find memories about specific topics, events,
               or activities (e.g., "dentist appointment", "team meeting").
        start_date: Optional start of date range (YYYY-MM-DD format).
                   Use for time-bounded searches.
        end_date: Optional end of date range (YYYY-MM-DD format).
                 Use for time-bounded searches.

    Returns:
        Dict containing:
        - success: Boolean indicating if search succeeded
        - results: List of matching daily summaries with content and date
        - count: Number of results found
        - message: Human-readable summary

    Examples:
        - Search by topic: query="dentist appointment"
        - Search by date: start_date="2025-01-01", end_date="2025-01-15"
        - Search both: query="project deadline", start_date="2025-01-01"
    """
    try:
        # Get user_id from config (injected by LangGraph)
        user_id = config.get("configurable", {}).get("user_id", "")

        if not user_id:
            logger.error("user_id not found in config - check graph invocation")
            return {
                "success": False,
                "results": [],
                "count": 0,
                "message": "Internal error: user context not available.",
            }

        if not query and not start_date and not end_date:
            return {
                "success": False,
                "results": [],
                "count": 0,
                "message": "Please provide a query or date range to search.",
            }

        # Execute search
        raw_results = search_daily_summaries(
            query=query.strip() if query else None,
            user_id=user_id,
            top_k=DEFAULT_TOP_K,
            start_date=start_date,
            end_date=end_date,
        )

        # Format results for LangGraph context
        formatted_results = []
        for r in raw_results:
            content = r.get("content", "")
            metadata = r.get("metadata", {})

            formatted_results.append({
                "content": content,
                "summary_date": metadata.get("summary_date", ""),
            })

        # Build descriptive message
        search_type = []
        if query:
            search_type.append(f"query='{query[:50]}'")
        if start_date:
            search_type.append(f"from {start_date}")
        if end_date:
            search_type.append(f"to {end_date}")

        logger.info(
            f"search_daily_summaries: {', '.join(search_type)} "
            f"user={user_id[:8]}... found={len(formatted_results)}"
        )

        return {
            "success": True,
            "results": formatted_results,
            "count": len(formatted_results),
            "message": f"Found {len(formatted_results)} daily summaries matching: {', '.join(search_type)}",
        }

    except Exception as e:
        logger.error(f"Error in search_daily_summaries_tool: {e}")
        return {
            "success": False,
            "results": [],
            "count": 0,
            "message": f"Search failed: {str(e)}",
        }
