"""Centralized configuration management using Pydantic Settings.

All environment variables should be accessed through the `settings` object
to ensure validation and provide sensible defaults.
"""

import os
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Server
    port: int = 8000
    debug: bool = False

    # CORS
    frontend_url: str = "http://localhost:3000"
    cors_origins: list[str] = ["http://localhost:3000"]

    # Supabase
    supabase_url: Optional[str] = None
    supabase_publishable_key: Optional[str] = None

    # Database (for LangGraph PostgresSaver)
    database_url: Optional[str] = None

    # Anthropic
    anthropic_api_key: Optional[str] = None

    # Elasticsearch
    elasticsearch_url: str = "http://localhost:9200"
    elasticsearch_index: str = "lifelogs"
    memories_index: str = "memories"

    # Voyage AI (embeddings)
    voyage_embedding_model: str = "voyage-3.5"

    # ElevenLabs
    elevenlabs_api_key: Optional[str] = None

    # LINE
    line_channel_secret: str = ""
    line_channel_access_token: Optional[str] = None
    line_user_id: Optional[str] = None
    line_login_channel_id: Optional[str] = None
    line_login_channel_secret: Optional[str] = None
    line_callback_url: Optional[str] = None

    # Limitless
    limitless_api_key: Optional[str] = None

    # Feature flags
    use_chunking: bool = False

    @property
    def is_production(self) -> bool:
        """Check if running in production mode."""
        return not self.debug


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Global settings instance
settings = get_settings()
