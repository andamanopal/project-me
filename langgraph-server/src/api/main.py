"""FastAPI server with direct LangGraph SSE streaming."""

import logging
from contextlib import asynccontextmanager

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

load_dotenv()

from src.agent.graph import build_graph
from src.api.routers import (
    chat_router,
    checkins_router,
    connectors_router,
    conversations_router,
    daily_summaries_router,
    imports_router,
    patterns_router,
    voice_router,
    webhooks_router,
)
from src.core.config import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize LangGraph with AsyncPostgresSaver on startup."""
    if settings.database_url:
        logger.info("Initializing AsyncPostgresSaver for persistent conversations")
        async with AsyncPostgresSaver.from_conn_string(settings.database_url) as checkpointer:
            await checkpointer.setup()
            app.state.graph = build_graph(checkpointer)
            logger.info("LangGraph initialized with PostgresSaver")
            yield
    else:
        logger.warning("No DATABASE_URL configured, using MemorySaver (not persistent)")
        app.state.graph = build_graph(MemorySaver())
        yield


# Create FastAPI app
app = FastAPI(
    title="Project-Me LangGraph Server",
    description="Digital clone backend with memory retrieval capabilities",
    version="1.0.0",
    lifespan=lifespan,
)

# Include routers
app.include_router(chat_router)
app.include_router(connectors_router)
app.include_router(conversations_router)
app.include_router(webhooks_router)
app.include_router(voice_router)
app.include_router(checkins_router)
app.include_router(daily_summaries_router)
app.include_router(patterns_router)
app.include_router(imports_router)

# Add CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins if settings.is_production else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/")
def root():
    """Root endpoint with API info."""
    return {
        "name": "Project-Me LangGraph Server",
        "version": "1.0.0",
        "endpoints": {
            "chat_stream": "/chat/stream",
            "health": "/health",
            "docs": "/docs",
            "connectors": {
                "line_authorize": "POST /connectors/line/authorize",
                "line_callback": "GET /connectors/line/callback",
                "line_status": "GET /connectors/line/status",
                "line_disconnect": "DELETE /connectors/line",
            },
            "webhooks": {
                "line_webhook": "POST /api/line/webhook",
            },
            "voice": {
                "transcribe": "POST /voice/transcribe/{check_in_id}",
                "status": "GET /voice/status/{check_in_id}",
            },
            "check_ins": {
                "list": "GET /api/check-ins",
            },
            "daily_summaries": {
                "search": "GET /api/daily-summaries/search",
                "calendar": "GET /api/daily-summaries/calendar",
                "date_summary": "GET /api/daily-summaries/{date}",
            },
            "patterns": {
                "list": "GET /api/patterns",
                "refresh": "POST /api/patterns/refresh",
            },
        },
    }


def main():
    """Run the uvicorn server."""
    uvicorn.run(
        "src.api.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.debug,
    )


if __name__ == "__main__":
    main()
