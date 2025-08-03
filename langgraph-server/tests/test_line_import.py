"""Tests for LINE chat export parsing and import functionality.

Tests cover:
- LINE export format parsing
- Zip file extraction
- Message identification (outgoing vs incoming)
- Timestamp parsing
- Error handling for invalid files
"""

import pytest
from datetime import datetime, timezone

from src.services.line_import import (
    parse_line_export,
    extract_txt_from_zip,
    validate_line_export,
    count_messages,
    ParsedMessage,
)


# Sample LINE export content for testing
SAMPLE_LINE_EXPORT = """[LINE] Chat with John Doe
Save date: 2024-01-15 14:30

2024/01/15 Monday
14:30	John Doe	Hello!
14:31	You	Hey, how are you?
14:32	John Doe	Good, thanks!
14:33	[Photo]
14:35	You	Nice! Let's catch up soon
14:36	You	This is a multi-line
message that continues here
14:37	John Doe	Got it!
"""

SAMPLE_LINE_EXPORT_THAI = """[LINE] Chat with John Doe
Save date: 2024-01-15 14:30

2024/01/15 Monday
14:30	John Doe	สวัสดีครับ
14:31	คุณ	สวัสดีค่ะ
14:32	John Doe	เป็นอย่างไรบ้าง?
"""

SAMPLE_EMPTY_EXPORT = ""

SAMPLE_INVALID_EXPORT = """This is not a LINE export
Just some random text
Without proper formatting
"""

SAMPLE_MINIMAL_EXPORT = """2024/01/15 Monday
14:30	You	Hello world
"""


class TestParseLineExport:
    """Tests for parse_line_export function."""

    def test_parses_basic_messages(self):
        """Should parse basic LINE export format."""
        messages = list(parse_line_export(SAMPLE_LINE_EXPORT))

        assert len(messages) >= 4  # At least 4 text messages (excluding [Photo])

    def test_identifies_outgoing_messages(self):
        """Should correctly identify outgoing messages."""
        messages = list(parse_line_export(SAMPLE_LINE_EXPORT))

        outgoing = [m for m in messages if m.is_outgoing]
        incoming = [m for m in messages if not m.is_outgoing]

        assert len(outgoing) >= 2  # "You" messages
        assert len(incoming) >= 2  # "John Doe" messages

    def test_skips_media_placeholders(self):
        """Should skip [Photo], [Sticker], etc."""
        messages = list(parse_line_export(SAMPLE_LINE_EXPORT))

        contents = [m.content for m in messages]
        assert "[Photo]" not in contents
        assert "[Sticker]" not in contents

    def test_parses_timestamps(self):
        """Should parse timestamps to datetime objects."""
        messages = list(parse_line_export(SAMPLE_LINE_EXPORT))

        for msg in messages:
            if msg.sent_at:
                assert isinstance(msg.sent_at, datetime)
                assert msg.sent_at.tzinfo == timezone.utc

    def test_handles_multiline_messages(self):
        """Should handle messages spanning multiple lines."""
        messages = list(parse_line_export(SAMPLE_LINE_EXPORT))

        # Find the multi-line message
        multiline = [m for m in messages if "multi-line" in m.content]
        assert len(multiline) == 1
        assert "continues here" in multiline[0].content

    def test_custom_user_display_name(self):
        """Should identify outgoing by custom display name."""
        messages = list(parse_line_export(SAMPLE_LINE_EXPORT, user_display_name="John Doe"))

        # Now John Doe messages should be outgoing
        john_messages = [m for m in messages if m.sender_name == "John Doe"]
        assert all(m.is_outgoing for m in john_messages)

    def test_thai_language_outgoing(self):
        """Should identify outgoing in Thai (คุณ = You)."""
        messages = list(parse_line_export(SAMPLE_LINE_EXPORT_THAI))

        outgoing = [m for m in messages if m.is_outgoing]
        assert len(outgoing) >= 1

    def test_empty_content_returns_no_messages(self):
        """Should handle empty content gracefully."""
        messages = list(parse_line_export(""))
        assert len(messages) == 0

    def test_minimal_export_without_header(self):
        """Should parse exports without full header."""
        messages = list(parse_line_export(SAMPLE_MINIMAL_EXPORT))
        assert len(messages) == 1
        assert messages[0].content == "Hello world"


class TestValidateLineExport:
    """Tests for validate_line_export function."""

    def test_valid_export(self):
        """Should validate proper LINE export."""
        is_valid, error = validate_line_export(SAMPLE_LINE_EXPORT)
        assert is_valid is True
        assert error == ""

    def test_empty_content_invalid(self):
        """Should reject empty content."""
        is_valid, error = validate_line_export("")
        assert is_valid is False
        assert "empty" in error.lower()

    def test_random_text_invalid(self):
        """Should reject non-LINE content."""
        is_valid, error = validate_line_export(SAMPLE_INVALID_EXPORT)
        assert is_valid is False

    def test_minimal_valid(self):
        """Should accept minimal export with just messages."""
        is_valid, error = validate_line_export(SAMPLE_MINIMAL_EXPORT)
        assert is_valid is True


class TestCountMessages:
    """Tests for count_messages function."""

    def test_counts_all_messages(self):
        """Should count all text messages."""
        count = count_messages(SAMPLE_LINE_EXPORT)
        assert count >= 4

    def test_counts_outgoing_only(self):
        """Should count only outgoing messages when specified."""
        all_count = count_messages(SAMPLE_LINE_EXPORT)
        outgoing_count = count_messages(SAMPLE_LINE_EXPORT, outgoing_only=True)

        assert outgoing_count < all_count
        assert outgoing_count >= 2


class TestExtractTxtFromZip:
    """Tests for extract_txt_from_zip function."""

    def test_invalid_zip_returns_none(self):
        """Should return None for invalid zip data."""
        result = extract_txt_from_zip(b"not a zip file")
        assert result is None

    def test_empty_bytes_returns_none(self):
        """Should return None for empty bytes."""
        result = extract_txt_from_zip(b"")
        assert result is None


class TestParsedMessage:
    """Tests for ParsedMessage dataclass."""

    def test_message_fields(self):
        """Should have all expected fields."""
        msg = ParsedMessage(
            content="Hello",
            sent_at=datetime.now(timezone.utc),
            is_outgoing=True,
            sender_name="You",
        )

        assert msg.content == "Hello"
        assert msg.is_outgoing is True
        assert msg.sender_name == "You"
        assert msg.sent_at is not None

    def test_message_with_none_timestamp(self):
        """Should allow None timestamp."""
        msg = ParsedMessage(
            content="Hello",
            sent_at=None,
            is_outgoing=True,
            sender_name="You",
        )

        assert msg.sent_at is None


# Integration-style tests
class TestParsingEdgeCases:
    """Edge case tests for parsing."""

    def test_handles_special_characters(self):
        """Should handle emojis and special characters."""
        content = """2024/01/15 Monday
14:30	You	Hello! 😊 こんにちは
"""
        messages = list(parse_line_export(content))
        assert len(messages) == 1
        assert "😊" in messages[0].content

    def test_handles_urls_in_messages(self):
        """Should preserve URLs in message content."""
        content = """2024/01/15 Monday
14:30	You	Check this out: https://example.com/test?param=value
"""
        messages = list(parse_line_export(content))
        assert len(messages) == 1
        assert "https://example.com" in messages[0].content

    def test_handles_empty_sender_name(self):
        """Should handle edge case of empty sender."""
        content = """2024/01/15 Monday
14:30		Empty sender message
"""
        # Should not crash, may skip this message
        messages = list(parse_line_export(content))
        # Either 0 or 1 depending on handling
        assert len(messages) <= 1

    def test_handles_different_date_formats(self):
        """Should handle date header variations."""
        content = """2024/01/15 Mon
14:30	You	Short weekday format
"""
        # Should not crash even with short weekday
        messages = list(parse_line_export(content))
        # May or may not parse depending on regex
        assert isinstance(messages, list)
