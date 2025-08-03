"""Voice transcription and summary endpoints for Project-Me.

Endpoints:
- POST /voice/transcribe/{check_in_id} - Trigger transcription for a check-in
- GET /voice/status/{check_in_id} - Get transcription status, transcript, and summary

Background Processing:
- Uses FastAPI BackgroundTasks for async transcription and summarization
- Status flow: processing → transcribing → summarizing → completed
- Graceful degradation: If summarization fails, transcript is still available
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from src.api.deps import get_user_id_from_request
from src.api.schemas import CheckInStatusResponse, TranscribeResponse
from src.services.elevenlabs import (
    AudioDownloadError,
    TranscriptionError,
    is_elevenlabs_configured,
    transcribe_audio,
)
from src.services.supabase import get_supabase_client
from src.services.summarizer import (
    SummaryError,
    create_error_summary,
    generate_summary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice", tags=["voice"])


async def process_transcription(check_in_id: str, user_id: str) -> None:
    """Background task to process voice transcription and generate summary.

    Retrieves audio from Supabase Storage, transcribes with ElevenLabs,
    generates structured summary with Claude, and updates the check_in record.

    Status flow: transcribing → summarizing → completed
    Graceful degradation: If summarization fails, transcript is still available.

    Args:
        check_in_id: UUID of the check_in record
        user_id: UUID of the user (for logging)
    """
    client = get_supabase_client()
    if not client:
        logger.error(f"Supabase client not available for check_in {check_in_id}")
        return

    try:
        # Step 1: Update status to 'transcribing'
        client.table("check_ins").update(
            {
                "status": "transcribing",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", check_in_id).execute()

        logger.info(f"Starting transcription for check_in {check_in_id[:8]}...")

        # Step 2: Get check_in record with audio_path
        result = (
            client.table("check_ins")
            .select("audio_path, user_id")
            .eq("id", check_in_id)
            .single()
            .execute()
        )

        if not result.data:
            raise TranscriptionError(f"Check-in {check_in_id} not found")

        audio_path = result.data["audio_path"]

        # Step 3: Generate signed URL for audio file (valid 1 hour)
        signed_url_response = client.storage.from_("voice-recordings").create_signed_url(
            audio_path,
            3600,  # 1 hour expiry
        )

        if not signed_url_response or "signedURL" not in signed_url_response:
            raise TranscriptionError(f"Failed to generate signed URL for {audio_path}")

        signed_url = signed_url_response["signedURL"]

        # Step 4: Transcribe audio with ElevenLabs
        transcript = await transcribe_audio(signed_url)

        logger.info(
            f"Transcription complete for check_in {check_in_id[:8]}: "
            f"{len(transcript)} chars"
        )

        # Step 5: Update status to 'summarizing' and store transcript
        client.table("check_ins").update(
            {
                "transcript": transcript,
                "status": "summarizing",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", check_in_id).execute()

        logger.info(f"Generating summary for check_in {check_in_id[:8]}...")

        # Step 6: Generate structured summary (with graceful degradation)
        summary_data = None
        try:
            summary = await generate_summary(transcript)
            summary_data = summary

            # Step 7: Update with summary and mark completed
            client.table("check_ins").update(
                {
                    "summary": summary,
                    "status": "completed",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", check_in_id).execute()

            logger.info(f"Summary complete for check_in {check_in_id[:8]}")

        except (SummaryError, Exception) as summary_error:
            # Graceful degradation: transcript available, summary not
            logger.warning(
                f"Summary generation failed for check_in {check_in_id}: {summary_error}"
            )
            client.table("check_ins").update(
                {
                    "summary": create_error_summary(),
                    "status": "completed",  # Still mark as completed
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", check_in_id).execute()

            logger.info(
                f"Check-in {check_in_id[:8]} completed with transcript only "
                f"(summary unavailable)"
            )

        # Note: Check-in will be included in nightly daily_summary generation

    except (TranscriptionError, AudioDownloadError) as e:
        logger.error(f"Transcription failed for check_in {check_in_id}: {e}")
        _mark_check_in_failed(client, check_in_id, str(e))

    except Exception as e:
        logger.error(f"Unexpected error transcribing check_in {check_in_id}: {e}")
        _mark_check_in_failed(client, check_in_id, f"Unexpected error: {e}")


def _mark_check_in_failed(client: Any, check_in_id: str, error_message: str) -> None:
    """Mark a check_in as failed with error message.

    Args:
        client: Supabase client
        check_in_id: UUID of the check_in record
        error_message: Error description to store
    """
    try:
        client.table("check_ins").update(
            {
                "status": "failed",
                "error_message": error_message,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", check_in_id).execute()
    except Exception as e:
        logger.error(f"Failed to update check_in {check_in_id} status to failed: {e}")


@router.post("/transcribe/{check_in_id}", response_model=TranscribeResponse)
async def trigger_transcription(
    check_in_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
) -> TranscribeResponse:
    """Trigger transcription for a check-in.

    Validates ownership, checks status, and queues background transcription.

    Args:
        check_in_id: UUID of the check_in to transcribe
        request: FastAPI request (for auth)
        background_tasks: FastAPI background tasks handler

    Returns:
        TranscribeResponse with status

    Raises:
        HTTPException: If check-in not found, wrong status, or auth fails
    """
    user_id = get_user_id_from_request(request)

    # Check ElevenLabs configuration
    if not is_elevenlabs_configured():
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "SERVICE_UNAVAILABLE",
                    "message": "Transcription service is not configured.",
                }
            },
        )

    client = get_supabase_client()
    if not client:
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "DATABASE_UNAVAILABLE",
                    "message": "Database service is not available.",
                }
            },
        )

    # Verify check-in exists and belongs to user
    try:
        result = (
            client.table("check_ins")
            .select("id, user_id, status")
            .eq("id", check_in_id)
            .single()
            .execute()
        )
    except Exception as e:
        if "No rows" in str(e) or "PGRST116" in str(e):
            raise HTTPException(
                status_code=404,
                detail={
                    "error": {
                        "code": "NOT_FOUND",
                        "message": "Check-in not found.",
                    }
                },
            )
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "DATABASE_ERROR",
                    "message": "Failed to retrieve check-in.",
                }
            },
        )

    check_in = result.data

    # Verify ownership
    if check_in["user_id"] != user_id:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "NOT_FOUND",
                    "message": "Check-in not found.",
                }
            },
        )

    # Verify status is 'processing' (ready for transcription)
    current_status = check_in["status"]
    if current_status != "processing":
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "INVALID_STATUS",
                    "message": f"Check-in status is '{current_status}', expected 'processing'.",
                }
            },
        )

    # Queue background transcription
    background_tasks.add_task(process_transcription, check_in_id, user_id)

    logger.info(f"Queued transcription for check_in {check_in_id[:8]}...")

    return TranscribeResponse(
        status="queued",
        check_in_id=check_in_id,
        message="Transcription started. Poll /voice/status/{check_in_id} for progress.",
    )


@router.get("/status/{check_in_id}", response_model=CheckInStatusResponse)
async def get_check_in_status(
    check_in_id: str,
    request: Request,
) -> CheckInStatusResponse:
    """Get transcription status, transcript, and summary if complete.

    Args:
        check_in_id: UUID of the check_in
        request: FastAPI request (for auth)

    Returns:
        CheckInStatusResponse with status, transcript, and summary

    Raises:
        HTTPException: If check-in not found or auth fails
    """
    user_id = get_user_id_from_request(request)

    client = get_supabase_client()
    if not client:
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "DATABASE_UNAVAILABLE",
                    "message": "Database service is not available.",
                }
            },
        )

    # Get check-in with user ownership check
    try:
        result = (
            client.table("check_ins")
            .select("id, status, transcript, summary, error_message, created_at, updated_at")
            .eq("id", check_in_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
    except Exception as e:
        if "No rows" in str(e) or "PGRST116" in str(e):
            raise HTTPException(
                status_code=404,
                detail={
                    "error": {
                        "code": "NOT_FOUND",
                        "message": "Check-in not found.",
                    }
                },
            )
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "DATABASE_ERROR",
                    "message": "Failed to retrieve check-in status.",
                }
            },
        )

    check_in = result.data

    return CheckInStatusResponse(
        id=check_in["id"],
        status=check_in["status"],
        transcript=check_in.get("transcript"),
        summary=check_in.get("summary"),
        error_message=check_in.get("error_message"),
        created_at=check_in["created_at"],
        updated_at=check_in["updated_at"],
    )
