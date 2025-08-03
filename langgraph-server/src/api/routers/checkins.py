"""Check-ins CRUD endpoints for Project-Me.

Endpoints:
- GET /api/check-ins - List user's check-ins with optional date filter
- PUT /api/check-ins/{id} - Update check-in transcript
- DELETE /api/check-ins/{id} - Permanently delete check-in
"""

import logging
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from src.api.deps import get_user_id_from_request
from src.api.schemas import CheckInResponse, UpdateCheckInRequest
from src.services.supabase import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["check-ins"])


@router.get("/check-ins", response_model=List[CheckInResponse])
async def list_check_ins(
    request: Request,
    check_date: Optional[date] = Query(None, alias="date"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> List[Dict[str, Any]]:
    """List check-ins for the authenticated user.

    Args:
        request: FastAPI request for auth extraction
        check_date: Optional date filter (YYYY-MM-DD)
        limit: Maximum number of results (default 20, max 100)
        offset: Pagination offset

    Returns:
        List of check-in records with status, transcript, and summary
    """
    user_id = get_user_id_from_request(request)

    client = get_supabase_client()
    if not client:
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "SERVICE_UNAVAILABLE",
                    "message": "Database service unavailable",
                }
            },
        )

    try:
        # Build query
        query = (
            client.table("check_ins")
            .select("id, user_id, status, transcript, summary, audio_path, created_at, updated_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .offset(offset)
        )

        # Add date filter if provided
        if check_date:
            # Filter by date using ISO format
            date_start = f"{check_date}T00:00:00"
            date_end = f"{check_date}T23:59:59"
            query = query.gte("created_at", date_start).lte("created_at", date_end)

        result = query.execute()

        # Transform audio_path to audio_url (signed URL for playback)
        check_ins = []
        for row in result.data:
            audio_url = None
            if row.get("audio_path"):
                # Generate signed URL for audio playback (1 hour expiry)
                try:
                    signed = client.storage.from_("voice-recordings").create_signed_url(
                        row["audio_path"], 3600
                    )
                    audio_url = signed.get("signedURL") if signed else None
                except Exception as e:
                    logger.warning(f"Failed to generate audio URL: {e}")

            check_ins.append({
                "id": row["id"],
                "user_id": row["user_id"],
                "status": row["status"],
                "transcript": row.get("transcript"),
                "summary": row.get("summary"),
                "audio_url": audio_url,
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            })

        return check_ins

    except Exception as e:
        logger.error(f"Failed to list check-ins for user {user_id[:8]}...: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "FETCH_FAILED",
                    "message": "Failed to fetch check-ins",
                }
            },
        )


@router.put("/check-ins/{check_in_id}", response_model=CheckInResponse)
async def update_check_in(
    check_in_id: str,
    body: UpdateCheckInRequest,
    request: Request,
) -> Dict[str, Any]:
    """Update check-in transcript, optionally regenerate summary.

    Args:
        check_in_id: UUID of the check-in to update
        body: Updated transcript and regeneration flag
        request: FastAPI request for auth extraction

    Returns:
        Updated check-in record
    """
    user_id = get_user_id_from_request(request)

    client = get_supabase_client()
    if not client:
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "SERVICE_UNAVAILABLE",
                    "message": "Database service unavailable",
                }
            },
        )

    try:
        # Verify ownership and get current check-in
        existing = (
            client.table("check_ins")
            .select("id, user_id, audio_path")
            .eq("id", check_in_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )

        if not existing.data:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": {
                        "code": "NOT_FOUND",
                        "message": "Check-in not found",
                    }
                },
            )

        # Prepare update data
        update_data: Dict[str, Any] = {
            "transcript": body.transcript,
        }

        # If regenerating summary, set status to 'summarizing'
        if body.regenerate_summary:
            update_data["status"] = "summarizing"
            update_data["summary"] = None

        # Update the check-in
        result = (
            client.table("check_ins")
            .update(update_data)
            .eq("id", check_in_id)
            .eq("user_id", user_id)
            .select("id, user_id, status, transcript, summary, audio_path, created_at, updated_at")
            .single()
            .execute()
        )

        row = result.data
        audio_url = None
        if row.get("audio_path"):
            try:
                signed = client.storage.from_("voice-recordings").create_signed_url(
                    row["audio_path"], 3600
                )
                audio_url = signed.get("signedURL") if signed else None
            except Exception as e:
                logger.warning(f"Failed to generate audio URL: {e}")

        logger.info(f"Updated check-in {check_in_id} for user {user_id[:8]}...")
        return {
            "id": row["id"],
            "user_id": row["user_id"],
            "status": row["status"],
            "transcript": row.get("transcript"),
            "summary": row.get("summary"),
            "audio_url": audio_url,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update check-in {check_in_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "UPDATE_FAILED",
                    "message": "Failed to update check-in",
                }
            },
        )


@router.delete("/check-ins/{check_in_id}", status_code=204)
async def delete_check_in(
    check_in_id: str,
    request: Request,
) -> None:
    """Permanently delete check-in and associated audio.

    Args:
        check_in_id: UUID of the check-in to delete
        request: FastAPI request for auth extraction
    """
    user_id = get_user_id_from_request(request)

    client = get_supabase_client()
    if not client:
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "SERVICE_UNAVAILABLE",
                    "message": "Database service unavailable",
                }
            },
        )

    try:
        # Verify ownership and get audio path for cleanup
        existing = (
            client.table("check_ins")
            .select("id, user_id, audio_path")
            .eq("id", check_in_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )

        if not existing.data:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": {
                        "code": "NOT_FOUND",
                        "message": "Check-in not found",
                    }
                },
            )

        audio_path = existing.data.get("audio_path")

        # Delete from database first
        client.table("check_ins").delete().eq("id", check_in_id).eq(
            "user_id", user_id
        ).execute()

        # Delete audio from storage (non-blocking, best effort)
        if audio_path:
            try:
                client.storage.from_("voice-recordings").remove([audio_path])
                logger.info(f"Deleted audio file: {audio_path}")
            except Exception as e:
                logger.warning(f"Failed to delete audio file {audio_path}: {e}")
                # Don't fail the request if audio deletion fails

        # Note: Daily summary will be updated on next nightly regeneration
        logger.info(f"Deleted check-in {check_in_id} for user {user_id[:8]}...")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete check-in {check_in_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "DELETE_FAILED",
                    "message": "Failed to delete check-in",
                }
            },
        )
