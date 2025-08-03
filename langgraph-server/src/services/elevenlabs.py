"""ElevenLabs Scribe service for voice transcription in Project-Me.

This module provides functions for:
- Transcribing audio files using ElevenLabs Scribe API
- Automatic retry with exponential backoff
- Thai language support (auto-detected)

API Reference: https://elevenlabs.io/docs/api-reference/audio-to-text
"""

import os
import logging
from typing import Optional

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ElevenLabs configuration
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
SCRIBE_API_URL = "https://api.elevenlabs.io/v1/speech-to-text"

# Timeout configuration
DOWNLOAD_TIMEOUT = 60.0  # 60s for downloading audio from Supabase
TRANSCRIPTION_TIMEOUT = 120.0  # 120s for ElevenLabs API (longer recordings)


class TranscriptionError(Exception):
    """Error during audio transcription."""

    pass


class AudioDownloadError(Exception):
    """Error downloading audio from storage."""

    pass


def _get_content_type_from_extension(audio_url: str) -> str:
    """Determine content type from URL extension.

    Args:
        audio_url: URL to audio file

    Returns:
        MIME type string
    """
    url_lower = audio_url.lower().split("?")[0]  # Remove query params
    if url_lower.endswith(".webm"):
        return "audio/webm"
    elif url_lower.endswith(".mp4") or url_lower.endswith(".m4a"):
        return "audio/mp4"
    elif url_lower.endswith(".ogg"):
        return "audio/ogg"
    elif url_lower.endswith(".wav"):
        return "audio/wav"
    elif url_lower.endswith(".mp3"):
        return "audio/mpeg"
    else:
        return "audio/webm"  # Default


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=4),
    retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
    before_sleep=before_sleep_log(logger, logging.WARNING),
)
async def transcribe_audio(audio_url: str) -> str:
    """Transcribe audio using ElevenLabs Scribe API.

    Downloads audio from signed URL and sends to ElevenLabs for transcription.
    Supports automatic language detection including Thai.

    Args:
        audio_url: Signed URL to audio file in Supabase Storage

    Returns:
        Transcribed text

    Raises:
        TranscriptionError: If transcription fails after all retries
        AudioDownloadError: If audio file cannot be downloaded
    """
    if not ELEVENLABS_API_KEY:
        raise TranscriptionError("ELEVENLABS_API_KEY environment variable not set")

    logger.info(f"Starting transcription for audio: {audio_url[:50]}...")

    async with httpx.AsyncClient() as client:
        # Step 1: Download audio from Supabase Storage
        try:
            audio_response = await client.get(
                audio_url,
                timeout=DOWNLOAD_TIMEOUT,
                follow_redirects=True,
            )
            audio_response.raise_for_status()
            audio_data = audio_response.content
            logger.info(f"Downloaded audio: {len(audio_data)} bytes")
        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to download audio: HTTP {e.response.status_code}")
            raise AudioDownloadError(f"Failed to download audio: {e}")
        except httpx.TimeoutException:
            logger.error("Timeout downloading audio")
            raise AudioDownloadError("Timeout downloading audio file")

        # Step 2: Determine content type
        content_type = _get_content_type_from_extension(audio_url)

        # Step 3: Send to ElevenLabs Scribe API
        try:
            response = await client.post(
                SCRIBE_API_URL,
                headers={
                    "xi-api-key": ELEVENLABS_API_KEY,
                },
                files={
                    "file": ("recording", audio_data, content_type),
                },
                data={
                    "model_id": "scribe_v1",  # ElevenLabs Scribe model
                },
                timeout=TRANSCRIPTION_TIMEOUT,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            error_detail = ""
            try:
                error_detail = e.response.text
            except Exception:
                pass
            logger.error(
                f"ElevenLabs API error: HTTP {e.response.status_code} - {error_detail}"
            )
            raise TranscriptionError(
                f"ElevenLabs API error: {e.response.status_code}"
            )
        except httpx.TimeoutException:
            logger.error("Timeout waiting for ElevenLabs transcription")
            raise TranscriptionError("Transcription timeout")

        # Step 4: Parse response
        result = response.json()
        transcript = result.get("text", "")

        if not transcript:
            logger.warning("Empty transcript returned from ElevenLabs")

        logger.info(
            f"Transcription complete: {len(transcript)} chars, "
            f"language detected: {result.get('language_code', 'unknown')}"
        )

        return transcript


async def transcribe_audio_bytes(
    audio_data: bytes,
    content_type: str = "audio/webm",
    filename: str = "recording.webm",
) -> str:
    """Transcribe audio from bytes directly.

    Alternative method that accepts raw audio bytes instead of URL.
    Useful for testing or when audio is already in memory.

    Args:
        audio_data: Raw audio bytes
        content_type: MIME type of the audio
        filename: Filename for the audio (used in multipart upload)

    Returns:
        Transcribed text

    Raises:
        TranscriptionError: If transcription fails
    """
    if not ELEVENLABS_API_KEY:
        raise TranscriptionError("ELEVENLABS_API_KEY environment variable not set")

    logger.info(f"Transcribing {len(audio_data)} bytes of audio")

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                SCRIBE_API_URL,
                headers={
                    "xi-api-key": ELEVENLABS_API_KEY,
                },
                files={
                    "file": (filename, audio_data, content_type),
                },
                data={
                    "model_id": "scribe_v1",
                },
                timeout=TRANSCRIPTION_TIMEOUT,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.error(f"ElevenLabs API error: HTTP {e.response.status_code}")
            raise TranscriptionError(
                f"ElevenLabs API error: {e.response.status_code}"
            )
        except httpx.TimeoutException:
            logger.error("Timeout waiting for ElevenLabs transcription")
            raise TranscriptionError("Transcription timeout")

        result = response.json()
        transcript = result.get("text", "")

        logger.info(f"Transcription complete: {len(transcript)} chars")
        return transcript


def is_elevenlabs_configured() -> bool:
    """Check if ElevenLabs API is properly configured.

    Returns:
        True if API key is set, False otherwise
    """
    return bool(ELEVENLABS_API_KEY)
