"""Summary generation service for voice check-ins in Project-Me.

This module provides functions for:
- Extracting structured information from transcripts using Claude
- Identifying events, emotions, goals, and concerns
- Automatic retry with exponential backoff
- Thai language support

Uses Claude 3.5 Haiku for cost-effective extraction (~$0.001 per summary).
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, TypedDict

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
import httpx
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

load_dotenv()

logger = logging.getLogger(__name__)

# Configuration
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
MIN_TRANSCRIPT_WORDS = 10  # Minimum words for meaningful extraction
LLM_TIMEOUT = 10.0  # 10 seconds max for LLM response (AC5 requirement)


class SummaryResult(TypedDict):
    """Structured summary of a voice check-in transcript."""

    events: list[str]
    emotions: list[dict[str, str]]
    goals: list[str]
    concerns: list[str]
    generated_at: str


class SummaryError(Exception):
    """Error during summary generation."""

    pass


EXTRACTION_PROMPT = """You are analyzing a voice check-in transcript. Extract structured information.

Transcript:
{transcript}

Extract the following (only include if mentioned, leave empty arrays if not applicable):
1. **Events**: What happened or was done (bullet points)
2. **Emotions**: How the person felt, with context
3. **Goals**: What they want to achieve or do
4. **Concerns**: Worries, problems, or stressors mentioned

Respond in JSON format ONLY (no markdown code blocks):
{{
  "events": ["event 1", "event 2"],
  "emotions": [{{"emotion": "happy", "context": "about the meeting"}}],
  "goals": ["goal 1"],
  "concerns": ["concern 1"]
}}

If the transcript is very short or doesn't contain clear information for a category,
use an empty array []. Do NOT invent or assume content not in the transcript.
Preserve the original language of the transcript (Thai or English) in your extraction."""


def _parse_llm_response(content: str) -> dict[str, Any]:
    """Parse LLM response, handling potential markdown code blocks.

    Args:
        content: Raw LLM response text

    Returns:
        Parsed JSON dictionary

    Raises:
        ValueError: If response cannot be parsed as JSON
    """
    # Strip whitespace
    content = content.strip()

    # Handle markdown code blocks
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0]
    elif "```" in content:
        # Try to extract from generic code block
        parts = content.split("```")
        if len(parts) >= 2:
            content = parts[1]
            # Remove potential language identifier on first line
            lines = content.strip().split("\n")
            if lines and not lines[0].startswith("{"):
                content = "\n".join(lines[1:])

    content = content.strip()

    # Parse JSON
    return json.loads(content)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=4),
    retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
async def generate_summary(transcript: str) -> SummaryResult:
    """Generate structured summary from transcript using Claude.

    Extracts events, emotions, goals, and concerns from a voice check-in
    transcript. Uses Claude 3.5 Haiku for cost-effective extraction.

    Args:
        transcript: Voice check-in transcript text

    Returns:
        SummaryResult with events, emotions, goals, concerns, and timestamp

    Raises:
        SummaryError: If LLM fails after all retries
        ValueError: If ANTHROPIC_API_KEY is not set
    """
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY environment variable not set")

    # Handle very short transcripts
    word_count = len(transcript.split())
    if word_count < MIN_TRANSCRIPT_WORDS:
        logger.info(f"Short transcript ({word_count} words), creating minimal summary")
        return SummaryResult(
            events=[],
            emotions=[],
            goals=[],
            concerns=[],
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    logger.info(f"Generating summary for {word_count} word transcript")

    try:
        llm = ChatAnthropic(
            model="claude-3-5-haiku-latest",
            api_key=ANTHROPIC_API_KEY,
            max_tokens=1024,
            temperature=0,  # Deterministic extraction
            timeout=LLM_TIMEOUT,
        )

        prompt = ChatPromptTemplate.from_template(EXTRACTION_PROMPT)
        chain = prompt | llm

        response = await chain.ainvoke({"transcript": transcript})

        # Parse response
        result = _parse_llm_response(response.content)

        summary = SummaryResult(
            events=result.get("events", []),
            emotions=result.get("emotions", []),
            goals=result.get("goals", []),
            concerns=result.get("concerns", []),
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

        logger.info(
            f"Summary generated: {len(summary['events'])} events, "
            f"{len(summary['emotions'])} emotions, "
            f"{len(summary['goals'])} goals, "
            f"{len(summary['concerns'])} concerns"
        )

        return summary

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response as JSON: {e}")
        raise SummaryError(f"Invalid LLM response format: {e}") from e
    except Exception as e:
        logger.error(f"Summary generation failed: {e}")
        raise SummaryError(f"Summary generation failed: {e}") from e


def is_summarizer_configured() -> bool:
    """Check if summarizer is properly configured.

    Returns:
        True if ANTHROPIC_API_KEY is set, False otherwise
    """
    return bool(ANTHROPIC_API_KEY)


def create_error_summary() -> dict[str, str]:
    """Create error summary object for graceful degradation.

    Returns:
        Dictionary with error message for storage in summary field
    """
    return {"error": "Summary unavailable"}
