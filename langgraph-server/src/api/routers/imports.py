"""Chat import endpoints for Project-Me.

Handles importing chat history from external platforms (LINE, etc.)
for personality extraction and memory storage.

Endpoints:
- POST /api/imports/line - Upload and process LINE chat export
- GET /api/imports/line/status - Get import status
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Request, UploadFile

from src.api.deps import get_user_id_from_request
from src.api.schemas import ImportResponse, ImportStatsResponse, ImportStatusResponse
from src.services import supabase as supabase_service
from src.services.line_import import (
    extract_txt_from_zip,
    parse_line_export,
    validate_line_export,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/imports", tags=["imports"])

# Configuration
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_CONTENT_TYPES = {
    "application/zip",
    "application/x-zip-compressed",
    "text/plain",
}

# In-memory import status tracking (use Redis in production)
_import_status: Dict[str, Dict[str, Any]] = {}


def generate_import_id(user_id: str) -> str:
    """Generate unique import ID for tracking."""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"{user_id[:8]}-{timestamp}"


async def process_line_import_background(
    user_id: str,
    import_id: str,
    content: str,
    user_display_name: str | None = None,
) -> None:
    """Background task to process LINE import.

    Args:
        user_id: Supabase auth user ID
        import_id: Import tracking ID
        content: Raw text content of LINE export
        user_display_name: User's display name for identifying outgoing messages
    """
    try:
        _import_status[import_id] = {
            "status": "processing",
            "started_at": datetime.now(timezone.utc).isoformat(),
        }

        # Parse messages (only outgoing for personality extraction)
        messages = []
        for msg in parse_line_export(content, user_display_name):
            if msg.is_outgoing and msg.content:
                messages.append({
                    "content": msg.content,
                    "source": "line",
                    "sent_at": msg.sent_at.isoformat() if msg.sent_at else None,
                    "metadata": {
                        "sender_name": msg.sender_name,
                        "is_outgoing": True,
                    },
                })

        if not messages:
            _import_status[import_id] = {
                "status": "failed",
                "error": "No outgoing messages found in export",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
            return

        # Delete existing imports for this source (re-import overwrites)
        await supabase_service.delete_imported_chats(user_id, "line")

        # Bulk insert messages
        inserted_count = await supabase_service.bulk_insert_imported_chats(
            user_id=user_id,
            messages=messages,
            batch_size=100,
        )

        # Update connector with import stats
        await supabase_service.update_connector_import_stats(
            user_id=user_id,
            connector_type="line",
            message_count=inserted_count,
        )

        _import_status[import_id] = {
            "status": "completed",
            "message_count": inserted_count,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }

        logger.info(f"LINE import completed: {inserted_count} messages for user {user_id[:8]}...")

        # TODO (Epic 5): Queue personality extraction job here
        # await queue_personality_extraction(user_id, "line")

    except Exception as e:
        logger.error(f"LINE import failed for user {user_id[:8]}...: {e}")
        _import_status[import_id] = {
            "status": "failed",
            "error": str(e),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }


@router.post("/line", response_model=ImportResponse)
async def import_line_chat(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
) -> ImportResponse:
    """Upload and process LINE chat export.

    Accepts .zip or .txt files containing LINE chat history.
    Processing happens in background; use /status endpoint to check progress.

    Args:
        request: FastAPI request
        background_tasks: Background task manager
        file: Uploaded file (zip or txt)

    Returns:
        ImportResponse with import_id for status tracking
    """
    user_id = get_user_id_from_request(request)

    # Validate file type
    content_type = file.content_type or ""
    filename = file.filename or ""

    is_valid_type = (
        content_type in ALLOWED_CONTENT_TYPES
        or filename.endswith(".zip")
        or filename.endswith(".txt")
    )

    if not is_valid_type:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "INVALID_FILE_TYPE",
                    "message": "Please upload a .zip or .txt file exported from LINE.",
                }
            },
        )

    # Read file content
    file_content = await file.read()

    # Validate file size
    if len(file_content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "FILE_TOO_LARGE",
                    "message": f"File exceeds maximum size of {MAX_FILE_SIZE // (1024*1024)}MB.",
                }
            },
        )

    # Extract text content
    if filename.endswith(".zip") or content_type in {"application/zip", "application/x-zip-compressed"}:
        text_content = extract_txt_from_zip(file_content)
        if not text_content:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INVALID_ZIP",
                        "message": "Could not find a text file in the zip. Please upload a valid LINE export.",
                    }
                },
            )
    else:
        text_content = file_content.decode("utf-8", errors="replace")

    # Validate LINE export format
    is_valid, error_msg = validate_line_export(text_content)
    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "INVALID_FORMAT",
                    "message": error_msg or "File does not appear to be a valid LINE export.",
                }
            },
        )

    # Get user's display name from connector for better message identification
    connector = await supabase_service.get_connector(user_id, "line")
    user_display_name = connector.get("config", {}).get("display_name") if connector else None

    # Generate import ID and start background processing
    import_id = generate_import_id(user_id)

    _import_status[import_id] = {
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    background_tasks.add_task(
        process_line_import_background,
        user_id=user_id,
        import_id=import_id,
        content=text_content,
        user_display_name=user_display_name,
    )

    return ImportResponse(
        success=True,
        message="Import started. Processing your messages to learn your style...",
        import_id=import_id,
    )


@router.get("/line/status/{import_id}", response_model=ImportStatusResponse)
async def get_import_status(
    request: Request,
    import_id: str,
) -> ImportStatusResponse:
    """Get status of a LINE import.

    Args:
        request: FastAPI request
        import_id: Import ID from import_line_chat response

    Returns:
        ImportStatusResponse with current status
    """
    get_user_id_from_request(request)  # Verify auth

    status_data = _import_status.get(import_id)

    if not status_data:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "IMPORT_NOT_FOUND",
                    "message": "Import not found. It may have expired or never existed.",
                }
            },
        )

    return ImportStatusResponse(
        status=status_data.get("status", "unknown"),
        message_count=status_data.get("message_count"),
        error=status_data.get("error"),
        completed_at=status_data.get("completed_at"),
    )


@router.get("/line/stats", response_model=ImportStatsResponse)
async def get_line_import_stats(request: Request) -> ImportStatsResponse:
    """Get LINE import statistics for current user.

    Returns:
        ImportStatsResponse with message count and date range
    """
    user_id = get_user_id_from_request(request)

    # Get import stats from database
    stats = await supabase_service.get_import_stats(user_id, "line")

    # Get last import date from connector
    connector = await supabase_service.get_connector(user_id, "line")
    last_import_at = connector.get("config", {}).get("last_import_at") if connector else None

    return ImportStatsResponse(
        message_count=stats.get("message_count", 0),
        oldest_message=stats.get("oldest_message"),
        newest_message=stats.get("newest_message"),
        last_import_at=last_import_at,
    )
