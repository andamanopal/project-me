"""Tests for memory retrieval service and tool.

Test coverage:
- User isolation (AC4): Only current user's memories returned
- Empty results handling (AC2): Graceful empty list return
- Recency boost: Recent documents ranked higher
- Performance (AC1): Search < 1 second
- Memory tool: LangGraph tool integration
"""

import pytest
from unittest.mock import MagicMock, patch
import time
from datetime import datetime, timezone, timedelta

import sys
from pathlib import Path

# Add parent to path for imports
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))

from src.services.elasticsearch import (
    search_lifelogs,
    _calculate_recency_score,
    _search_hybrid,
)
from src.agent.tools.memory import search_memories


class TestRecencyScoreCalculation:
    """Tests for recency score calculation."""

    def test_today_returns_max_score(self):
        """Documents from today should have maximum recency score (~1.0)."""
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        score = _calculate_recency_score(now_iso)
        assert score >= 0.95, f"Today's document should have score ~1.0, got {score}"

    def test_30_days_ago_returns_half_score(self):
        """Documents from 30 days ago should have ~0.5 score."""
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        score = _calculate_recency_score(thirty_days_ago.isoformat())
        assert 0.45 <= score <= 0.55, f"30-day-old document should have score ~0.5, got {score}"

    def test_90_days_ago_returns_quarter_score(self):
        """Documents from 90 days ago should have ~0.25 score."""
        ninety_days_ago = datetime.now(timezone.utc) - timedelta(days=90)
        score = _calculate_recency_score(ninety_days_ago.isoformat())
        assert 0.2 <= score <= 0.3, f"90-day-old document should have score ~0.25, got {score}"

    def test_none_returns_zero(self):
        """None input should return 0."""
        score = _calculate_recency_score(None)
        assert score == 0.0

    def test_empty_string_returns_zero(self):
        """Empty string should return 0."""
        score = _calculate_recency_score("")
        assert score == 0.0

    def test_invalid_format_returns_zero(self):
        """Invalid date format should return 0."""
        score = _calculate_recency_score("not-a-date")
        assert score == 0.0

    def test_z_suffix_handled(self):
        """ISO format with Z suffix should be handled."""
        now = datetime.now(timezone.utc)
        now_iso = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        score = _calculate_recency_score(now_iso)
        assert score >= 0.95

    def test_minimum_score_is_0_1(self):
        """Very old documents should have minimum score of 0.1."""
        old_date = datetime.now(timezone.utc) - timedelta(days=3650)  # 10 years
        score = _calculate_recency_score(old_date.isoformat())
        assert score >= 0.1, f"Minimum score should be 0.1, got {score}"


class TestUserIdIsolation:
    """Tests for user ID isolation in search (AC4)."""

    @pytest.fixture
    def mock_es_client(self):
        """Create mock Elasticsearch client."""
        mock_client = MagicMock()
        mock_client.indices.exists.return_value = True
        return mock_client

    def test_user_id_added_to_bm25_query(self, mock_es_client):
        """User ID filter should be added to BM25 query."""
        mock_es_client.search.return_value = {"hits": {"hits": []}}

        with patch("src.services.elasticsearch.get_elasticsearch_client", return_value=mock_es_client):
            with patch("src.services.elasticsearch.Settings") as mock_settings:
                mock_settings.embed_model.get_query_embedding.return_value = [0.1] * 1024

                _search_hybrid("test query", top_k=5, user_id="user123")

        # Verify BM25 search was called with user_id filter
        calls = mock_es_client.search.call_args_list
        assert len(calls) >= 1

        # Check first call (BM25) has the user_id filter
        bm25_call = calls[0]
        body = bm25_call.kwargs.get("body", bm25_call[1].get("body", {}))
        query = body.get("query", {})
        assert "bool" in query
        assert "filter" in query["bool"]
        assert query["bool"]["filter"]["term"]["metadata.user_id"] == "user123"

    def test_user_id_added_to_knn_query(self, mock_es_client):
        """User ID filter should be added to kNN query."""
        mock_es_client.search.return_value = {"hits": {"hits": []}}

        with patch("src.services.elasticsearch.get_elasticsearch_client", return_value=mock_es_client):
            with patch("src.services.elasticsearch.Settings") as mock_settings:
                mock_settings.embed_model.get_query_embedding.return_value = [0.1] * 1024

                _search_hybrid("test query", top_k=5, user_id="user123")

        # Verify kNN search was called with user_id filter
        calls = mock_es_client.search.call_args_list
        assert len(calls) >= 2  # BM25 + kNN

        # Check second call (kNN) has the user_id filter
        knn_call = calls[1]
        body = knn_call.kwargs.get("body", knn_call[1].get("body", {}))
        knn = body.get("knn", {})
        assert "filter" in knn
        assert knn["filter"]["term"]["metadata.user_id"] == "user123"

    def test_search_without_user_id_no_filter(self, mock_es_client):
        """Search without user_id should not add filter."""
        mock_es_client.search.return_value = {"hits": {"hits": []}}

        with patch("src.services.elasticsearch.get_elasticsearch_client", return_value=mock_es_client):
            with patch("src.services.elasticsearch.Settings") as mock_settings:
                mock_settings.embed_model.get_query_embedding.return_value = [0.1] * 1024

                _search_hybrid("test query", top_k=5, user_id=None)

        # Verify no filter in BM25 call
        calls = mock_es_client.search.call_args_list
        bm25_call = calls[0]
        body = bm25_call.kwargs.get("body", bm25_call[1].get("body", {}))
        query = body.get("query", {})
        assert "filter" not in query.get("bool", {})


class TestEmptyResults:
    """Tests for empty results handling (AC2)."""

    @pytest.fixture
    def mock_es_client(self):
        """Create mock Elasticsearch client."""
        mock_client = MagicMock()
        mock_client.indices.exists.return_value = True
        mock_client.search.return_value = {"hits": {"hits": []}}
        return mock_client

    def test_empty_results_return_empty_list(self, mock_es_client):
        """Empty results should return empty list, not None."""
        with patch("src.services.elasticsearch.get_elasticsearch_client", return_value=mock_es_client):
            with patch("src.services.elasticsearch.Settings") as mock_settings:
                mock_settings.embed_model.get_query_embedding.return_value = [0.1] * 1024

                results = search_lifelogs(query="nonexistent xyz123", user_id="test_user")

        assert results == []
        assert isinstance(results, list)

    def test_index_not_exists_returns_empty_list(self, mock_es_client):
        """Missing index should return empty list, not error."""
        mock_es_client.indices.exists.return_value = False

        with patch("src.services.elasticsearch.get_elasticsearch_client", return_value=mock_es_client):
            results = search_lifelogs(query="test", user_id="test_user")

        assert results == []

    def test_no_query_no_time_returns_empty_list(self, mock_es_client):
        """No search criteria should return empty list."""
        with patch("src.services.elasticsearch.get_elasticsearch_client", return_value=mock_es_client):
            results = search_lifelogs()

        assert results == []


class TestSearchLifelogs:
    """Tests for search_lifelogs function."""

    @pytest.fixture
    def mock_es_client(self):
        """Create mock Elasticsearch client with sample results."""
        mock_client = MagicMock()
        mock_client.indices.exists.return_value = True
        mock_client.search.return_value = {
            "hits": {
                "hits": [
                    {
                        "_id": "doc1",
                        "_source": {
                            "content": "Meeting about project X",
                            "metadata": {
                                "title": "Team Meeting",
                                "start_time": datetime.now(timezone.utc).isoformat(),
                                "user_id": "user123",
                            }
                        }
                    }
                ]
            }
        }
        return mock_client

    def test_search_returns_formatted_results(self, mock_es_client):
        """Search should return properly formatted results."""
        with patch("src.services.elasticsearch.get_elasticsearch_client", return_value=mock_es_client):
            with patch("src.services.elasticsearch.Settings") as mock_settings:
                mock_settings.embed_model.get_query_embedding.return_value = [0.1] * 1024

                results = search_lifelogs(query="meeting", user_id="user123", top_k=5)

        assert len(results) > 0
        assert "content" in results[0]
        assert "metadata" in results[0]

    def test_search_respects_top_k(self, mock_es_client):
        """Search should respect top_k limit."""
        # Create many results
        mock_es_client.search.return_value = {
            "hits": {
                "hits": [
                    {
                        "_id": f"doc{i}",
                        "_source": {
                            "content": f"Content {i}",
                            "metadata": {"start_time": datetime.now(timezone.utc).isoformat()}
                        }
                    }
                    for i in range(10)
                ]
            }
        }

        with patch("src.services.elasticsearch.get_elasticsearch_client", return_value=mock_es_client):
            with patch("src.services.elasticsearch.Settings") as mock_settings:
                mock_settings.embed_model.get_query_embedding.return_value = [0.1] * 1024

                results = search_lifelogs(query="content", user_id="user123", top_k=3)

        assert len(results) <= 3


class TestMemoryTool:
    """Tests for search_memories LangGraph tool."""

    def test_tool_has_docstring(self):
        """Tool should have comprehensive docstring."""
        # LangChain tools store description in .description attribute
        assert search_memories.description is not None
        assert "query" in search_memories.description.lower()
        assert "user_id" in search_memories.description.lower()

    def test_empty_query_returns_empty_list(self):
        """Empty query should return empty list."""
        with patch("src.agent.tools.memory.search_memories_service") as mock_search:
            result = search_memories.invoke({"query": "", "user_id": "user123"})

        assert result == []
        mock_search.assert_not_called()

    def test_empty_user_id_returns_empty_list(self):
        """Empty user_id should return empty list."""
        with patch("src.agent.tools.memory.search_memories_service") as mock_search:
            result = search_memories.invoke({"query": "test", "user_id": ""})

        assert result == []
        mock_search.assert_not_called()

    def test_tool_calls_search_memories_service(self):
        """Tool should call search_memories_service with correct params."""
        mock_results = [
            {
                "content": "Test content",
                "metadata": {
                    "title": "Test",
                    "start_time": "2024-01-01T10:00:00Z",
                    "end_time": "2024-01-01T11:00:00Z",
                    "user_id": "user123",
                }
            }
        ]

        with patch("src.agent.tools.memory.search_memories_service", return_value=mock_results):
            result = search_memories.invoke({
                "query": "test query",
                "user_id": "user123",
                "top_k": 5,
            })

        assert len(result) == 1
        assert result[0]["content"] == "Test content"
        assert result[0]["metadata"]["title"] == "Test"

    def test_tool_handles_exception(self):
        """Tool should handle exceptions gracefully."""
        with patch("src.agent.tools.memory.search_memories_service", side_effect=Exception("ES error")):
            result = search_memories.invoke({"query": "test", "user_id": "user123"})

        assert result == []


class TestPerformance:
    """Tests for performance requirements (AC1: < 1 second)."""

    @pytest.fixture
    def mock_es_client(self):
        """Create mock Elasticsearch client with fast response."""
        mock_client = MagicMock()
        mock_client.indices.exists.return_value = True
        mock_client.search.return_value = {
            "hits": {
                "hits": [
                    {
                        "_id": "doc1",
                        "_source": {
                            "content": "Test content",
                            "metadata": {"start_time": datetime.now(timezone.utc).isoformat()}
                        }
                    }
                ]
            }
        }
        return mock_client

    def test_search_completes_within_timeout(self, mock_es_client):
        """Search should complete within performance threshold."""
        with patch("src.services.elasticsearch.get_elasticsearch_client", return_value=mock_es_client):
            with patch("src.services.elasticsearch.Settings") as mock_settings:
                mock_settings.embed_model.get_query_embedding.return_value = [0.1] * 1024

                start = time.time()
                search_lifelogs(query="test", user_id="test_user", top_k=5)
                elapsed = time.time() - start

        # Allow some overhead for test infrastructure
        assert elapsed < 1.0, f"Search took {elapsed}s, expected < 1s"


class TestTimeRangeSearch:
    """Tests for time-based search with user isolation."""

    @pytest.fixture
    def mock_es_client(self):
        """Create mock Elasticsearch client."""
        mock_client = MagicMock()
        mock_client.indices.exists.return_value = True
        mock_client.search.return_value = {"hits": {"hits": []}}
        return mock_client

    def test_time_range_with_user_id(self, mock_es_client):
        """Time range search should include user_id filter."""
        with patch("src.services.elasticsearch.get_elasticsearch_client", return_value=mock_es_client):
            search_lifelogs(
                start_time="2024-01-01",
                end_time="2024-01-31",
                user_id="user123",
            )

        # Verify search was called with user_id filter
        call = mock_es_client.search.call_args
        body = call.kwargs.get("body", call[1].get("body", {}))
        query = body.get("query", {})
        filters = query.get("bool", {}).get("filter", [])

        # Should have 2 filters: time range and user_id
        assert len(filters) == 2
        user_filter = next((f for f in filters if "term" in f), None)
        assert user_filter is not None
        assert user_filter["term"]["metadata.user_id"] == "user123"
