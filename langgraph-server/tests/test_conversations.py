"""Tests for conversations CRUD endpoints.

Test coverage:
- AC1: New conversation creation with welcome message
- AC2: Conversation isolation (list only own conversations)
- AC3: Welcome message context (time-of-day greeting)
"""

import pytest
from unittest.mock import MagicMock, patch
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
    with patch("routers.conversations.get_supabase_client") as mock:
        mock_client = MagicMock()
        mock.return_value = mock_client
        yield mock_client


class TestCreateConversation:
    """Tests for POST /api/conversations endpoint."""

    def test_create_conversation_returns_new_conversation(
        self, client, mock_supabase
    ):
        """AC1: Should create and return new conversation."""
        mock_response = MagicMock()
        mock_response.data = [{
            "id": "conv-uuid-123",
            "user_id": "test-user-id",
            "title": None,
            "created_at": "2026-01-01T10:00:00Z",
            "updated_at": "2026-01-01T10:00:00Z",
        }]
        mock_supabase.table.return_value.insert.return_value.execute.return_value = mock_response

        response = client.post(
            "/api/conversations",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "conv-uuid-123"
        assert data["user_id"] == "test-user-id"
        assert "messages" in data
        assert data["messages"] == []

    def test_create_conversation_includes_welcome_message(
        self, client, mock_supabase
    ):
        """AC1, AC3: Should include contextual welcome message."""
        mock_response = MagicMock()
        mock_response.data = [{
            "id": "conv-uuid-123",
            "user_id": "test-user-id",
            "title": None,
            "created_at": "2026-01-01T10:00:00Z",
            "updated_at": "2026-01-01T10:00:00Z",
        }]
        mock_supabase.table.return_value.insert.return_value.execute.return_value = mock_response

        response = client.post(
            "/api/conversations",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "welcome_message" in data
        assert data["welcome_message"] is not None
        # Welcome message should contain a greeting
        assert any(greeting in data["welcome_message"] for greeting in [
            "Good morning", "Good afternoon", "Good evening"
        ])

    def test_create_conversation_with_title(self, client, mock_supabase):
        """Should accept optional title."""
        mock_response = MagicMock()
        mock_response.data = [{
            "id": "conv-uuid-123",
            "user_id": "test-user-id",
            "title": "My Chat",
            "created_at": "2026-01-01T10:00:00Z",
            "updated_at": "2026-01-01T10:00:00Z",
        }]
        mock_supabase.table.return_value.insert.return_value.execute.return_value = mock_response

        response = client.post(
            "/api/conversations",
            json={"title": "My Chat"},
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "My Chat"

    def test_create_conversation_requires_auth(self, client):
        """Should return 401 without authentication."""
        response = client.post("/api/conversations")

        assert response.status_code == 401

    def test_create_conversation_handles_db_unavailable(self, client):
        """Should return 503 when database is unavailable."""
        with patch("routers.conversations.get_supabase_client", return_value=None):
            response = client.post(
                "/api/conversations",
                headers={"X-User-Id": "test-user-id"},
            )

            assert response.status_code == 503
            assert response.json()["detail"]["error"]["code"] == "SERVICE_UNAVAILABLE"


class TestListConversations:
    """Tests for GET /api/conversations endpoint."""

    def test_list_conversations_returns_user_conversations(
        self, client, mock_supabase
    ):
        """AC2: Should return only user's own conversations."""
        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": "conv-1",
                "user_id": "test-user-id",
                "title": "First Chat",
                "created_at": "2026-01-01T10:00:00Z",
                "updated_at": "2026-01-01T11:00:00Z",
            },
            {
                "id": "conv-2",
                "user_id": "test-user-id",
                "title": None,
                "created_at": "2026-01-01T09:00:00Z",
                "updated_at": "2026-01-01T09:30:00Z",
            },
        ]
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.offset.return_value.execute.return_value = mock_response

        response = client.get(
            "/api/conversations",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["id"] == "conv-1"
        assert data[1]["id"] == "conv-2"

    def test_list_conversations_empty_when_none_exist(
        self, client, mock_supabase
    ):
        """Should return empty list when user has no conversations."""
        mock_response = MagicMock()
        mock_response.data = []
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.offset.return_value.execute.return_value = mock_response

        response = client.get(
            "/api/conversations",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data == []

    def test_list_conversations_supports_pagination(
        self, client, mock_supabase
    ):
        """Should support limit and offset parameters."""
        mock_response = MagicMock()
        mock_response.data = [{"id": "conv-3", "user_id": "test-user-id", "title": None, "created_at": "2026-01-01T10:00:00Z", "updated_at": "2026-01-01T10:00:00Z"}]
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.offset.return_value.execute.return_value = mock_response

        response = client.get(
            "/api/conversations",
            params={"limit": 10, "offset": 5},
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 200
        # Verify limit and offset were passed (via mock chain)
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.limit.assert_called_with(10)

    def test_list_conversations_requires_auth(self, client):
        """Should return 401 without authentication."""
        response = client.get("/api/conversations")

        assert response.status_code == 401


class TestGetConversation:
    """Tests for GET /api/conversations/{id} endpoint."""

    def test_get_conversation_returns_with_messages(
        self, client, mock_supabase
    ):
        """Should return conversation with its messages."""
        # Mock conversation query
        conv_response = MagicMock()
        conv_response.data = {
            "id": "conv-uuid-123",
            "user_id": "test-user-id",
            "title": "My Chat",
            "created_at": "2026-01-01T10:00:00Z",
            "updated_at": "2026-01-01T11:00:00Z",
        }

        # Mock messages query
        msg_response = MagicMock()
        msg_response.data = [
            {
                "id": "msg-1",
                "conversation_id": "conv-uuid-123",
                "role": "user",
                "content": "Hello",
                "created_at": "2026-01-01T10:00:00Z",
            },
            {
                "id": "msg-2",
                "conversation_id": "conv-uuid-123",
                "role": "assistant",
                "content": "Hi there!",
                "created_at": "2026-01-01T10:00:01Z",
            },
        ]

        # Set up mock chain for conversation
        mock_table = MagicMock()
        mock_supabase.table.return_value = mock_table

        # First call to table() is for conversations
        mock_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = conv_response

        # Second call for messages - need to track calls
        call_count = [0]
        original_table = mock_supabase.table

        def table_side_effect(name):
            call_count[0] += 1
            mock = MagicMock()
            if call_count[0] == 1:  # conversations
                mock.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = conv_response
            else:  # messages
                mock.select.return_value.eq.return_value.order.return_value.execute.return_value = msg_response
            return mock

        mock_supabase.table.side_effect = table_side_effect

        response = client.get(
            "/api/conversations/conv-uuid-123",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "conv-uuid-123"
        assert len(data["messages"]) == 2
        assert data["messages"][0]["role"] == "user"
        assert data["messages"][1]["role"] == "assistant"

    def test_get_conversation_includes_welcome_when_empty(
        self, client, mock_supabase
    ):
        """AC3: Should include welcome message when conversation has no messages."""
        conv_response = MagicMock()
        conv_response.data = {
            "id": "conv-uuid-123",
            "user_id": "test-user-id",
            "title": None,
            "created_at": "2026-01-01T10:00:00Z",
            "updated_at": "2026-01-01T10:00:00Z",
        }

        msg_response = MagicMock()
        msg_response.data = []  # No messages

        call_count = [0]

        def table_side_effect(name):
            call_count[0] += 1
            mock = MagicMock()
            if call_count[0] == 1:
                mock.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = conv_response
            else:
                mock.select.return_value.eq.return_value.order.return_value.execute.return_value = msg_response
            return mock

        mock_supabase.table.side_effect = table_side_effect

        response = client.get(
            "/api/conversations/conv-uuid-123",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["welcome_message"] is not None
        assert any(greeting in data["welcome_message"] for greeting in [
            "Good morning", "Good afternoon", "Good evening"
        ])

    def test_get_conversation_not_found(self, client, mock_supabase):
        """Should return 404 when conversation doesn't exist."""
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.side_effect = Exception(
            "No rows found - PGRST116"
        )

        response = client.get(
            "/api/conversations/nonexistent-id",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 404
        assert response.json()["detail"]["error"]["code"] == "NOT_FOUND"

    def test_get_conversation_requires_auth(self, client):
        """Should return 401 without authentication."""
        response = client.get("/api/conversations/any-id")

        assert response.status_code == 401


class TestWelcomeMessageGeneration:
    """Tests for welcome message time-of-day context."""

    def test_morning_greeting(self):
        """AC3: Should return morning greeting before noon."""
        from routers.conversations import generate_welcome_message
        from datetime import datetime
        from unittest.mock import patch

        # Mock datetime to return 9 AM
        with patch("routers.conversations.datetime") as mock_datetime:
            mock_now = MagicMock()
            mock_now.hour = 9
            mock_datetime.now.return_value = mock_now

            message = generate_welcome_message()
            assert "Good morning" in message

    def test_afternoon_greeting(self):
        """AC3: Should return afternoon greeting between noon and 5 PM."""
        from routers.conversations import generate_welcome_message
        from unittest.mock import patch

        with patch("routers.conversations.datetime") as mock_datetime:
            mock_now = MagicMock()
            mock_now.hour = 14  # 2 PM
            mock_datetime.now.return_value = mock_now

            message = generate_welcome_message()
            assert "Good afternoon" in message

    def test_evening_greeting(self):
        """AC3: Should return evening greeting after 5 PM."""
        from routers.conversations import generate_welcome_message
        from unittest.mock import patch

        with patch("routers.conversations.datetime") as mock_datetime:
            mock_now = MagicMock()
            mock_now.hour = 20  # 8 PM
            mock_datetime.now.return_value = mock_now

            message = generate_welcome_message()
            assert "Good evening" in message

    def test_invalid_timezone_fallback(self):
        """Should use default timezone for invalid input."""
        from routers.conversations import generate_welcome_message

        # Should not raise, should use default timezone
        message = generate_welcome_message("Invalid/Timezone")
        assert message is not None
        assert any(greeting in message for greeting in [
            "Good morning", "Good afternoon", "Good evening"
        ])
