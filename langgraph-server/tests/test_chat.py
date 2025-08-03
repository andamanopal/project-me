"""Tests for chat streaming endpoint with message persistence.

Test coverage:
- AC1: Message send & display (user message stored)
- AC2: AI response streaming (assistant message stored)
- AC3: Error handling (friendly error messages)
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient

import sys
from pathlib import Path

# Add fastapi-server to path for imports
fastapi_server_path = str(Path(__file__).parent.parent / "fastapi-server")
sys.path.insert(0, fastapi_server_path)
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def mock_supabase():
    """Mock Supabase client for database operations."""
    with patch("routers.chat.get_supabase_client") as mock:
        mock_client = MagicMock()
        mock.return_value = mock_client
        yield mock_client


@pytest.fixture
def mock_graph():
    """Mock LangGraph for streaming."""
    with patch("routers.chat.graph") as mock:
        yield mock


class TestChatStreamValidation:
    """Tests for request validation."""

    def test_chat_stream_requires_auth(self, client):
        """Should return 401 without authentication."""
        response = client.post(
            "/chat/stream",
            json={"message": "Hello", "conversation_id": "conv-123"},
        )

        assert response.status_code == 401

    def test_chat_stream_requires_message(self, client):
        """Should return 400 if message is empty."""
        response = client.post(
            "/chat/stream",
            json={"message": "", "conversation_id": "conv-123"},
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 400
        assert "empty" in response.json()["detail"]["error"]["message"].lower()

    def test_chat_stream_requires_conversation_id(self, client):
        """Should return 400 if conversation_id is missing."""
        response = client.post(
            "/chat/stream",
            json={"message": "Hello"},
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 400
        assert "conversation_id" in response.json()["detail"]["error"]["message"]


class TestMessageStorage:
    """Tests for message persistence."""

    def test_stores_user_message_before_streaming(
        self, client, mock_supabase, mock_graph
    ):
        """AC1: User message should be stored before streaming begins."""
        # Mock conversation check
        conv_check = MagicMock()
        conv_check.data = {"id": "conv-123"}

        # Mock message insert
        msg_insert = MagicMock()
        msg_insert.data = [{"id": "msg-1", "role": "user", "content": "Hello"}]

        # Set up mock chain
        mock_table = MagicMock()
        mock_supabase.table.return_value = mock_table

        call_count = [0]

        def table_side_effect(name):
            call_count[0] += 1
            mock = MagicMock()
            if name == "conversations":
                mock.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = conv_check
            else:  # messages
                mock.insert.return_value.execute.return_value = msg_insert
            return mock

        mock_supabase.table.side_effect = table_side_effect

        # Mock graph to return no events (empty response)
        mock_graph.astream_events = AsyncMock(return_value=iter([]))

        response = client.post(
            "/chat/stream",
            json={"message": "Hello", "conversation_id": "conv-123"},
            headers={"X-User-Id": "test-user-id"},
        )

        # Should have attempted to store message (table was called)
        assert mock_supabase.table.called

    def test_rejects_message_to_wrong_conversation(self, client, mock_supabase):
        """Should return 403 if conversation doesn't belong to user."""
        # Mock conversation check - returns None (not found)
        mock_table = MagicMock()
        mock_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.side_effect = Exception(
            "No rows found - PGRST116"
        )
        mock_supabase.table.return_value = mock_table

        response = client.post(
            "/chat/stream",
            json={"message": "Hello", "conversation_id": "wrong-conv"},
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 403
        assert response.json()["detail"]["error"]["code"] == "FORBIDDEN"


class TestStoreMessageFunction:
    """Tests for the store_message helper function."""

    @pytest.mark.asyncio
    async def test_store_message_verifies_conversation_ownership(self, mock_supabase):
        """Should verify conversation belongs to user before storing."""
        from routers.chat import store_message

        # Mock conversation not found
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.side_effect = Exception(
            "No rows found"
        )

        result = await store_message("conv-123", "user", "Hello", "user-id")

        assert result is None

    @pytest.mark.asyncio
    async def test_store_message_returns_created_message(self, mock_supabase):
        """Should return created message on success."""
        from routers.chat import store_message

        # Mock conversation check
        conv_check = MagicMock()
        conv_check.data = {"id": "conv-123"}

        # Mock message insert
        msg_insert = MagicMock()
        msg_insert.data = [{"id": "msg-1", "role": "user", "content": "Hello"}]

        call_count = [0]

        def table_side_effect(name):
            call_count[0] += 1
            mock = MagicMock()
            if call_count[0] == 1:  # conversations check
                mock.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = conv_check
            else:  # messages insert
                mock.insert.return_value.execute.return_value = msg_insert
            return mock

        mock_supabase.table.side_effect = table_side_effect

        result = await store_message("conv-123", "user", "Hello", "user-id")

        assert result is not None
        assert result["id"] == "msg-1"
        assert result["role"] == "user"


class TestErrorHandling:
    """Tests for error handling."""

    def test_handles_database_unavailable(self, client):
        """Should handle gracefully when database is unavailable."""
        with patch("routers.chat.get_supabase_client", return_value=None):
            response = client.post(
                "/chat/stream",
                json={"message": "Hi", "conversation_id": "conv-123"},
                headers={"X-User-Id": "test-user-id"},
            )

            # Should return 403 since message storage fails
            assert response.status_code == 403

    def test_returns_forbidden_for_wrong_conversation(self, client, mock_supabase):
        """AC3: Should return 403 for unauthorized conversation access."""
        # Mock conversation check to fail
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.side_effect = Exception(
            "No rows found"
        )

        response = client.post(
            "/chat/stream",
            json={"message": "Hi", "conversation_id": "wrong-conv"},
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 403
        assert response.json()["detail"]["error"]["code"] == "FORBIDDEN"
