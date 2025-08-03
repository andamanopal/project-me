"""Tests for LINE OAuth connector endpoints.

Test coverage:
- AC2: OAuth flow initiation
- AC3: Successful authorization callback
- AC4: Denied authorization handling
- AC5: Error handling
- AC6: Connection status endpoint
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

# Import the app - adjust path as needed
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
def mock_line_oauth():
    """Mock LINE OAuth service."""
    with patch("routers.connectors.line_oauth_service") as mock:
        mock.generate_state_token.return_value = "test_state_token"
        mock.get_authorization_url.return_value = (
            "https://access.line.me/oauth2/v2.1/authorize?test=1"
        )
        mock.process_callback = AsyncMock(
            return_value={
                "user_id": "U1234567890",
                "display_name": "Test User",
                "picture_url": "https://example.com/avatar.jpg",
                "access_token": "test_access_token",
            }
        )
        yield mock


@pytest.fixture
def mock_supabase():
    """Mock Supabase service."""
    with patch("routers.connectors.supabase_service") as mock:
        mock.get_connector = AsyncMock(return_value=None)
        mock.upsert_connector = AsyncMock(
            return_value={
                "id": "test-uuid",
                "user_id": "test-user-id",
                "type": "line",
                "external_user_id": "U1234567890",
                "config": {"display_name": "Test User"},
            }
        )
        mock.delete_connector = AsyncMock(return_value=True)
        mock.deactivate_connector = AsyncMock(return_value=True)
        mock.delete_imported_chats = AsyncMock(return_value=100)
        mock.get_all_connectors = AsyncMock(return_value=[])
        yield mock


class TestLineAuthorize:
    """Tests for POST /connectors/line/authorize endpoint."""

    def test_authorize_returns_authorization_url(self, client, mock_line_oauth):
        """AC2: Should return authorization URL in response."""
        response = client.post(
            "/connectors/line/authorize",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "authorization_url" in data
        assert "access.line.me" in data["authorization_url"]

    def test_authorize_generates_state(self, client, mock_line_oauth):
        """AC2: Should generate CSRF state token."""
        client.post(
            "/connectors/line/authorize",
            headers={"X-User-Id": "test-user-id"},
        )

        mock_line_oauth.generate_state_token.assert_called_once()

    def test_authorize_requires_auth(self, client):
        """Should return 401 without authentication."""
        response = client.post("/connectors/line/authorize")

        assert response.status_code == 401


class TestLineCallback:
    """Tests for GET /connectors/line/callback endpoint."""

    def test_callback_success_redirects_to_frontend(
        self, client, mock_line_oauth, mock_supabase
    ):
        """AC3: Should redirect to frontend with success param."""
        # First, initiate OAuth to store state
        with patch.dict(
            "routers.connectors._oauth_states",
            {"test_state": {"user_id": "test-user-id", "created_at": "2026-01-01T00:00:00+00:00"}},
        ):
            response = client.get(
                "/connectors/line/callback",
                params={"code": "test_code", "state": "test_state"},
                follow_redirects=False,
            )

        assert response.status_code == 302
        assert "success=true" in response.headers["location"]

    def test_callback_error_redirects_with_cancelled(self, client):
        """AC4: Should redirect with cancelled error on user denial."""
        response = client.get(
            "/connectors/line/callback",
            params={"error": "access_denied", "error_description": "User denied"},
            follow_redirects=False,
        )

        assert response.status_code == 302
        assert "error=cancelled" in response.headers["location"]

    def test_callback_invalid_state_redirects_with_error(self, client):
        """AC5: Should redirect with error on invalid state."""
        response = client.get(
            "/connectors/line/callback",
            params={"code": "test_code", "state": "invalid_state"},
            follow_redirects=False,
        )

        assert response.status_code == 302
        assert "error=invalid_state" in response.headers["location"]

    def test_callback_no_code_redirects_with_error(self, client):
        """AC5: Should redirect with error when no code provided."""
        with patch.dict(
            "routers.connectors._oauth_states",
            {"test_state": {"user_id": "test-user-id", "created_at": "2026-01-01T00:00:00+00:00"}},
        ):
            response = client.get(
                "/connectors/line/callback",
                params={"state": "test_state"},
                follow_redirects=False,
            )

        assert response.status_code == 302
        assert "error=no_code" in response.headers["location"]

    def test_callback_stores_connector(self, client, mock_line_oauth, mock_supabase):
        """AC3: Should store connector in database on success."""
        with patch.dict(
            "routers.connectors._oauth_states",
            {"test_state": {"user_id": "test-user-id", "created_at": "2026-01-01T00:00:00+00:00"}},
        ):
            client.get(
                "/connectors/line/callback",
                params={"code": "test_code", "state": "test_state"},
                follow_redirects=False,
            )

        mock_supabase.upsert_connector.assert_called_once()
        call_args = mock_supabase.upsert_connector.call_args
        assert call_args.kwargs["user_id"] == "test-user-id"
        assert call_args.kwargs["connector_type"] == "line"
        assert call_args.kwargs["external_user_id"] == "U1234567890"


class TestLineStatus:
    """Tests for GET /connectors/line/status endpoint."""

    def test_status_not_connected(self, client, mock_supabase):
        """AC6: Should return not connected status."""
        mock_supabase.get_connector.return_value = None

        response = client.get(
            "/connectors/line/status", headers={"X-User-Id": "test-user-id"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["connected"] is False
        assert data["type"] == "line"

    def test_status_connected(self, client, mock_supabase):
        """AC6: Should return connected status with display name."""
        mock_supabase.get_connector.return_value = {
            "id": "test-uuid",
            "user_id": "test-user-id",
            "type": "line",
            "external_user_id": "U1234567890",
            "config": {
                "display_name": "Test User",
                "picture_url": "https://example.com/avatar.jpg",
            },
            "is_active": True,
            "connected_at": "2025-01-01T00:00:00Z",
        }

        response = client.get(
            "/connectors/line/status", headers={"X-User-Id": "test-user-id"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["connected"] is True
        assert data["display_name"] == "Test User"
        assert data["picture_url"] == "https://example.com/avatar.jpg"

    def test_status_requires_auth(self, client):
        """Should return 401 without authentication."""
        response = client.get("/connectors/line/status")

        assert response.status_code == 401


class TestLineDisconnect:
    """Tests for DELETE /connectors/line endpoint."""

    def test_disconnect_success_soft_delete(self, client, mock_supabase):
        """Should soft delete connector and return success."""
        response = client.delete(
            "/connectors/line", headers={"X-User-Id": "test-user-id"}
        )

        assert response.status_code == 200
        assert "disconnected" in response.json()["message"].lower()
        mock_supabase.deactivate_connector.assert_called_once_with("test-user-id", "line")

    def test_disconnect_without_delete_data(self, client, mock_supabase):
        """Should not delete imported chats by default."""
        response = client.delete(
            "/connectors/line", headers={"X-User-Id": "test-user-id"}
        )

        assert response.status_code == 200
        mock_supabase.delete_imported_chats.assert_not_called()

    def test_disconnect_with_delete_data(self, client, mock_supabase):
        """Should delete imported chats when delete_data=true."""
        response = client.delete(
            "/connectors/line",
            params={"delete_data": "true"},
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 200
        mock_supabase.delete_imported_chats.assert_called_once_with("test-user-id", "line")
        assert "100" in response.json()["message"]  # Shows deleted count

    def test_disconnect_failure(self, client, mock_supabase):
        """Should return 500 on deactivate failure."""
        mock_supabase.deactivate_connector.return_value = False

        response = client.delete(
            "/connectors/line", headers={"X-User-Id": "test-user-id"}
        )

        assert response.status_code == 500

    def test_disconnect_requires_auth(self, client):
        """Should return 401 without authentication."""
        response = client.delete("/connectors/line")

        assert response.status_code == 401


class TestListConnectors:
    """Tests for GET /connectors endpoint."""

    def test_list_empty_connectors(self, client, mock_supabase):
        """Should return empty list when no connectors."""
        mock_supabase.get_all_connectors.return_value = []

        response = client.get(
            "/connectors", headers={"X-User-Id": "test-user-id"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["connectors"] == []

    def test_list_returns_connector_details(self, client, mock_supabase):
        """Should return connector details."""
        mock_supabase.get_all_connectors.return_value = [
            {
                "type": "line",
                "is_active": True,
                "config": {
                    "display_name": "Test User",
                    "picture_url": "https://example.com/avatar.jpg",
                },
                "connected_at": "2025-01-01T00:00:00Z",
                "last_sync_at": "2025-01-02T00:00:00Z",
            }
        ]

        response = client.get(
            "/connectors", headers={"X-User-Id": "test-user-id"}
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["connectors"]) == 1
        connector = data["connectors"][0]
        assert connector["type"] == "line"
        assert connector["connected"] is True
        assert connector["display_name"] == "Test User"

    def test_list_includes_inactive_connectors(self, client, mock_supabase):
        """Should include inactive connectors."""
        mock_supabase.get_all_connectors.return_value = [
            {
                "type": "line",
                "is_active": False,
                "config": {"display_name": "Old User"},
                "connected_at": "2024-01-01T00:00:00Z",
            }
        ]

        response = client.get(
            "/connectors", headers={"X-User-Id": "test-user-id"}
        )

        assert response.status_code == 200
        data = response.json()
        connector = data["connectors"][0]
        assert connector["connected"] is False
        assert connector["is_active"] is False

    def test_list_requires_auth(self, client):
        """Should return 401 without authentication."""
        response = client.get("/connectors")

        assert response.status_code == 401


class TestLineOAuthService:
    """Tests for LINE OAuth service module."""

    def test_generate_state_token_is_unique(self):
        """Should generate unique state tokens."""
        from src.services.line import LineOAuthService

        service = LineOAuthService()
        token1 = service.generate_state_token()
        token2 = service.generate_state_token()

        assert token1 != token2
        assert len(token1) == 32  # 16 bytes hex = 32 chars

    def test_authorization_url_includes_required_params(self):
        """Should include all required OAuth parameters."""
        from src.services.line import LineOAuthService

        service = LineOAuthService()
        service.channel_id = "test_channel_id"
        service.callback_url = "http://localhost:3000/callback"

        url = service.get_authorization_url("test_state")

        assert "response_type=code" in url
        assert "client_id=test_channel_id" in url
        assert "scope=profile" in url
        assert "state=test_state" in url
        assert "bot_prompt=aggressive" in url


class TestSupabaseService:
    """Tests for Supabase connector service."""

    @pytest.mark.asyncio
    async def test_get_connector_returns_none_when_not_found(self):
        """Should return None when connector doesn't exist."""
        from src.services.supabase import get_connector

        with patch("src.services.supabase.get_supabase_client") as mock_client:
            mock_client.return_value = None

            result = await get_connector("test-user-id", "line")

            assert result is None

    @pytest.mark.asyncio
    async def test_upsert_connector_creates_record(self):
        """Should create/update connector record."""
        from src.services.supabase import upsert_connector

        mock_response = MagicMock()
        mock_response.data = [{"id": "test-uuid", "type": "line"}]

        mock_table = MagicMock()
        mock_table.upsert.return_value.execute.return_value = mock_response

        mock_client = MagicMock()
        mock_client.table.return_value = mock_table

        with patch(
            "src.services.supabase.get_supabase_client", return_value=mock_client
        ):
            result = await upsert_connector(
                user_id="test-user-id",
                connector_type="line",
                external_user_id="U1234567890",
                config={"display_name": "Test"},
            )

            assert result is not None
            mock_client.table.assert_called_with("connectors")
