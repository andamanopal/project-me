"""LINE webhook endpoint for receiving messages and events.

Endpoints:
- POST /api/line/webhook - Receive LINE webhook events

Security:
- Validates X-Line-Signature header using HMAC-SHA256
- Returns 401 on invalid/missing signature
- Returns 200 OK immediately, processes events asynchronously
"""

import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import Response

from src.api.schemas import (
    LineEventSource,
    LineMessageContent,
    LineWebhookEvent,
    LineWebhookPayload,
)
from src.core.config import settings
from src.services import supabase as supabase_service
from src.services.line import LINEClient, verify_line_signature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["webhooks"])

# Privacy: truncate IDs in logs to avoid exposing full identifiers
LOG_ID_TRUNCATE_LENGTH = 10
LOG_USER_ID_TRUNCATE_LENGTH = 8

# Timeout for background event processing (seconds)
EVENT_PROCESSING_TIMEOUT_SECONDS = 30


async def process_message_event(event: LineWebhookEvent) -> None:
    """Process a LINE message event asynchronously.

    Args:
        event: The message event to process
    """
    line_user_id = event.source.user_id
    if not line_user_id:
        logger.warning("Message event missing user ID")
        return

    # Look up app user from LINE user ID
    connector = await supabase_service.get_user_by_line_id(line_user_id)

    if not connector:
        logger.info(f"Message from unknown LINE user: {line_user_id[:LOG_ID_TRUNCATE_LENGTH]}...")
        # TODO: Optionally send a reply suggesting they connect via web app
        return

    user_id = connector.get("user_id")
    logger.info(f"Message from LINE user {line_user_id[:LOG_ID_TRUNCATE_LENGTH]}... (app user: {user_id[:LOG_USER_ID_TRUNCATE_LENGTH]}...)")

    # Filter to text messages only for MVP
    if not event.message:
        logger.debug("Event has no message content")
        return

    if event.message.type != "text":
        logger.info(f"Ignoring non-text message type: {event.message.type}")
        return

    message_text = event.message.text
    if not message_text:
        logger.debug("Text message has no content")
        return

    # Log message receipt (don't log actual content for privacy)
    logger.info(f"Received text message from user {user_id[:LOG_USER_ID_TRUNCATE_LENGTH]}... (length: {len(message_text)})")

    # Generate response (placeholder - will integrate AI in future stories)
    # TODO (Epic 4): Integrate with LangGraph agent for AI responses
    response_text = "Thanks for your message! I'm still learning to respond properly."

    # Send reply via LINE
    line_client = LINEClient()
    reply_token = event.reply_token

    if reply_token:
        result = await line_client.reply_message(reply_token, response_text)
        if result["success"]:
            logger.info(f"Reply sent to user {user_id[:LOG_USER_ID_TRUNCATE_LENGTH]}...")
        else:
            # Reply token may have expired (60s limit), try push message as fallback
            logger.warning(f"Reply failed, trying push: {result.get('error')}")
            result = await line_client.push_message(line_user_id, response_text)

            if result["is_user_blocked"]:
                # User has blocked the bot - update connector status
                await supabase_service.update_connector_friendship(
                    user_id=user_id,
                    connector_type="line",
                    is_friend=False,
                )
                logger.info(f"User {user_id[:LOG_USER_ID_TRUNCATE_LENGTH]}... has blocked the bot")
            elif result["success"]:
                logger.info(f"Push message sent to user {user_id[:LOG_USER_ID_TRUNCATE_LENGTH]}...")
            else:
                logger.error(f"Failed to send message: {result.get('error')}")


async def process_follow_event(event: LineWebhookEvent) -> None:
    """Process a LINE follow event (user added bot as friend).

    Args:
        event: The follow event to process
    """
    line_user_id = event.source.user_id
    if not line_user_id:
        logger.warning("Follow event missing user ID")
        return

    connector = await supabase_service.get_user_by_line_id(line_user_id)

    if not connector:
        logger.info(f"Follow from unknown LINE user: {line_user_id[:LOG_ID_TRUNCATE_LENGTH]}...")
        return

    user_id = connector.get("user_id")

    # Update is_friend status in connector config
    await supabase_service.update_connector_friendship(
        user_id=user_id,
        connector_type="line",
        is_friend=True,
    )

    logger.info(f"LINE user {line_user_id[:LOG_ID_TRUNCATE_LENGTH]}... followed (app user: {user_id[:LOG_USER_ID_TRUNCATE_LENGTH]}...)")


async def process_unfollow_event(event: LineWebhookEvent) -> None:
    """Process a LINE unfollow event (user blocked/removed bot).

    Args:
        event: The unfollow event to process
    """
    line_user_id = event.source.user_id
    if not line_user_id:
        logger.warning("Unfollow event missing user ID")
        return

    connector = await supabase_service.get_user_by_line_id(line_user_id)

    if not connector:
        logger.info(f"Unfollow from unknown LINE user: {line_user_id[:LOG_ID_TRUNCATE_LENGTH]}...")
        return

    user_id = connector.get("user_id")

    # Update is_friend status in connector config
    await supabase_service.update_connector_friendship(
        user_id=user_id,
        connector_type="line",
        is_friend=False,
    )

    logger.info(f"LINE user {line_user_id[:LOG_ID_TRUNCATE_LENGTH]}... unfollowed (app user: {user_id[:LOG_USER_ID_TRUNCATE_LENGTH]}...)")


async def _process_line_event_internal(event: LineWebhookEvent) -> None:
    """Internal event processor - routes to appropriate handler.

    Args:
        event: The webhook event to process
    """
    if event.type == "message":
        await process_message_event(event)
    elif event.type == "follow":
        await process_follow_event(event)
    elif event.type == "unfollow":
        await process_unfollow_event(event)
    else:
        # Log other event types but don't process
        logger.debug(f"Ignoring LINE event type: {event.type}")


async def process_line_event(event: LineWebhookEvent) -> None:
    """Route LINE event to appropriate handler with timeout protection.

    Args:
        event: The webhook event to process
    """
    try:
        await asyncio.wait_for(
            _process_line_event_internal(event),
            timeout=EVENT_PROCESSING_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error(
            f"Timeout processing LINE event type '{event.type}' after "
            f"{EVENT_PROCESSING_TIMEOUT_SECONDS}s"
        )
    except Exception as e:
        # Log but don't raise - webhook should not fail after signature verification
        logger.error(f"Error processing LINE event: {e}", exc_info=True)


@router.post("/line/webhook")
async def line_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
) -> Response:
    """Receive LINE webhook events.

    LINE sends events here when users send messages, follow/unfollow, etc.

    Security:
    - Verifies X-Line-Signature header before processing
    - Returns 401 on invalid/missing signature
    - Always returns 200 OK after verification (even if processing fails)

    Performance:
    - Returns immediately after signature verification
    - Events processed asynchronously via BackgroundTasks
    - Webhook acknowledgment target: <200ms
    """
    # Get raw body for signature verification (must be done before parsing)
    body = await request.body()

    # Get signature header
    signature = request.headers.get("X-Line-Signature", "")

    if not signature:
        logger.warning("LINE webhook missing X-Line-Signature header")
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "MISSING_SIGNATURE",
                    "message": "X-Line-Signature header is required",
                }
            },
        )

    # Verify signature
    if not settings.line_channel_secret:
        logger.error("LINE_CHANNEL_SECRET not configured")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "CONFIGURATION_ERROR",
                    "message": "Webhook not properly configured",
                }
            },
        )

    if not verify_line_signature(body, signature, settings.line_channel_secret):
        logger.warning("LINE webhook signature verification failed")
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "INVALID_SIGNATURE",
                    "message": "Webhook signature verification failed",
                }
            },
        )

    # Parse payload (after signature verification)
    try:
        payload = LineWebhookPayload.model_validate_json(body)
    except Exception as e:
        # Log but return 200 OK - LINE will retry on errors
        logger.error(f"Failed to parse LINE webhook payload: {e}")
        return Response(status_code=200)

    # Log event summary
    event_types = [e.type for e in payload.events]
    logger.info(f"LINE webhook received {len(payload.events)} events: {event_types}")

    # Process events asynchronously
    for event in payload.events:
        background_tasks.add_task(process_line_event, event)

    # Return 200 OK immediately (LINE requirement)
    return Response(status_code=200)
