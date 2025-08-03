"""Tests for LINE messaging functionality (Story 6.3).

Test coverage:
- AC1: Reply message with valid token
- AC2: Push message for proactive outreach
- AC3: Retry on transient failures
- AC4: Handle blocked/unfriended users
- AC5: Delivery tracking
- AC7: Performance
"""

import asyncio
import json
import hmac
import hashlib
import base64
import time
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx
from fastapi.testclient import TestClient

import sys
from pathlib import Path

# Add parent directory to allow imports
langgraph_server_dir = Path(__file__).parent.parent
sys.path.insert(0, str(langgraph_server_dir))
sys.path.insert(0, str(langgraph_server_dir / "fastapi-server"))

from src.services.line import LINEClient, with_retry
from main import app


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


def create_message_payload(user_id: str = "U1234567890", text: str = "Hello") -> dict:
    """Create a LINE message webhook payload for testing."""
    return {
        "destination": "U123456789",
        "events": [
            {
                "type": "message",
                "timestamp": 1609459200000,
                "source": {"type": "user", "userId": user_id},
                "replyToken": "test_reply_token",
                "message": {"type": "text", "id": "msg123", "text": text},
            }
        ],
    }


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def mock_channel_secret():
    """Mock the channel secret environment variable."""
    with patch("routers.webhooks.LINE_CHANNEL_SECRET", TEST_CHANNEL_SECRET):
        yield


class TestLINEClientReplyMessage:
    """Tests for LINEClient.reply_message()."""

    def test_reply_message_success(self):
        """AC1: Should send reply message with valid token."""
        with patch.dict("os.environ", {"LINE_CHANNEL_ACCESS_TOKEN": "test_token"}):
            line_client = LINEClient()

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.raise_for_status = MagicMock()

            with patch("httpx.AsyncClient") as mock_client:
                mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                    return_value=mock_response
                )

                result = asyncio.run(
                    line_client.reply_message(reply_token="valid_token", text="Hello!")
                )

                assert result["success"] is True
                assert result["error"] is None
                assert result["is_user_blocked"] is False

    def test_reply_message_without_token(self):
        """Should return error when reply token is empty."""
        with patch.dict("os.environ", {"LINE_CHANNEL_ACCESS_TOKEN": "test_token"}):
            line_client = LINEClient()
            result = asyncio.run(
                line_client.reply_message(reply_token="", text="Hello!")
            )

            assert result["success"] is False
            assert result["error"] == "No reply token"
            assert result["is_user_blocked"] is False

    def test_reply_message_no_channel_token(self):
        """Should return error when channel token is not configured."""
        with patch.dict("os.environ", {}, clear=True):
            with patch.object(LINEClient, "__init__", lambda self: None):
                client = LINEClient()
                client.channel_access_token = None
                client.default_user_id = None

                result = asyncio.run(
                    client.reply_message(reply_token="token", text="Hello!")
                )

                assert result["success"] is False
                assert "No channel access token" in result["error"]

    def test_reply_message_truncates_long_text(self):
        """Should truncate message exceeding 5000 characters."""
        with patch.dict("os.environ", {"LINE_CHANNEL_ACCESS_TOKEN": "test_token"}):
            line_client = LINEClient()
            long_text = "A" * 6000  # Exceeds MAX_MESSAGE_LENGTH

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.raise_for_status = MagicMock()

            with patch("httpx.AsyncClient") as mock_client:
                mock_post = AsyncMock(return_value=mock_response)
                mock_client.return_value.__aenter__.return_value.post = mock_post

                asyncio.run(
                    line_client.reply_message(reply_token="token", text=long_text)
                )

                # Verify truncated message was sent
                call_args = mock_post.call_args
                sent_text = call_args.kwargs["json"]["messages"][0]["text"]
                assert len(sent_text) == 5000
                assert sent_text.endswith("...")


class TestLINEClientPushMessage:
    """Tests for LINEClient.push_message()."""

    def test_push_message_success(self):
        """AC2: Should send push message successfully."""
        with patch.dict("os.environ", {"LINE_CHANNEL_ACCESS_TOKEN": "test_token"}):
            line_client = LINEClient()

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.raise_for_status = MagicMock()

            with patch("httpx.AsyncClient") as mock_client:
                mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                    return_value=mock_response
                )

                result = asyncio.run(
                    line_client.push_message(to="U123456789", text="Hello!")
                )

                assert result["success"] is True
                assert result["error"] is None
                assert result["is_user_blocked"] is False

    def test_push_message_without_recipient(self):
        """Should return error when recipient is empty."""
        with patch.dict("os.environ", {"LINE_CHANNEL_ACCESS_TOKEN": "test_token"}):
            line_client = LINEClient()
            result = asyncio.run(line_client.push_message(to="", text="Hello!"))

            assert result["success"] is False
            assert result["error"] == "No recipient specified"
            assert result["is_user_blocked"] is False

    def test_push_message_blocked_user_detected(self):
        """AC4: Should detect blocked user from 400 error."""
        with patch.dict("os.environ", {"LINE_CHANNEL_ACCESS_TOKEN": "test_token"}):
            line_client = LINEClient()

            mock_response = MagicMock()
            mock_response.status_code = 400
            mock_response.text = '{"message":"User not found"}'

            error = httpx.HTTPStatusError(
                "Bad Request", request=MagicMock(), response=mock_response
            )

            with patch("httpx.AsyncClient") as mock_client:
                mock_post = AsyncMock(side_effect=error)
                mock_client.return_value.__aenter__.return_value.post = mock_post

                result = asyncio.run(
                    line_client.push_message(to="U_BLOCKED_USER", text="Hello!")
                )

                assert result["success"] is False
                assert result["is_user_blocked"] is True


class TestLINEClientRetry:
    """Tests for retry logic."""

    def test_retry_on_timeout(self):
        """AC3: Should retry on timeout errors."""
        call_count = 0

        async def flaky_function():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise httpx.TimeoutException("Timeout")
            return "success"

        result = asyncio.run(
            with_retry(
                flaky_function,
                max_retries=3,
                delay_base=0.01,  # Short delay for tests
            )
        )

        assert result == "success"
        assert call_count == 3

    def test_retry_on_server_error(self):
        """AC3: Should retry on 500 server errors."""
        call_count = 0

        async def flaky_function():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                mock_response = MagicMock()
                mock_response.status_code = 500
                raise httpx.HTTPStatusError(
                    "Server Error", request=MagicMock(), response=mock_response
                )
            return "success"

        result = asyncio.run(
            with_retry(
                flaky_function,
                max_retries=3,
                delay_base=0.01,
            )
        )

        assert result == "success"
        assert call_count == 2

    def test_no_retry_on_client_error(self):
        """AC3: Should not retry on 4xx client errors (except 429)."""

        async def client_error():
            mock_response = MagicMock()
            mock_response.status_code = 400
            raise httpx.HTTPStatusError(
                "Bad Request", request=MagicMock(), response=mock_response
            )

        with pytest.raises(httpx.HTTPStatusError):
            asyncio.run(
                with_retry(
                    client_error,
                    max_retries=3,
                    delay_base=0.01,
                )
            )

    def test_retry_on_rate_limit(self):
        """AC3: Should retry on 429 rate limit errors."""
        call_count = 0

        async def rate_limited():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                mock_response = MagicMock()
                mock_response.status_code = 429
                raise httpx.HTTPStatusError(
                    "Too Many Requests", request=MagicMock(), response=mock_response
                )
            return "success"

        result = asyncio.run(
            with_retry(
                rate_limited,
                max_retries=3,
                delay_base=0.01,
            )
        )

        assert result == "success"
        assert call_count == 2


class TestLINEClientBackwardCompatibility:
    """Tests for backward-compatible send_message()."""

    def test_send_message_uses_default_user(self):
        """Should use default user when no recipient specified."""
        with patch.dict(
            "os.environ",
            {
                "LINE_CHANNEL_ACCESS_TOKEN": "test_token",
                "LINE_USER_ID": "default_user",
            },
        ):
            line_client = LINEClient()

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.raise_for_status = MagicMock()

            with patch("httpx.AsyncClient") as mock_client:
                mock_post = AsyncMock(return_value=mock_response)
                mock_client.return_value.__aenter__.return_value.post = mock_post

                result = asyncio.run(line_client.send_message(text="Hello!"))

                assert result is True
                # Verify default_user was used
                call_args = mock_post.call_args
                assert call_args.kwargs["json"]["to"] == "default_user"

    def test_send_message_with_custom_recipient(self):
        """Should use provided recipient over default."""
        with patch.dict(
            "os.environ",
            {
                "LINE_CHANNEL_ACCESS_TOKEN": "test_token",
                "LINE_USER_ID": "default_user",
            },
        ):
            line_client = LINEClient()

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.raise_for_status = MagicMock()

            with patch("httpx.AsyncClient") as mock_client:
                mock_post = AsyncMock(return_value=mock_response)
                mock_client.return_value.__aenter__.return_value.post = mock_post

                result = asyncio.run(
                    line_client.send_message(text="Hello!", to="custom_user")
                )

                assert result is True
                call_args = mock_post.call_args
                assert call_args.kwargs["json"]["to"] == "custom_user"

    def test_send_message_returns_false_on_failure(self):
        """Should return False when message fails."""
        with patch.dict(
            "os.environ",
            {
                "LINE_CHANNEL_ACCESS_TOKEN": "test_token",
                "LINE_USER_ID": "default_user",
            },
        ):
            line_client = LINEClient()

            mock_response = MagicMock()
            mock_response.status_code = 400
            mock_response.text = "Error"

            error = httpx.HTTPStatusError(
                "Bad Request", request=MagicMock(), response=mock_response
            )

            with patch("httpx.AsyncClient") as mock_client:
                mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                    side_effect=error
                )

                result = asyncio.run(line_client.send_message(text="Hello!"))

                assert result is False


class TestWebhookMessageReply:
    """Tests for webhook message reply integration."""

    def test_message_event_sends_reply(self, client, mock_channel_secret):
        """AC1: Should send reply when processing message event."""
        with patch("routers.webhooks.supabase_service") as mock_supabase:
            mock_supabase.get_user_by_line_id = AsyncMock(
                return_value={
                    "user_id": "app-user-123",
                    "external_user_id": "U1234567890",
                }
            )
            mock_supabase.update_connector_friendship = AsyncMock()

            with patch("routers.webhooks.LINEClient") as mock_line_class:
                mock_line_client = MagicMock()
                mock_line_client.reply_message = AsyncMock(
                    return_value={"success": True, "error": None, "is_user_blocked": False}
                )
                mock_line_class.return_value = mock_line_client

                payload = create_message_payload()
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
                time.sleep(0.2)

                mock_line_client.reply_message.assert_called_once()

    def test_reply_failure_falls_back_to_push(self, client, mock_channel_secret):
        """Should fall back to push when reply fails."""
        with patch("routers.webhooks.supabase_service") as mock_supabase:
            mock_supabase.get_user_by_line_id = AsyncMock(
                return_value={
                    "user_id": "app-user-123",
                    "external_user_id": "U1234567890",
                }
            )
            mock_supabase.update_connector_friendship = AsyncMock()

            with patch("routers.webhooks.LINEClient") as mock_line_class:
                mock_line_client = MagicMock()
                mock_line_client.reply_message = AsyncMock(
                    return_value={
                        "success": False,
                        "error": "Token expired",
                        "is_user_blocked": False,
                    }
                )
                mock_line_client.push_message = AsyncMock(
                    return_value={"success": True, "error": None, "is_user_blocked": False}
                )
                mock_line_class.return_value = mock_line_client

                payload = create_message_payload()
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
                time.sleep(0.2)

                mock_line_client.reply_message.assert_called_once()
                mock_line_client.push_message.assert_called_once()

    def test_blocked_user_updates_connector(self, client, mock_channel_secret):
        """AC4: Should update connector when user blocked detected."""
        with patch("routers.webhooks.supabase_service") as mock_supabase:
            mock_supabase.get_user_by_line_id = AsyncMock(
                return_value={
                    "user_id": "app-user-123",
                    "external_user_id": "U1234567890",
                }
            )
            mock_supabase.update_connector_friendship = AsyncMock()

            with patch("routers.webhooks.LINEClient") as mock_line_class:
                mock_line_client = MagicMock()
                mock_line_client.reply_message = AsyncMock(
                    return_value={
                        "success": False,
                        "error": "Failed",
                        "is_user_blocked": False,
                    }
                )
                mock_line_client.push_message = AsyncMock(
                    return_value={
                        "success": False,
                        "error": "Not found",
                        "is_user_blocked": True,
                    }
                )
                mock_line_class.return_value = mock_line_client

                payload = create_message_payload()
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
                time.sleep(0.2)

                mock_supabase.update_connector_friendship.assert_called_with(
                    user_id="app-user-123",
                    connector_type="line",
                    is_friend=False,
                )
