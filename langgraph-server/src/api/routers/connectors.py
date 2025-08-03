"""LINE OAuth and connector endpoints for Project-Me.

Endpoints:
- GET /connectors/line/authorize - Start LINE OAuth flow
- GET /connectors/line/callback - Handle LINE OAuth callback
- GET /connectors/line/status - Get LINE connection status
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from src.api.deps import get_user_id_from_request
from src.api.schemas import (
    AuthorizeResponse,
    ConnectorListItem,
    ConnectorListResponse,
    ConnectorStatus,
)
from src.core.config import settings
from src.services import supabase as supabase_service
from src.services.line import line_oauth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/connectors", tags=["connectors"])

# In-memory state storage for OAuth CSRF protection
# In production, use Redis or database for distributed systems
_oauth_states: Dict[str, Dict[str, Any]] = {}

# OAuth state expiration (10 minutes)
STATE_EXPIRATION_SECONDS = 600


def cleanup_expired_states() -> int:
    """Remove expired OAuth states to prevent memory leaks.

    Returns:
        Number of states removed
    """
    now = datetime.now(timezone.utc)
    expired_states = []

    for state, data in _oauth_states.items():
        created_at = datetime.fromisoformat(data["created_at"])
        if (now - created_at).total_seconds() > STATE_EXPIRATION_SECONDS:
            expired_states.append(state)

    for state in expired_states:
        del _oauth_states[state]

    if expired_states:
        logger.info(f"Cleaned up {len(expired_states)} expired OAuth states")

    return len(expired_states)


def is_state_expired(state_data: Dict[str, Any]) -> bool:
    """Check if an OAuth state has expired.

    Args:
        state_data: The state data containing created_at timestamp

    Returns:
        True if expired, False otherwise
    """
    created_at = datetime.fromisoformat(state_data["created_at"])
    now = datetime.now(timezone.utc)
    return (now - created_at).total_seconds() > STATE_EXPIRATION_SECONDS


@router.post("/line/authorize", response_model=AuthorizeResponse)
async def authorize_line(request: Request) -> AuthorizeResponse:
    """Start LINE OAuth authorization flow.

    SECURITY: This endpoint requires authentication via headers.
    Returns the authorization URL for the frontend to redirect to.
    User ID is stored securely with the state token, not exposed in URL.

    Returns:
        AuthorizeResponse with authorization URL
    """
    user_id = get_user_id_from_request(request)

    # Cleanup expired states to prevent memory leaks
    cleanup_expired_states()

    # Generate and store state token with user_id
    state = line_oauth_service.generate_state_token()
    _oauth_states[state] = {
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Build authorization URL
    auth_url = line_oauth_service.get_authorization_url(state)

    logger.info(f"Starting LINE OAuth for user {user_id[:8]}...")
    return AuthorizeResponse(authorization_url=auth_url)


@router.get("/line/callback")
async def line_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
) -> RedirectResponse:
    """Handle LINE OAuth callback.

    Verifies state token, exchanges code for token, fetches profile,
    and stores connector in database.

    Args:
        code: Authorization code from LINE
        state: CSRF state token
        error: Error code if authorization failed
        error_description: Error description

    Returns:
        Redirect to frontend with success/error status
    """
    # Handle user cancellation or error
    if error:
        logger.warning(f"LINE OAuth error: {error} - {error_description}")
        return RedirectResponse(
            url=f"{settings.frontend_url}/settings/connectors?error=cancelled",
            status_code=302,
        )

    # Verify state token exists
    if not state or state not in _oauth_states:
        logger.error("Invalid or missing state token")
        return RedirectResponse(
            url=f"{settings.frontend_url}/settings/connectors?error=invalid_state",
            status_code=302,
        )

    state_data = _oauth_states.pop(state)

    # Check if state has expired (10 minute window)
    if is_state_expired(state_data):
        logger.error("OAuth state token expired")
        return RedirectResponse(
            url=f"{settings.frontend_url}/settings/connectors?error=expired",
            status_code=302,
        )

    user_id = state_data["user_id"]

    # Verify code is present
    if not code:
        logger.error("No authorization code received")
        return RedirectResponse(
            url=f"{settings.frontend_url}/settings/connectors?error=no_code",
            status_code=302,
        )

    try:
        # Exchange code for token and get profile
        line_data = await line_oauth_service.process_callback(code)

        # Prepare connector config
        config = {
            "display_name": line_data.get("display_name"),
            "picture_url": line_data.get("picture_url"),
            "is_friend": True,  # bot_prompt=aggressive encourages friend add
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }

        # Store connector
        connector = await supabase_service.upsert_connector(
            user_id=user_id,
            connector_type="line",
            external_user_id=line_data["user_id"],
            config=config,
        )

        if not connector:
            logger.error("Failed to store LINE connector")
            return RedirectResponse(
                url=f"{settings.frontend_url}/settings/connectors?error=storage_failed",
                status_code=302,
            )

        logger.info(f"LINE connected for user {user_id[:8]}...")
        return RedirectResponse(
            url=f"{settings.frontend_url}/settings/connectors?success=true",
            status_code=302,
        )

    except Exception as e:
        logger.error(f"LINE OAuth callback failed: {e}")
        return RedirectResponse(
            url=f"{settings.frontend_url}/settings/connectors?error=oauth_failed",
            status_code=302,
        )


@router.get("/line/status", response_model=ConnectorStatus)
async def get_line_status(request: Request) -> ConnectorStatus:
    """Get LINE connection status for authenticated user.

    Returns:
        ConnectorStatus with connection details
    """
    user_id = get_user_id_from_request(request)

    connector = await supabase_service.get_connector(user_id, "line")

    if not connector or not connector.get("is_active"):
        return ConnectorStatus(connected=False, type="line")

    config = connector.get("config", {})
    return ConnectorStatus(
        connected=True,
        type="line",
        display_name=config.get("display_name"),
        picture_url=config.get("picture_url"),
        connected_at=connector.get("connected_at"),
    )


@router.delete("/line")
async def disconnect_line(
    request: Request,
    delete_data: bool = Query(
        False, description="Also delete imported chat history"
    ),
) -> Dict[str, str]:
    """Disconnect LINE account.

    Performs soft delete (sets is_active=false) to preserve data
    for potential reconnection. Optionally deletes imported chat data.

    Args:
        delete_data: If true, also deletes imported LINE chat history

    Returns:
        Success message with data deletion status
    """
    user_id = get_user_id_from_request(request)

    # Soft delete - preserve connector record
    success = await supabase_service.deactivate_connector(user_id, "line")

    if not success:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "DISCONNECT_FAILED",
                    "message": "Unable to disconnect LINE. Please try again.",
                }
            },
        )

    # Optionally delete imported chats
    deleted_count = 0
    if delete_data:
        deleted_count = await supabase_service.delete_imported_chats(user_id, "line")
        logger.info(f"Deleted {deleted_count} imported chats for user {user_id[:8]}...")

    message = "LINE disconnected successfully"
    if delete_data:
        message += f" and {deleted_count} messages deleted"

    return {"message": message}


@router.get("", response_model=ConnectorListResponse)
async def list_connectors(request: Request) -> ConnectorListResponse:
    """List all connectors for authenticated user.

    Returns all connectors including inactive ones for status display.

    Returns:
        ConnectorListResponse with list of connectors
    """
    user_id = get_user_id_from_request(request)

    connectors = await supabase_service.get_all_connectors(user_id)

    items = []
    for connector in connectors:
        config = connector.get("config", {})
        items.append(
            ConnectorListItem(
                type=connector.get("type", "unknown"),
                connected=connector.get("is_active", False),
                is_active=connector.get("is_active", False),
                display_name=config.get("display_name"),
                picture_url=config.get("picture_url"),
                connected_at=connector.get("connected_at"),
                last_sync_at=connector.get("last_sync_at"),
            )
        )

    return ConnectorListResponse(connectors=items)
