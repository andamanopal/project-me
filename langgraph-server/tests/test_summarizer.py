"""Tests for summary generation service.

Test coverage:
- Summary extraction with sample transcripts
- Short transcript handling (< 10 words)
- LLM failure graceful degradation
- Thai language transcript summarization
- JSON parsing edge cases
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

import sys
from pathlib import Path

# Add parent to path for imports
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))

from src.services.summarizer import (
    generate_summary,
    is_summarizer_configured,
    create_error_summary,
    SummaryError,
    SummaryResult,
    _parse_llm_response,
    LLM_TIMEOUT,
)


class TestSummarizerConfiguration:
    """Tests for summarizer configuration."""

    def test_is_summarizer_configured_returns_true_when_key_set(self):
        """Should return True when ANTHROPIC_API_KEY is set."""
        with patch("src.services.summarizer.ANTHROPIC_API_KEY", "test-key"):
            # Need to re-evaluate the module-level check
            with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
                assert is_summarizer_configured() is True

    def test_is_summarizer_configured_returns_false_when_key_missing(self):
        """Should return False when ANTHROPIC_API_KEY is not set."""
        with patch("src.services.summarizer.ANTHROPIC_API_KEY", ""):
            assert is_summarizer_configured() is False

    def test_is_summarizer_configured_returns_false_when_key_none(self):
        """Should return False when ANTHROPIC_API_KEY is None."""
        with patch("src.services.summarizer.ANTHROPIC_API_KEY", None):
            assert is_summarizer_configured() is False


class TestErrorSummary:
    """Tests for error summary creation."""

    def test_create_error_summary_returns_error_dict(self):
        """Should return dictionary with error message."""
        result = create_error_summary()
        assert isinstance(result, dict)
        assert "error" in result
        assert result["error"] == "Summary unavailable"


class TestParseLLMResponse:
    """Tests for LLM response parsing."""

    def test_parse_valid_json(self):
        """Should parse valid JSON directly."""
        content = '{"events": ["event1"], "emotions": [], "goals": [], "concerns": []}'
        result = _parse_llm_response(content)
        assert result["events"] == ["event1"]

    def test_parse_json_with_markdown_code_block(self):
        """Should handle markdown json code blocks."""
        content = """```json
{"events": ["event1"], "emotions": [], "goals": [], "concerns": []}
```"""
        result = _parse_llm_response(content)
        assert result["events"] == ["event1"]

    def test_parse_json_with_generic_code_block(self):
        """Should handle generic code blocks."""
        content = """```
{"events": ["meeting"], "emotions": [], "goals": [], "concerns": []}
```"""
        result = _parse_llm_response(content)
        assert result["events"] == ["meeting"]

    def test_parse_json_with_whitespace(self):
        """Should handle leading/trailing whitespace."""
        content = """
{"events": [], "emotions": [], "goals": ["learn python"], "concerns": []}
   """
        result = _parse_llm_response(content)
        assert result["goals"] == ["learn python"]

    def test_parse_invalid_json_raises_error(self):
        """Should raise ValueError for invalid JSON."""
        content = "not valid json at all"
        with pytest.raises(json.JSONDecodeError):
            _parse_llm_response(content)


class TestGenerateSummaryShortTranscript:
    """Tests for short transcript handling."""

    @pytest.mark.asyncio
    async def test_short_transcript_returns_empty_summary(self):
        """Should return empty summary for short transcripts (<10 words)."""
        with patch("src.services.summarizer.ANTHROPIC_API_KEY", "test-key"):
            result = await generate_summary("Hello world")

        assert result["events"] == []
        assert result["emotions"] == []
        assert result["goals"] == []
        assert result["concerns"] == []
        assert "generated_at" in result

    @pytest.mark.asyncio
    async def test_very_short_transcript_skips_llm(self):
        """Should not call LLM for very short transcripts."""
        with patch("src.services.summarizer.ANTHROPIC_API_KEY", "test-key"):
            with patch("src.services.summarizer.ChatAnthropic") as mock_llm:
                result = await generate_summary("Hi")
                # LLM should not be instantiated
                mock_llm.assert_not_called()

    @pytest.mark.asyncio
    async def test_nine_word_transcript_is_short(self):
        """Should treat 9-word transcript as short."""
        transcript = "one two three four five six seven eight nine"
        with patch("src.services.summarizer.ANTHROPIC_API_KEY", "test-key"):
            result = await generate_summary(transcript)

        assert result["events"] == []
        assert "generated_at" in result


class TestGenerateSummaryWithLLM:
    """Tests for LLM-based summary generation."""

    @pytest.fixture
    def mock_llm_response(self):
        """Create a mock LLM response."""
        mock_response = MagicMock()
        mock_response.content = json.dumps({
            "events": ["Had a meeting with the team"],
            "emotions": [{"emotion": "happy", "context": "project going well"}],
            "goals": ["Finish the report by Friday"],
            "concerns": ["Tight deadline"],
        })
        return mock_response

    @pytest.mark.asyncio
    async def test_generate_summary_extracts_events(self, mock_llm_response):
        """Should extract events from transcript."""
        with patch("src.services.summarizer.ANTHROPIC_API_KEY", "test-key"):
            with patch("src.services.summarizer.ChatAnthropic") as MockLLM:
                with patch("src.services.summarizer.ChatPromptTemplate") as MockPrompt:
                    # Create chain mock that returns our response
                    mock_chain = AsyncMock()
                    mock_chain.ainvoke.return_value = mock_llm_response
                    MockPrompt.from_template.return_value.__or__ = MagicMock(
                        return_value=mock_chain
                    )

                    transcript = (
                        "Today I had a meeting with the team. "
                        "We discussed the project progress and milestones."
                    )
                    result = await generate_summary(transcript)

        assert len(result["events"]) > 0
        assert result["events"][0] == "Had a meeting with the team"

    @pytest.mark.asyncio
    async def test_generate_summary_extracts_emotions(self, mock_llm_response):
        """Should extract emotions with context."""
        with patch("src.services.summarizer.ANTHROPIC_API_KEY", "test-key"):
            with patch("src.services.summarizer.ChatAnthropic") as MockLLM:
                with patch("src.services.summarizer.ChatPromptTemplate") as MockPrompt:
                    mock_chain = AsyncMock()
                    mock_chain.ainvoke.return_value = mock_llm_response
                    MockPrompt.from_template.return_value.__or__ = MagicMock(
                        return_value=mock_chain
                    )

                    transcript = (
                        "I am feeling really happy today because the project is going well. "
                        "The team has been working hard."
                    )
                    result = await generate_summary(transcript)

        assert len(result["emotions"]) > 0
        assert result["emotions"][0]["emotion"] == "happy"
        assert "context" in result["emotions"][0]

    @pytest.mark.asyncio
    async def test_generate_summary_extracts_goals(self, mock_llm_response):
        """Should extract goals from transcript."""
        with patch("src.services.summarizer.ANTHROPIC_API_KEY", "test-key"):
            with patch("src.services.summarizer.ChatAnthropic") as MockLLM:
                with patch("src.services.summarizer.ChatPromptTemplate") as MockPrompt:
                    mock_chain = AsyncMock()
                    mock_chain.ainvoke.return_value = mock_llm_response
                    MockPrompt.from_template.return_value.__or__ = MagicMock(
                        return_value=mock_chain
                    )

                    transcript = (
                        "My goal is to finish the report by Friday. "
                        "I need to work on the introduction and conclusion."
                    )
                    result = await generate_summary(transcript)

        assert len(result["goals"]) > 0
        assert "Finish the report" in result["goals"][0]

    @pytest.mark.asyncio
    async def test_generate_summary_extracts_concerns(self, mock_llm_response):
        """Should extract concerns from transcript."""
        with patch("src.services.summarizer.ANTHROPIC_API_KEY", "test-key"):
            with patch("src.services.summarizer.ChatAnthropic") as MockLLM:
                with patch("src.services.summarizer.ChatPromptTemplate") as MockPrompt:
                    mock_chain = AsyncMock()
                    mock_chain.ainvoke.return_value = mock_llm_response
                    MockPrompt.from_template.return_value.__or__ = MagicMock(
                        return_value=mock_chain
                    )

                    transcript = (
                        "I am worried about the tight deadline for this project. "
                        "We might not have enough time to test properly."
                    )
                    result = await generate_summary(transcript)

        assert len(result["concerns"]) > 0
        assert "deadline" in result["concerns"][0].lower()

    @pytest.mark.asyncio
    async def test_generate_summary_includes_timestamp(self, mock_llm_response):
        """Should include generated_at timestamp."""
        with patch("src.services.summarizer.ANTHROPIC_API_KEY", "test-key"):
            with patch("src.services.summarizer.ChatAnthropic") as MockLLM:
                with patch("src.services.summarizer.ChatPromptTemplate") as MockPrompt:
                    mock_chain = AsyncMock()
                    mock_chain.ainvoke.return_value = mock_llm_response
                    MockPrompt.from_template.return_value.__or__ = MagicMock(
                        return_value=mock_chain
                    )

                    transcript = (
                        "This is a test transcript with more than ten words "
                        "to ensure the LLM is called."
                    )
                    result = await generate_summary(transcript)

        assert "generated_at" in result
        # Verify it's a valid ISO timestamp
        datetime.fromisoformat(result["generated_at"].replace("Z", "+00:00"))


class TestGenerateSummaryThaiLanguage:
    """Tests for Thai language transcript summarization."""

    @pytest.fixture
    def mock_thai_llm_response(self):
        """Create a mock LLM response for Thai content."""
        mock_response = MagicMock()
        mock_response.content = json.dumps({
            "events": ["ประชุมกับทีม"],
            "emotions": [{"emotion": "มีความสุข", "context": "โปรเจคไปได้ดี"}],
            "goals": ["เสร็จรายงานภายในวันศุกร์"],
            "concerns": ["กังวลเรื่องเวลา"],
        }, ensure_ascii=False)
        return mock_response

    @pytest.mark.asyncio
    async def test_thai_transcript_preserves_language(self, mock_thai_llm_response):
        """Should preserve Thai language in extraction."""
        with patch("src.services.summarizer.ANTHROPIC_API_KEY", "test-key"):
            with patch("src.services.summarizer.ChatAnthropic") as MockLLM:
                with patch("src.services.summarizer.ChatPromptTemplate") as MockPrompt:
                    mock_chain = AsyncMock()
                    mock_chain.ainvoke.return_value = mock_thai_llm_response
                    MockPrompt.from_template.return_value.__or__ = MagicMock(
                        return_value=mock_chain
                    )

                    # Thai transcript with >= 10 words (Thai uses spaces between phrases)
                    # We add English words to ensure word count passes the threshold
                    transcript = (
                        "วันนี้ ผม มี ประชุม กับ ทีม เรา คุยกัน เรื่อง โปรเจค "
                        "ผม รู้สึก มีความสุข มาก ที่ โปรเจค ไปได้ดี"
                    )
                    result = await generate_summary(transcript)

        # Should have Thai content
        assert len(result["events"]) > 0
        assert "ประชุม" in result["events"][0]


class TestGenerateSummaryErrors:
    """Tests for error handling in summary generation."""

    @pytest.mark.asyncio
    async def test_missing_api_key_raises_error(self):
        """Should raise ValueError when API key is missing."""
        with patch("src.services.summarizer.ANTHROPIC_API_KEY", None):
            with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
                await generate_summary(
                    "This is a test transcript with more than ten words included."
                )

    @pytest.mark.asyncio
    async def test_llm_failure_raises_summary_error(self):
        """Should raise SummaryError when LLM fails."""
        with patch("src.services.summarizer.ANTHROPIC_API_KEY", "test-key"):
            with patch("src.services.summarizer.ChatAnthropic") as MockLLM:
                with patch("src.services.summarizer.ChatPromptTemplate") as MockPrompt:
                    mock_chain = AsyncMock()
                    mock_chain.ainvoke.side_effect = Exception("LLM API error")
                    MockPrompt.from_template.return_value.__or__ = MagicMock(
                        return_value=mock_chain
                    )

                    with pytest.raises(SummaryError):
                        await generate_summary(
                            "This is a test transcript with more than ten words here."
                        )

    @pytest.mark.asyncio
    async def test_invalid_json_response_raises_summary_error(self):
        """Should raise SummaryError when LLM returns invalid JSON."""
        mock_response = MagicMock()
        mock_response.content = "This is not valid JSON at all"

        with patch("src.services.summarizer.ANTHROPIC_API_KEY", "test-key"):
            with patch("src.services.summarizer.ChatAnthropic") as MockLLM:
                with patch("src.services.summarizer.ChatPromptTemplate") as MockPrompt:
                    mock_chain = AsyncMock()
                    mock_chain.ainvoke.return_value = mock_response
                    MockPrompt.from_template.return_value.__or__ = MagicMock(
                        return_value=mock_chain
                    )

                    with pytest.raises(SummaryError, match="Invalid LLM response"):
                        await generate_summary(
                            "This is a test transcript with more than ten words inside."
                        )


class TestSummaryResultType:
    """Tests for SummaryResult type structure."""

    def test_summary_result_has_required_fields(self):
        """SummaryResult should have all required fields."""
        # Check the TypedDict has the expected keys
        assert "events" in SummaryResult.__annotations__
        assert "emotions" in SummaryResult.__annotations__
        assert "goals" in SummaryResult.__annotations__
        assert "concerns" in SummaryResult.__annotations__
        assert "generated_at" in SummaryResult.__annotations__

    def test_summary_result_field_types(self):
        """SummaryResult fields should have correct types."""
        annotations = SummaryResult.__annotations__
        assert annotations["events"] == list[str]
        assert annotations["goals"] == list[str]
        assert annotations["concerns"] == list[str]
        assert annotations["generated_at"] == str


class TestExceptionClasses:
    """Tests for custom exception classes."""

    def test_summary_error_is_exception(self):
        """SummaryError should be an Exception subclass."""
        assert issubclass(SummaryError, Exception)

    def test_summary_error_can_be_raised(self):
        """SummaryError should be raisable with message."""
        with pytest.raises(SummaryError, match="test error"):
            raise SummaryError("test error")


class TestAC5Performance:
    """Tests for AC5: Summary Generation Performance requirement."""

    def test_llm_timeout_is_10_seconds(self):
        """AC5: LLM processing must complete within 10 seconds."""
        assert LLM_TIMEOUT == 10.0, f"LLM_TIMEOUT should be 10.0 (AC5), got {LLM_TIMEOUT}"

    @pytest.mark.asyncio
    async def test_llm_configured_with_correct_timeout(self):
        """Should configure ChatAnthropic with 10-second timeout."""
        with patch("src.services.summarizer.ANTHROPIC_API_KEY", "test-key"):
            with patch("src.services.summarizer.ChatAnthropic") as MockLLM:
                with patch("src.services.summarizer.ChatPromptTemplate") as MockPrompt:
                    mock_chain = AsyncMock()
                    mock_chain.ainvoke.return_value = MagicMock(
                        content='{"events": [], "emotions": [], "goals": [], "concerns": []}'
                    )
                    MockPrompt.from_template.return_value.__or__ = MagicMock(
                        return_value=mock_chain
                    )

                    await generate_summary(
                        "This is a test transcript with more than ten words included."
                    )

                    # Verify ChatAnthropic was called with timeout=10.0
                    MockLLM.assert_called_once()
                    call_kwargs = MockLLM.call_args.kwargs
                    assert call_kwargs.get("timeout") == 10.0, (
                        f"ChatAnthropic timeout should be 10.0, got {call_kwargs.get('timeout')}"
                    )
