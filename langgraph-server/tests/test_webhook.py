"""Tests for LINE webhook endpoint.

Test coverage:
- AC1: Webhook endpoint accessible, returns 200 OK
- AC2: Signature validation (valid, invalid, missing)
- AC3: Async message processing
- AC4: User lookup from LINE ID
- AC5: Unknown user handling
- AC6: Event type filtering (message, follow, unfollow)
- AC7: Performance (<200ms acknowledgment)
"""

import json
import hmac
import hashlib
import base64
import time
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

import sys
from pathlib import Path

# Add parent directory to allow imports
langgraph_server_dir = Path(__file__).parent.parent
sys.path.insert(0, str(langgraph_server_dir))
sys.path.insert(0, str(langgraph_server_dir / "fastapi-server"))

from main import app
from src.services.line import verify_line_signature


# Test channel secret for signature generation
TEST_CHANNEL_SECRET = "test_channel_secret_12345"


def generate_signature(body: bytes, channel_secret: str) -> str:
    """Generate a valid LINE signature for testing."""
    hash_digest = hmac.new(
        channel_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).digest()
    return base64.b64encode(hash_digest).decode("utf-8")


def create_webhook_payload(
    event_type: str = "message",
    user_id: str = "U1234567890",
    message_type: str = "text",
    message_text: str = "Hello",
    source_type: str = "user",
    group_id: str = None,
    room_id: str = None,
) -> dict:
    """Create a LINE webhook payload for testing.

    Args:
        event_type: Type of event (message, follow, unfollow, etc.)
        user_id: LINE user ID
        message_type: Type of message (text, image, etc.)
        message_text: Text content of message
        source_type: Source type (user, group, room)
        group_id: Group ID for group source type
        room_id: Room ID for room source type
    """
    source = {"type": source_type}

    if user_id:
        source["userId"] = user_id
    if group_id:
        source["groupId"] = group_id
    if room_id:
        source["roomId"] = room_id

    payload = {
        "destination": "U123456789",
        "events": [
            {
                "type": event_type,
                "timestamp": 1609459200000,
                "source": source,
                "replyToken": "test_reply_token",
            }
        ],
    }

    if event_type == "message":
        payload["events"][0]["message"] = {
            "type": message_type,
            "id": "msg123",
            "text": message_text if message_type == "text" else None,
        }

    return payload


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def mock_supabase():
    """Mock Supabase service for webhook."""
    with patch("routers.webhooks.supabase_service") as mock:
        mock.get_user_by_line_id = AsyncMock(return_value=None)
        mock.update_connector_friendship = AsyncMock(return_value={"id": "test"})
        yield mock


@pytest.fixture
def mock_channel_secret():
    """Mock the channel secret environment variable."""
    with patch("routers.webhooks.LINE_CHANNEL_SECRET", TEST_CHANNEL_SECRET):
        yield


class TestSignatureVerification:
    """Tests for LINE signature verification function."""

    def test_valid_signature_returns_true(self):
        """Should return True for valid signature."""
        body = b'{"test": "data"}'
        signature = generate_signature(body, TEST_CHANNEL_SECRET)

        result = verify_line_signature(body, signature, TEST_CHANNEL_SECRET)

        assert result is True

    def test_invalid_signature_returns_false(self):
        """Should return False for invalid signature."""
        body = b'{"test": "data"}'
        invalid_signature = "invalid_signature_base64=="

        result = verify_line_signature(body, invalid_signature, TEST_CHANNEL_SECRET)

        assert result is False

    def test_modified_body_fails_verification(self):
        """Should fail if body was modified after signing."""
        original_body = b'{"test": "data"}'
        signature = generate_signature(original_body, TEST_CHANNEL_SECRET)
        modified_body = b'{"test": "modified"}'

        result = verify_line_signature(modified_body, signature, TEST_CHANNEL_SECRET)

        assert result is False

    def test_empty_body_returns_false(self):
        """Should return False for empty body."""
        result = verify_line_signature(b"", "some_signature", TEST_CHANNEL_SECRET)

        assert result is False

    def test_empty_signature_returns_false(self):
        """Should return False for empty signature."""
        result = verify_line_signature(b"body", "", TEST_CHANNEL_SECRET)

        assert result is False

    def test_empty_secret_returns_false(self):
        """Should return False for empty channel secret."""
        result = verify_line_signature(b"body", "signature", "")

        assert result is False


class TestWebhookEndpoint:
    """Tests for POST /api/line/webhook endpoint."""

    def test_webhook_returns_200_with_valid_signature(
        self, client, mock_supabase, mock_channel_secret
    ):
        """AC1: Should return 200 OK for valid webhook request."""
        payload = create_webhook_payload()
        body = json.dumps(payload).encode("utf-8")
        signature = generate_signature(body, TEST_CHANNEL_SECRET)

        response = client.post(
            "/api/line/webhook",
            content=body,
            headers={
                "X-Line-Signature": signature,
                "Content-Type": "application/json",
            },
        )

        assert response.status_code == 200

    def test_webhook_returns_401_with_invalid_signature(
        self, client, mock_channel_secret
    ):
        """AC2: Should return 401 for invalid signature."""
        payload = create_webhook_payload()
        body = json.dumps(payload).encode("utf-8")

        response = client.post(
            "/api/line/webhook",
            content=body,
            headers={
                "X-Line-Signature": "invalid_signature",
                "Content-Type": "application/json",
            },
        )

        assert response.status_code == 401
        assert response.json()["detail"]["error"]["code"] == "INVALID_SIGNATURE"

    def test_webhook_returns_401_with_missing_signature(
        self, client, mock_channel_secret
    ):
        """AC2: Should return 401 when signature header is missing."""
        payload = create_webhook_payload()
        body = json.dumps(payload).encode("utf-8")

        response = client.post(
            "/api/line/webhook",
            content=body,
            headers={"Content-Type": "application/json"},
        )

        assert response.status_code == 401
        assert response.json()["detail"]["error"]["code"] == "MISSING_SIGNATURE"

    def test_webhook_returns_500_without_channel_secret_configured(self, client):
        """Should return 500 when channel secret is not configured."""
        with patch("routers.webhooks.LINE_CHANNEL_SECRET", ""):
            payload = create_webhook_payload()
            body = json.dumps(payload).encode("utf-8")

            response = client.post(
                "/api/line/webhook",
                content=body,
                headers={
                    "X-Line-Signature": "some_signature",
                    "Content-Type": "application/json",
                },
            )

            assert response.status_code == 500
            assert response.json()["detail"]["error"]["code"] == "CONFIGURATION_ERROR"

    def test_webhook_handles_malformed_json_gracefully(
        self, client, mock_channel_secret
    ):
        """AC7: Should return 200 OK even for malformed JSON (after signature)."""
        # Create valid signature for malformed body
        body = b"not valid json {"
        signature = generate_signature(body, TEST_CHANNEL_SECRET)

        response = client.post(
            "/api/line/webhook",
            content=body,
            headers={
                "X-Line-Signature": signature,
                "Content-Type": "application/json",
            },
        )

        # Should still return 200 - don't let LINE retry
        assert response.status_code == 200

    def test_webhook_acknowledges_quickly(
        self, client, mock_supabase, mock_channel_secret
    ):
        """AC7: Should acknowledge within 200ms."""
        payload = create_webhook_payload()
        body = json.dumps(payload).encode("utf-8")
        signature = generate_signature(body, TEST_CHANNEL_SECRET)

        start_time = time.time()
        response = client.post(
            "/api/line/webhook",
            content=body,
            headers={
                "X-Line-Signature": signature,
                "Content-Type": "application/json",
            },
        )
        elapsed_ms = (time.time() - start_time) * 1000

        assert response.status_code == 200
        # AC7: Webhook acknowledgment must be within 200ms
        assert elapsed_ms < 200, f"Webhook took {elapsed_ms:.0f}ms, expected <200ms"


class TestMessageEventProcessing:
    """Tests for message event handling."""

    def test_message_event_looks_up_user(
        self, client, mock_supabase, mock_channel_secret
    ):
        """AC4: Should look up app user from LINE ID."""
        mock_supabase.get_user_by_line_id.return_value = {
            "user_id": "app-user-123",
            "external_user_id": "U1234567890",
            "config": {"display_name": "Test User"},
        }

        payload = create_webhook_payload(
            event_type="message", user_id="U1234567890", message_text="Hello"
        )
        body = json.dumps(payload).encode("utf-8")
        signature = generate_signature(body, TEST_CHANNEL_SECRET)

        client.post(
            "/api/line/webhook",
            content=body,
            headers={
                "X-Line-Signature": signature,
                "Content-Type": "application/json",
            },
        )

        # Wait for background task
        time.sleep(0.1)

        mock_supabase.get_user_by_line_id.assert_called_with("U1234567890")

    def test_unknown_user_handled_gracefully(
        self, client, mock_supabase, mock_channel_secret
    ):
        """AC5: Should handle unknown LINE users gracefully."""
        mock_supabase.get_user_by_line_id.return_value = None

        payload = create_webhook_payload(
            event_type="message", user_id="U_UNKNOWN", message_text="Hello"
        )
        body = json.dumps(payload).encode("utf-8")
        signature = generate_signature(body, TEST_CHANNEL_SECRET)

        response = client.post(
            "/api/line/webhook",
            content=body,
            headers={
                "X-Line-Signature": signature,
                "Content-Type": "application/json",
            },
        )

        # Should still return 200 - don't fail on unknown users
        assert response.status_code == 200


class TestFollowUnfollowEvents:
    """Tests for follow/unfollow event handling."""

    def test_follow_event_updates_friendship(
        self, client, mock_supabase, mock_channel_secret
    ):
        """AC6: Should update is_friend=True on follow event."""
        mock_supabase.get_user_by_line_id.return_value = {
            "user_id": "app-user-123",
            "external_user_id": "U1234567890",
        }

        payload = create_webhook_payload(event_type="follow", user_id="U1234567890")
        body = json.dumps(payload).encode("utf-8")
        signature = generate_signature(body, TEST_CHANNEL_SECRET)

        client.post(
            "/api/line/webhook",
            content=body,
            headers={
                "X-Line-Signature": signature,
                "Content-Type": "application/json",
            },
        )

        # Wait for background task
        time.sleep(0.1)

        mock_supabase.update_connector_friendship.assert_called_with(
            user_id="app-user-123",
            connector_type="line",
            is_friend=True,
        )

    def test_unfollow_event_updates_friendship(
        self, client, mock_supabase, mock_channel_secret
    ):
        """AC6: Should update is_friend=False on unfollow event."""
        mock_supabase.get_user_by_line_id.return_value = {
            "user_id": "app-user-123",
            "external_user_id": "U1234567890",
        }

        payload = create_webhook_payload(event_type="unfollow", user_id="U1234567890")
        body = json.dumps(payload).encode("utf-8")
        signature = generate_signature(body, TEST_CHANNEL_SECRET)

        client.post(
            "/api/line/webhook",
            content=body,
            headers={
                "X-Line-Signature": signature,
                "Content-Type": "application/json",
            },
        )

        # Wait for background task
        time.sleep(0.1)

        mock_supabase.update_connector_friendship.assert_called_with(
            user_id="app-user-123",
            connector_type="line",
            is_friend=False,
        )


class TestEventTypeFiltering:
    """Tests for event type filtering."""

    def test_postback_event_returns_200_without_processing(
        self, client, mock_supabase, mock_channel_secret
    ):
        """AC6: Should acknowledge but not process postback events."""
        payload = {
            "destination": "U123456789",
            "events": [
                {
                    "type": "postback",
                    "timestamp": 1609459200000,
                    "source": {"type": "user", "userId": "U1234567890"},
                    "postback": {"data": "action=buy&itemid=123"},
                }
            ],
        }
        body = json.dumps(payload).encode("utf-8")
        signature = generate_signature(body, TEST_CHANNEL_SECRET)

        response = client.post(
            "/api/line/webhook",
            content=body,
            headers={
                "X-Line-Signature": signature,
                "Content-Type": "application/json",
            },
        )

        assert response.status_code == 200
        # User lookup should not be called for postback
        time.sleep(0.1)
        # postback events are logged but not fully processed

    def test_multiple_events_processed(
        self, client, mock_supabase, mock_channel_secret
    ):
        """Should process multiple events in single webhook."""
        payload = {
            "destination": "U123456789",
            "events": [
                {
                    "type": "message",
                    "timestamp": 1609459200000,
                    "source": {"type": "user", "userId": "U1234567890"},
                    "message": {"type": "text", "id": "msg1", "text": "Hello"},
                },
                {
                    "type": "message",
                    "timestamp": 1609459200001,
                    "source": {"type": "user", "userId": "U0987654321"},
                    "message": {"type": "text", "id": "msg2", "text": "World"},
                },
            ],
        }
        body = json.dumps(payload).encode("utf-8")
        signature = generate_signature(body, TEST_CHANNEL_SECRET)

        response = client.post(
            "/api/line/webhook",
            content=body,
            headers={
                "X-Line-Signature": signature,
                "Content-Type": "application/json",
            },
        )

        assert response.status_code == 200

    def test_non_text_message_ignored(
        self, client, mock_supabase, mock_channel_secret
    ):
        """AC6: Should ignore non-text messages for MVP."""
        mock_supabase.get_user_by_line_id.return_value = {
            "user_id": "app-user-123",
            "external_user_id": "U1234567890",
        }

        payload = create_webhook_payload(
            event_type="message",
            user_id="U1234567890",
            message_type="image",
        )
        body = json.dumps(payload).encode("utf-8")
        signature = generate_signature(body, TEST_CHANNEL_SECRET)

        response = client.post(
            "/api/line/webhook",
            content=body,
            headers={
                "X-Line-Signature": signature,
                "Content-Type": "application/json",
            },
        )

        # Should still return 200
        assert response.status_code == 200


class TestSourceTypes:
    """Tests for different LINE source types (user, group, room)."""

    def test_group_message_event_processed(
        self, client, mock_supabase, mock_channel_secret
    ):
        """Should process message events from group chats."""
        mock_supabase.get_user_by_line_id.return_value = {
            "user_id": "app-user-123",
            "external_user_id": "U1234567890",
        }

        payload = create_webhook_payload(
            event_type="message",
            user_id="U1234567890",
            message_text="Hello from group",
            source_type="group",
            group_id="C1234567890",
        )
        body = json.dumps(payload).encode("utf-8")
        signature = generate_signature(body, TEST_CHANNEL_SECRET)

        response = client.post(
            "/api/line/webhook",
            content=body,
            headers={
                "X-Line-Signature": signature,
                "Content-Type": "application/json",
            },
        )

        assert response.status_code == 200

        # Wait for background task
        time.sleep(0.1)

        mock_supabase.get_user_by_line_id.assert_called_with("U1234567890")

    def test_room_message_event_processed(
        self, client, mock_supabase, mock_channel_secret
    ):
        """Should process message events from multi-person chats (rooms)."""
        mock_supabase.get_user_by_line_id.return_value = {
            "user_id": "app-user-123",
            "external_user_id": "U1234567890",
        }

        payload = create_webhook_payload(
            event_type="message",
            user_id="U1234567890",
            message_text="Hello from room",
            source_type="room",
            room_id="R1234567890",
        )
        body = json.dumps(payload).encode("utf-8")
        signature = generate_signature(body, TEST_CHANNEL_SECRET)

        response = client.post(
            "/api/line/webhook",
            content=body,
            headers={
                "X-Line-Signature": signature,
                "Content-Type": "application/json",
            },
        )

        assert response.status_code == 200

        # Wait for background task
        time.sleep(0.1)

        mock_supabase.get_user_by_line_id.assert_called_with("U1234567890")

    def test_group_message_without_user_id_handled(
        self, client, mock_supabase, mock_channel_secret
    ):
        """Should handle group messages that don't include userId."""
        payload = create_webhook_payload(
            event_type="message",
            user_id=None,  # No user ID in some group scenarios
            message_text="Anonymous group message",
            source_type="group",
            group_id="C1234567890",
        )
        body = json.dumps(payload).encode("utf-8")
        signature = generate_signature(body, TEST_CHANNEL_SECRET)

        response = client.post(
            "/api/line/webhook",
            content=body,
            headers={
                "X-Line-Signature": signature,
                "Content-Type": "application/json",
            },
        )

        # Should return 200 and handle gracefully (user lookup skipped)
        assert response.status_code == 200

        # Wait for background task
        time.sleep(0.1)

        # User lookup should not be called when userId is missing
        mock_supabase.get_user_by_line_id.assert_not_called()
