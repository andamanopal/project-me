"""LINE chat export parser for Project-Me.

Parses LINE chat export files (txt format) to extract messages for
personality extraction and memory storage.

LINE export format example:
```
[LINE] Chat with John Doe
Save date: 2024-01-15 14:30

2024/01/15 Monday
14:30	John Doe	Hello!
14:31	You	Hey, how are you?
14:32	John Doe	Good, thanks!
14:33	[Photo]
14:35	You	Nice! Let's catch up soon
```
"""

import io
import re
import zipfile
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Generator

logger = logging.getLogger(__name__)

# Regex patterns for LINE export parsing
DATE_HEADER_PATTERN = re.compile(r"^(\d{4}/\d{2}/\d{2})\s+\w+$")
MESSAGE_PATTERN = re.compile(r"^(\d{1,2}:\d{2})\t(.+?)\t(.*)$")
MEDIA_PLACEHOLDERS = {"[Photo]", "[Sticker]", "[File]", "[Video]", "[Audio]", "[Voice message]"}

# Privacy: truncate IDs in logs
LOG_ID_TRUNCATE_LENGTH = 10


@dataclass
class ParsedMessage:
    """Represents a parsed message from LINE export."""

    content: str
    sent_at: datetime | None
    is_outgoing: bool
    sender_name: str | None


def extract_txt_from_zip(zip_bytes: bytes) -> str | None:
    """Extract .txt file content from a LINE export zip.

    Args:
        zip_bytes: Raw bytes of the zip file

    Returns:
        Content of the first .txt file found, or None if not found
    """
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for name in zf.namelist():
                if name.endswith(".txt"):
                    return zf.read(name).decode("utf-8", errors="replace")
        logger.warning("No .txt file found in zip")
        return None
    except zipfile.BadZipFile:
        logger.error("Invalid zip file")
        return None
    except Exception as e:
        logger.error(f"Error extracting zip: {e}")
        return None


def parse_line_export(
    content: str,
    user_display_name: str | None = None,
    outgoing_indicators: list[str] | None = None,
) -> Generator[ParsedMessage, None, None]:
    """Parse LINE chat export text format.

    Args:
        content: Raw text content of LINE export file
        user_display_name: User's display name to identify outgoing messages
        outgoing_indicators: List of names that indicate outgoing messages
            (default: ["You", "คุณ"] for English and Thai)

    Yields:
        ParsedMessage objects for each valid text message
    """
    if outgoing_indicators is None:
        outgoing_indicators = ["You", "คุณ"]  # English and Thai defaults

    if user_display_name:
        outgoing_indicators.append(user_display_name)

    current_date: str | None = None
    lines = content.splitlines()
    i = 0

    while i < len(lines):
        line = lines[i].strip()

        # Skip empty lines and header lines
        if not line or line.startswith("[LINE]") or line.startswith("Save date:"):
            i += 1
            continue

        # Check for date header (e.g., "2024/01/15 Monday")
        date_match = DATE_HEADER_PATTERN.match(line)
        if date_match:
            current_date = date_match.group(1)
            i += 1
            continue

        # Check for message (e.g., "14:30\tJohn Doe\tHello!")
        msg_match = MESSAGE_PATTERN.match(line)
        if msg_match:
            time_str = msg_match.group(1)
            sender = msg_match.group(2)
            message = msg_match.group(3)

            # Collect continuation lines (messages spanning multiple lines)
            i += 1
            while i < len(lines):
                next_line = lines[i]
                # If next line starts with time pattern or is date header, stop
                if MESSAGE_PATTERN.match(next_line.strip()) or DATE_HEADER_PATTERN.match(next_line.strip()):
                    break
                # If empty or header line, stop
                if not next_line.strip() or next_line.strip().startswith("[LINE]"):
                    break
                # Append continuation
                message += "\n" + next_line
                i += 1

            # Skip media placeholders
            message_stripped = message.strip()
            if message_stripped in MEDIA_PLACEHOLDERS:
                continue

            # Skip system messages that look like placeholders
            if message_stripped.startswith("[") and message_stripped.endswith("]"):
                continue

            # Parse timestamp
            sent_at = _parse_timestamp(current_date, time_str)

            # Determine if outgoing
            is_outgoing = sender in outgoing_indicators

            yield ParsedMessage(
                content=message_stripped,
                sent_at=sent_at,
                is_outgoing=is_outgoing,
                sender_name=sender,
            )
        else:
            i += 1


def _parse_timestamp(date_str: str | None, time_str: str) -> datetime | None:
    """Parse date and time strings to datetime.

    Args:
        date_str: Date string in YYYY/MM/DD format
        time_str: Time string in HH:MM format

    Returns:
        datetime object or None if parsing fails
    """
    if not date_str:
        return None

    try:
        # Parse YYYY/MM/DD HH:MM format
        dt_str = f"{date_str} {time_str}"
        # Assume local time, we'll store as-is since LINE exports don't include timezone
        dt = datetime.strptime(dt_str, "%Y/%m/%d %H:%M")
        # Return as UTC (LINE doesn't provide timezone info)
        return dt.replace(tzinfo=timezone.utc)
    except ValueError:
        logger.debug(f"Could not parse timestamp: {date_str} {time_str}")
        return None


def count_messages(content: str, outgoing_only: bool = False) -> int:
    """Count messages in LINE export without fully parsing.

    Args:
        content: Raw text content of LINE export file
        outgoing_only: If True, only count outgoing messages

    Returns:
        Total message count
    """
    count = 0
    for msg in parse_line_export(content):
        if not outgoing_only or msg.is_outgoing:
            count += 1
    return count


def validate_line_export(content: str) -> tuple[bool, str]:
    """Validate if content is a valid LINE export.

    Args:
        content: Raw text content to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not content or len(content.strip()) < 10:
        return False, "File is empty or too short"

    lines = content.splitlines()

    # Check for LINE header
    has_header = any(
        line.strip().startswith("[LINE]") or line.strip().startswith("Save date:")
        for line in lines[:10]
    )

    # Check for at least one date header
    has_date = any(DATE_HEADER_PATTERN.match(line.strip()) for line in lines)

    # Check for at least one message
    has_message = any(MESSAGE_PATTERN.match(line.strip()) for line in lines)

    if not has_date and not has_message:
        return False, "No valid LINE chat messages found"

    if not has_header:
        logger.debug("LINE header not found, but messages detected")

    return True, ""
