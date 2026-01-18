"""API routers for Project-Me."""

from src.api.routers.chat import router as chat_router
from src.api.routers.checkins import router as checkins_router
from src.api.routers.connectors import router as connectors_router
from src.api.routers.conversations import router as conversations_router
from src.api.routers.daily_summaries import router as daily_summaries_router
from src.api.routers.imports import router as imports_router
from src.api.routers.openai_compat import router as openai_compat_router
from src.api.routers.patterns import router as patterns_router
from src.api.routers.voice import router as voice_router
from src.api.routers.webhooks import router as webhooks_router

__all__ = [
    "chat_router",
    "checkins_router",
    "connectors_router",
    "conversations_router",
    "daily_summaries_router",
    "imports_router",
    "openai_compat_router",
    "patterns_router",
    "voice_router",
    "webhooks_router",
]
