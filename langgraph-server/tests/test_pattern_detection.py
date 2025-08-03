"""Tests for Story 3-3: Detect Patterns Across History.

Tests cover:
- Pattern detection with mock memories
- Actionable flag for unmet goals
- User isolation
- Pattern storage and retrieval
- API endpoints
"""

import json
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.services.pattern_detector import (
    detect_patterns,
    format_memories_for_analysis,
    get_user_patterns,
    thirty_days_ago,
    _parse_pattern_response,
    PatternDetectionError,
)


# ============================================================================
# Test Fixtures
# ============================================================================


@pytest.fixture
def mock_memories():
    """Create mock memory data for testing."""
    base_time = datetime.now(timezone.utc)
    memories = []

    for i in range(15):
        memories.append({
            "content": f"Today I worked on my health goals. I want to exercise more. Memory {i}",
            "metadata": {
                "lifelog_id": f"mem_{i}",
                "title": f"Check-in {i}",
                "start_time": (base_time - timedelta(days=i)).isoformat(),
                "end_time": (base_time - timedelta(days=i, hours=-1)).isoformat(),
                "user_id": "test_user_123",
            }
        })

    return memories


@pytest.fixture
def mock_llm_response():
    """Mock LLM response with patterns."""
    return json.dumps({
        "patterns": [
            {
                "type": "recurring_topic",
                "topic": "health",
                "count": 5,
                "evidence_indices": [1, 3, 5, 7, 9]
            },
            {
                "type": "unmet_goal",
                "goal": "exercise more",
                "mentions": 4,
                "is_actionable": True,
                "evidence_indices": [2, 4, 6, 8]
            },
            {
                "type": "emotional_trend",
                "trend": "improving",
                "direction": "positive",
                "summary": "Mood has been steadily improving"
            }
        ]
    })


# ============================================================================
# Test thirty_days_ago
# ============================================================================


def test_thirty_days_ago_returns_iso_string():
    """Test that thirty_days_ago returns valid ISO string."""
    result = thirty_days_ago()
    assert isinstance(result, str)
    # Should be parseable
    dt = datetime.fromisoformat(result.replace("Z", "+00:00"))
    assert dt < datetime.now(timezone.utc)


def test_thirty_days_ago_is_approximately_30_days():
    """Test that result is approximately 30 days in the past."""
    result = thirty_days_ago()
    dt = datetime.fromisoformat(result.replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    diff = now - dt
    assert 29 <= diff.days <= 31


# ============================================================================
# Test format_memories_for_analysis
# ============================================================================


def test_format_memories_empty_list():
    """Test formatting empty memory list."""
    result = format_memories_for_analysis([])
    assert result == ""


def test_format_memories_single_memory():
    """Test formatting single memory."""
    memories = [{
        "content": "This is a test memory content",
        "metadata": {
            "start_time": "2024-01-15T09:00:00",
            "title": "Morning check-in"
        }
    }]
    result = format_memories_for_analysis(memories)
    assert "[1]" in result
    assert "Morning check-in" in result
    assert "2024-01-15T09:00:00" in result


def test_format_memories_truncates_long_content():
    """Test that long content is truncated to 500 chars."""
    long_content = "x" * 1000
    memories = [{
        "content": long_content,
        "metadata": {"start_time": "2024-01-15T09:00:00", "title": "Test"}
    }]
    result = format_memories_for_analysis(memories)
    # Content should be truncated
    assert len(result) < len(long_content) + 200  # Some buffer for formatting


def test_format_memories_multiple_memories(mock_memories):
    """Test formatting multiple memories."""
    result = format_memories_for_analysis(mock_memories[:5])
    assert "[1]" in result
    assert "[5]" in result
    # Each memory should be included
    for i in range(1, 6):
        assert f"[{i}]" in result


# ============================================================================
# Test _parse_pattern_response
# ============================================================================


def test_parse_pattern_response_valid_json():
    """Test parsing valid JSON response."""
    content = '{"patterns": [{"type": "recurring_topic", "topic": "health"}]}'
    result = _parse_pattern_response(content)
    assert len(result) == 1
    assert result[0]["type"] == "recurring_topic"


def test_parse_pattern_response_with_markdown():
    """Test parsing JSON wrapped in markdown code blocks."""
    content = '```json\n{"patterns": [{"type": "unmet_goal", "goal": "exercise"}]}\n```'
    result = _parse_pattern_response(content)
    assert len(result) == 1
    assert result[0]["type"] == "unmet_goal"


def test_parse_pattern_response_empty_patterns():
    """Test parsing empty patterns array."""
    content = '{"patterns": []}'
    result = _parse_pattern_response(content)
    assert result == []


def test_parse_pattern_response_invalid_json():
    """Test that invalid JSON raises error."""
    content = "This is not valid JSON"
    with pytest.raises(PatternDetectionError):
        _parse_pattern_response(content)


# ============================================================================
# Test detect_patterns
# ============================================================================


@pytest.mark.asyncio
async def test_detect_patterns_insufficient_memories():
    """Test that detection returns empty for insufficient memories."""
    with patch("src.services.pattern_detector.search_memories") as mock_search:
        mock_search.return_value = [{"content": "single memory"}]  # Only 1 memory

        result = await detect_patterns("test_user", min_checkins=10)

        assert result == []


@pytest.mark.asyncio
async def test_detect_patterns_success(mock_memories, mock_llm_response):
    """Test successful pattern detection."""
    mock_response = MagicMock()
    mock_response.content = mock_llm_response

    # Create chain mock that returns correct response
    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock(return_value=mock_response)

    with patch("src.services.pattern_detector.search_memories") as mock_search, \
         patch("src.services.pattern_detector.ChatAnthropic") as mock_llm_class, \
         patch("src.services.pattern_detector.ChatPromptTemplate") as mock_prompt_class, \
         patch("src.services.pattern_detector.get_supabase_client") as mock_supabase:

        mock_search.return_value = mock_memories
        mock_supabase.return_value = None  # Skip storage

        # Mock the prompt_template | llm chain pattern
        mock_prompt = MagicMock()
        mock_prompt.__or__ = MagicMock(return_value=mock_chain)
        mock_prompt_class.from_template.return_value = mock_prompt

        result = await detect_patterns("test_user_123", min_checkins=10)

        assert len(result) == 3
        assert any(p["type"] == "recurring_topic" for p in result)
        assert any(p["type"] == "unmet_goal" for p in result)
        assert any(p["type"] == "emotional_trend" for p in result)


@pytest.mark.asyncio
async def test_detect_patterns_unmet_goal_is_actionable(mock_memories, mock_llm_response):
    """Test that unmet_goal patterns are marked as actionable."""
    mock_response = MagicMock()
    mock_response.content = mock_llm_response

    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock(return_value=mock_response)

    with patch("src.services.pattern_detector.search_memories") as mock_search, \
         patch("src.services.pattern_detector.ChatAnthropic") as mock_llm_class, \
         patch("src.services.pattern_detector.ChatPromptTemplate") as mock_prompt_class, \
         patch("src.services.pattern_detector.get_supabase_client") as mock_supabase:

        mock_search.return_value = mock_memories
        mock_supabase.return_value = None

        mock_prompt = MagicMock()
        mock_prompt.__or__ = MagicMock(return_value=mock_chain)
        mock_prompt_class.from_template.return_value = mock_prompt

        result = await detect_patterns("test_user_123", min_checkins=10)

        unmet_goal = next(p for p in result if p["type"] == "unmet_goal")
        assert unmet_goal.get("is_actionable") is True


@pytest.mark.asyncio
async def test_detect_patterns_evidence_ids_converted():
    """Test that evidence_indices are converted to evidence_ids."""
    memories = [
        {"content": f"Memory {i}", "metadata": {"lifelog_id": f"log_{i}", "start_time": "2024-01-01"}}
        for i in range(15)
    ]

    llm_response = json.dumps({
        "patterns": [{
            "type": "recurring_topic",
            "topic": "test",
            "count": 3,
            "evidence_indices": [1, 2, 3]
        }]
    })

    mock_response = MagicMock()
    mock_response.content = llm_response

    mock_chain = MagicMock()
    mock_chain.ainvoke = AsyncMock(return_value=mock_response)

    with patch("src.services.pattern_detector.search_memories") as mock_search, \
         patch("src.services.pattern_detector.ChatAnthropic") as mock_llm_class, \
         patch("src.services.pattern_detector.ChatPromptTemplate") as mock_prompt_class, \
         patch("src.services.pattern_detector.get_supabase_client") as mock_supabase:

        mock_search.return_value = memories
        mock_supabase.return_value = None

        mock_prompt = MagicMock()
        mock_prompt.__or__ = MagicMock(return_value=mock_chain)
        mock_prompt_class.from_template.return_value = mock_prompt

        result = await detect_patterns("test_user", min_checkins=10)

        assert len(result) == 1
        pattern = result[0]
        # evidence_indices should be removed and evidence_ids added
        assert "evidence_indices" not in pattern
        assert "evidence_ids" in pattern
        assert pattern["evidence_ids"] == ["log_0", "log_1", "log_2"]


# ============================================================================
# Test get_user_patterns
# ============================================================================


@pytest.mark.asyncio
async def test_get_user_patterns_no_client():
    """Test that empty list is returned when no Supabase client."""
    with patch("src.services.pattern_detector.get_supabase_client") as mock_supabase:
        mock_supabase.return_value = None

        result = await get_user_patterns("test_user")

        assert result == []


@pytest.mark.asyncio
async def test_get_user_patterns_filters_by_user():
    """Test that patterns are filtered by user_id."""
    mock_client = MagicMock()
    mock_query = MagicMock()
    mock_query.select.return_value = mock_query
    mock_query.eq.return_value = mock_query
    mock_query.order.return_value = mock_query
    mock_query.execute.return_value = MagicMock(data=[
        {"id": "1", "user_id": "test_user", "pattern_type": "recurring_topic"}
    ])
    mock_client.table.return_value = mock_query

    with patch("src.services.pattern_detector.get_supabase_client") as mock_supabase:
        mock_supabase.return_value = mock_client

        result = await get_user_patterns("test_user")

        # Verify eq was called with user_id
        mock_query.eq.assert_called_with("user_id", "test_user")
        assert len(result) == 1


@pytest.mark.asyncio
async def test_get_user_patterns_filters_by_type():
    """Test filtering by pattern_type."""
    mock_client = MagicMock()
    mock_query = MagicMock()
    mock_query.select.return_value = mock_query
    mock_query.eq.return_value = mock_query
    mock_query.order.return_value = mock_query
    mock_query.execute.return_value = MagicMock(data=[])
    mock_client.table.return_value = mock_query

    with patch("src.services.pattern_detector.get_supabase_client") as mock_supabase:
        mock_supabase.return_value = mock_client

        await get_user_patterns("test_user", pattern_type="unmet_goal")

        # Verify eq was called with pattern_type
        calls = [str(c) for c in mock_query.eq.call_args_list]
        assert any("unmet_goal" in c for c in calls)


@pytest.mark.asyncio
async def test_get_user_patterns_filters_actionable():
    """Test filtering by actionable flag."""
    mock_client = MagicMock()
    mock_query = MagicMock()
    mock_query.select.return_value = mock_query
    mock_query.eq.return_value = mock_query
    mock_query.order.return_value = mock_query
    mock_query.execute.return_value = MagicMock(data=[])
    mock_client.table.return_value = mock_query

    with patch("src.services.pattern_detector.get_supabase_client") as mock_supabase:
        mock_supabase.return_value = mock_client

        await get_user_patterns("test_user", actionable_only=True)

        # Verify eq was called with is_actionable
        calls = [str(c) for c in mock_query.eq.call_args_list]
        assert any("is_actionable" in c or "True" in c for c in calls)


# ============================================================================
# Test User Isolation
# ============================================================================


@pytest.mark.asyncio
async def test_user_isolation_patterns_filtered():
    """Test that patterns are isolated per user."""
    with patch("src.services.pattern_detector.search_memories") as mock_search:
        # Verify that search_memories is called with correct user_id
        mock_search.return_value = []

        await detect_patterns("user_a", min_checkins=1)

        # Should have called with user_a
        mock_search.assert_called_once()
        call_kwargs = mock_search.call_args[1]
        assert call_kwargs.get("user_id") == "user_a"


# ============================================================================
# Test Pattern Types (AC1)
# ============================================================================


def test_pattern_types_recurring_topic():
    """Test recurring_topic pattern type."""
    content = json.dumps({
        "patterns": [{
            "type": "recurring_topic",
            "topic": "health",
            "count": 5,
            "evidence_indices": [1, 2, 3, 4, 5]
        }]
    })
    result = _parse_pattern_response(content)
    pattern = result[0]
    assert pattern["type"] == "recurring_topic"
    assert pattern["topic"] == "health"
    assert pattern["count"] == 5


def test_pattern_types_unmet_goal():
    """Test unmet_goal pattern type with actionable flag."""
    content = json.dumps({
        "patterns": [{
            "type": "unmet_goal",
            "goal": "start exercising",
            "mentions": 4,
            "is_actionable": True,
            "evidence_indices": [1, 2, 3, 4]
        }]
    })
    result = _parse_pattern_response(content)
    pattern = result[0]
    assert pattern["type"] == "unmet_goal"
    assert pattern["goal"] == "start exercising"
    assert pattern["is_actionable"] is True


def test_pattern_types_emotional_trend():
    """Test emotional_trend pattern type."""
    content = json.dumps({
        "patterns": [{
            "type": "emotional_trend",
            "trend": "improving",
            "direction": "positive",
            "summary": "Mood has improved"
        }]
    })
    result = _parse_pattern_response(content)
    pattern = result[0]
    assert pattern["type"] == "emotional_trend"
    assert pattern["trend"] == "improving"
    assert pattern["direction"] == "positive"
