"""LINE Messaging API and OAuth client for Project-Me.

This module provides:
1. LINEClient - For sending push messages via Messaging API
2. LineOAuthService - For OAuth login flow via LINE Login Channel
3. verify_line_signature - For webhook signature verification
"""

import os
import hmac
import hashlib
import base64
import httpx
import logging
import secrets
from typing import Any, Callable, Dict, List, Optional, TypeVar
from datetime import datetime
import asyncio
from urllib.parse import urlencode
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# OAuth configuration
LINE_AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize"
LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token"
LINE_PROFILE_URL = "https://api.line.me/v2/profile"

# Messaging API endpoints
LINE_PUSH_API_URL = "https://api.line.me/v2/bot/message/push"
LINE_REPLY_API_URL = "https://api.line.me/v2/bot/message/reply"

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAY_BASE = 1.0  # seconds
RETRY_DELAY_MAX = 10.0  # seconds

# Privacy: truncate IDs in logs
LOG_ID_TRUNCATE_LENGTH = 10

# Message limits
MAX_MESSAGE_LENGTH = 5000

T = TypeVar("T")


async def with_retry(
    func: Callable[[], T],
    max_retries: int = MAX_RETRIES,
    delay_base: float = RETRY_DELAY_BASE,
    delay_max: float = RETRY_DELAY_MAX,
    operation_name: str = "API call",
) -> T:
    """Execute an async function with exponential backoff retry.

    Args:
        func: The async function to execute
        max_retries: Maximum number of retry attempts
        delay_base: Base delay in seconds (doubles each retry)
        delay_max: Maximum delay between retries
        operation_name: Name of operation for logging

    Returns:
        The result of the function

    Raises:
        The last exception if all retries fail
    """
    last_exception: Optional[Exception] = None

    for attempt in range(max_retries):
        try:
            return await func()
        except httpx.HTTPStatusError as e:
            # Don't retry 4xx client errors (except 429 rate limit)
            if 400 <= e.response.status_code < 500 and e.response.status_code != 429:
                raise
            last_exception = e
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            last_exception = e

        # Calculate delay with exponential backoff
        delay = min(delay_base * (2**attempt), delay_max)
        logger.warning(
            f"{operation_name} failed (attempt {attempt + 1}/{max_retries}), "
            f"retrying in {delay:.1f}s: {last_exception}"
        )
        await asyncio.sleep(delay)

    # All retries exhausted
    logger.error(f"{operation_name} failed after {max_retries} attempts")
    raise last_exception


def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    """Verify LINE webhook signature using HMAC-SHA256.

    LINE computes the signature as:
    1. HMAC-SHA256 of raw request body using channel secret as key
    2. Base64-encoded result

    Args:
        body: Raw request body bytes (must not be parsed/modified)
        signature: X-Line-Signature header value
        channel_secret: LINE Messaging API channel secret

    Returns:
        True if signature is valid, False otherwise

    Security Notes:
        - Uses hmac.compare_digest for constant-time comparison (prevents timing attacks)
        - Must verify raw bytes before any JSON parsing
        - Channel secret must be from Messaging API channel (not Login channel)
    """
    if not body or not signature or not channel_secret:
        return False

    try:
        # Compute HMAC-SHA256 hash
        hash_digest = hmac.new(
            channel_secret.encode("utf-8"),
            body,
            hashlib.sha256,
        ).digest()

        # Base64 encode the hash
        expected_signature = base64.b64encode(hash_digest).decode("utf-8")

        # Constant-time comparison to prevent timing attacks
        return hmac.compare_digest(signature, expected_signature)
    except Exception as e:
        logger.error(f"Signature verification error: {e}")
        return False


class LINEClient:
    """Client for sending messages via LINE Messaging API.

    Supports both reply messages (using replyToken) and push messages.
    Reply tokens expire after 60 seconds, so use push for delayed responses.
    """

    def __init__(self):
        self.channel_access_token = os.getenv("LINE_CHANNEL_ACCESS_TOKEN")
        self.default_user_id = os.getenv("LINE_USER_ID")

        if not self.channel_access_token:
            logger.warning("LINE_CHANNEL_ACCESS_TOKEN not set")

    def _get_headers(self) -> Dict[str, str]:
        """Get authorization headers for LINE API requests."""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.channel_access_token}",
        }

    def _truncate_text(self, text: str) -> str:
        """Truncate message to LINE's max length."""
        if len(text) > MAX_MESSAGE_LENGTH:
            return text[: MAX_MESSAGE_LENGTH - 3] + "..."
        return text

    async def _send_request(
        self,
        url: str,
        payload: Dict[str, Any],
        operation_name: str,
    ) -> Dict[str, Any]:
        """Send request to LINE API with retry logic.

        Returns:
            {"success": bool, "error": Optional[str], "is_user_blocked": bool}
        """
        if not self.channel_access_token:
            return {"success": False, "error": "No channel access token", "is_user_blocked": False}

        async def _request():
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    headers=self._get_headers(),
                    json=payload,
                    timeout=10.0,
                )
                response.raise_for_status()
                return response

        try:
            await with_retry(_request, operation_name=operation_name)
            return {"success": True, "error": None, "is_user_blocked": False}
        except httpx.HTTPStatusError as e:
            error_text = e.response.text if e.response else str(e)
            # Detect blocked user (LINE returns 400 with specific message)
            is_blocked = e.response.status_code == 400 and "not found" in error_text.lower()
            logger.error(f"{operation_name} failed: {e.response.status_code} - {error_text}")
            return {"success": False, "error": error_text, "is_user_blocked": is_blocked}
        except Exception as e:
            logger.error(f"{operation_name} failed: {e}")
            return {"success": False, "error": str(e), "is_user_blocked": False}

    async def reply_message(self, reply_token: str, text: str) -> Dict[str, Any]:
        """Reply to a LINE message using reply token.

        Reply tokens expire after 60 seconds! Use push_message for delayed responses.

        Args:
            reply_token: Token from webhook event (valid for 60s)
            text: Message text to send

        Returns:
            {"success": bool, "error": Optional[str], "is_user_blocked": bool}
        """
        if not reply_token:
            return {"success": False, "error": "No reply token", "is_user_blocked": False}

        payload = {
            "replyToken": reply_token,
            "messages": [{"type": "text", "text": self._truncate_text(text)}],
        }

        result = await self._send_request(LINE_REPLY_API_URL, payload, "LINE reply")
        if result["success"]:
            logger.info("LINE reply sent successfully")
        return result

    async def push_message(self, to: str, text: str) -> Dict[str, Any]:
        """Send a push message to a LINE user.

        Use this for proactive messages or when reply token is expired.

        Args:
            to: Recipient LINE user ID
            text: Message text to send

        Returns:
            {"success": bool, "error": Optional[str], "is_user_blocked": bool}
        """
        if not to:
            return {"success": False, "error": "No recipient specified", "is_user_blocked": False}

        payload = {
            "to": to,
            "messages": [{"type": "text", "text": self._truncate_text(text)}],
        }

        result = await self._send_request(LINE_PUSH_API_URL, payload, "LINE push")
        if result["success"]:
            logger.info(f"LINE push sent to {to[:LOG_ID_TRUNCATE_LENGTH]}...")
        return result

    async def send_message(self, text: str, to: Optional[str] = None) -> bool:
        """Send a text message via LINE (backward compatible).

        Args:
            text: The message text to send
            to: Recipient user ID (defaults to configured default_user_id)

        Returns:
            True if successful, False otherwise
        """
        recipient = to or self.default_user_id
        if not recipient:
            logger.error("Cannot send LINE message: No recipient specified")
            return False
        result = await self.push_message(recipient, text)
        return result["success"]

    async def send_todo_update(self, todos: List[Dict]) -> bool:
        """Send a formatted todo list update via LINE."""
        if not todos:
            message = "To-Do\n\nNo todos found. Your list is empty!"
        else:
            lines = ["To-Do", ""]
            for todo in todos:
                status = "[done]" if todo.get("status") == "done" else "[active]"
                lines.append(f"{status} {todo['title']}")
            message = "\n".join(lines)
        return await self.send_message(message)


def send_line_update_sync(todos: List[Dict]) -> bool:
    """Synchronous wrapper for sending LINE updates from non-async context.

    Args:
        todos: List of todo items

    Returns:
        True if successful, False otherwise
    """
    try:
        client = LINEClient()
        # Run the async function in a new event loop
        return asyncio.run(client.send_todo_update(todos))
    except Exception as e:
        logger.error(f"Error in sync LINE update: {str(e)}")
        return False


class LineOAuthService:
    """Service for LINE OAuth login flow.

    Uses LINE Login Channel (separate from Messaging API Channel).
    Both channels should be under the same provider for consistent user IDs.
    """

    def __init__(self) -> None:
        """Initialize LINE OAuth service with environment variables."""
        self.channel_id = os.getenv("LINE_LOGIN_CHANNEL_ID")
        self.channel_secret = os.getenv("LINE_LOGIN_CHANNEL_SECRET")
        self.callback_url = os.getenv("LINE_CALLBACK_URL")

        if not self.channel_id:
            logger.warning("LINE_LOGIN_CHANNEL_ID not set in environment")
        if not self.channel_secret:
            logger.warning("LINE_LOGIN_CHANNEL_SECRET not set in environment")
        if not self.callback_url:
            logger.warning("LINE_CALLBACK_URL not set in environment")

    def generate_state_token(self) -> str:
        """Generate a secure state token for CSRF protection.

        Returns:
            A 32-character hex string for use as OAuth state parameter.
        """
        return secrets.token_hex(16)

    def get_authorization_url(self, state: str) -> str:
        """Build LINE OAuth authorization URL.

        Args:
            state: CSRF protection token to verify callback

        Returns:
            Full authorization URL to redirect user to LINE Login
        """
        params = {
            "response_type": "code",
            "client_id": self.channel_id,
            "redirect_uri": self.callback_url,
            "scope": "profile openid",
            "state": state,
            "bot_prompt": "aggressive",  # Prompt user to add Official Account
        }
        return f"{LINE_AUTHORIZE_URL}?{urlencode(params)}"

    async def exchange_code_for_token(self, code: str) -> Dict[str, Any]:
        """Exchange authorization code for access token with retry.

        Args:
            code: Authorization code from LINE callback

        Returns:
            Token response containing access_token, id_token, etc.

        Raises:
            httpx.HTTPStatusError: If token exchange fails after retries
        """
        payload = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self.callback_url,
            "client_id": self.channel_id,
            "client_secret": self.channel_secret,
        }

        async def _exchange():
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    LINE_TOKEN_URL,
                    data=payload,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=30.0,
                )
                response.raise_for_status()
                return response.json()

        return await with_retry(_exchange, operation_name="LINE token exchange")

    async def get_line_profile(self, access_token: str) -> Dict[str, Any]:
        """Fetch user profile from LINE API with retry.

        Args:
            access_token: Valid LINE access token

        Returns:
            Profile data containing userId, displayName, pictureUrl

        Raises:
            httpx.HTTPStatusError: If profile fetch fails after retries
        """

        async def _get_profile():
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    LINE_PROFILE_URL,
                    headers={"Authorization": f"Bearer {access_token}"},
                    timeout=30.0,
                )
                response.raise_for_status()
                return response.json()

        return await with_retry(_get_profile, operation_name="LINE profile fetch")

    async def process_callback(self, code: str) -> Dict[str, Any]:
        """Process OAuth callback: exchange code and fetch profile.

        Args:
            code: Authorization code from LINE callback

        Returns:
            Dict with user_id, display_name, picture_url, access_token

        Raises:
            Exception: If any step of the OAuth flow fails
        """
        # Exchange code for token
        token_data = await self.exchange_code_for_token(code)
        access_token = token_data.get("access_token")

        if not access_token:
            raise ValueError("No access token in LINE response")

        # Fetch user profile
        profile = await self.get_line_profile(access_token)

        return {
            "user_id": profile.get("userId"),
            "display_name": profile.get("displayName"),
            "picture_url": profile.get("pictureUrl"),
            "access_token": access_token,
            "id_token": token_data.get("id_token"),
        }


# Module-level instance for convenience
line_oauth_service = LineOAuthService()
