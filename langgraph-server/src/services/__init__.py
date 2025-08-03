"""External service clients for the LangGraph agent."""

from .daily_summary import (
    gather_sources_for_date,
    generate_daily_summary,
    get_daily_summary,
    save_and_index_summary,
    search_daily_summaries,
)
from .elasticsearch import (
    clean_lifelog_markdown,
    ingest_lifelogs,
    search_lifelogs,
)
from .elevenlabs import (
    AudioDownloadError,
    TranscriptionError,
    is_elevenlabs_configured,
    transcribe_audio,
    transcribe_audio_bytes,
)
from .line import LINEClient, send_line_update_sync
from .summarizer import (
    SummaryError,
    SummaryResult,
    create_error_summary,
    generate_summary,
    is_summarizer_configured,
)

__all__ = [
    # Daily Summaries
    "gather_sources_for_date",
    "generate_daily_summary",
    "get_daily_summary",
    "save_and_index_summary",
    "search_daily_summaries",
    # LINE
    "LINEClient",
    "send_line_update_sync",
    # Elasticsearch / RAG
    "ingest_lifelogs",
    "search_lifelogs",
    "clean_lifelog_markdown",
    # ElevenLabs transcription
    "transcribe_audio",
    "transcribe_audio_bytes",
    "is_elevenlabs_configured",
    "TranscriptionError",
    "AudioDownloadError",
    # Summary generation
    "generate_summary",
    "is_summarizer_configured",
    "create_error_summary",
    "SummaryError",
    "SummaryResult",
]
