"""OpenAI-compatible chat completions endpoint.

Provides an OpenAI-compatible API that wraps the LangGraph agent,
enabling integration with Pipecat voice pipelines and other OpenAI-compatible clients.

Endpoint:
    POST /v1/chat/completions - Streaming chat completions in OpenAI format
"""

import json
import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["openai-compatible"])


class ChatMessage(BaseModel):
    """OpenAI chat message format."""
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    """OpenAI chat completion request format."""
    model: str = "langgraph-agent"
    messages: List[ChatMessage]
    temperature: Optional[float] = Field(default=0.7, ge=0, le=2)
    max_tokens: Optional[int] = Field(default=1024, ge=1)
    stream: Optional[bool] = True
    # Additional fields we accept but may ignore
    top_p: Optional[float] = None
    frequency_penalty: Optional[float] = None
    presence_penalty: Optional[float] = None
    stop: Optional[List[str]] = None
    # OpenAI's user field - we use this for user_id
    user: Optional[str] = None
    # Custom extension: thread_id for conversation continuity
    # Pass this to maintain conversation history across voice calls
    thread_id: Optional[str] = None


def create_chat_completion_chunk(
    chunk_id: str,
    content: str,
    model: str = "langgraph-agent",
    finish_reason: Optional[str] = None,
) -> str:
    """Create an OpenAI-format SSE chunk."""
    chunk = {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": {"content": content} if content else {},
                "finish_reason": finish_reason,
            }
        ],
    }
    return f"data: {json.dumps(chunk)}\n\n"


def create_chat_completion_done() -> str:
    """Create the final [DONE] SSE message."""
    return "data: [DONE]\n\n"


def parse_user_field(user: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Parse user field format: 'user_id::session_id'.
    
    The voice pipeline encodes both user_id and session_id in the user field
    since it's the only field that reliably passes through the OpenAI SDK.
    
    Args:
        user: The user field value, format "user_id::session_id"
        
    Returns:
        Tuple of (user_id, session_id), either can be None
    """
    if not user or "::" not in user:
        return user, None
    parts = user.split("::", 1)
    user_id = parts[0] if parts[0] else None
    session_id = parts[1] if len(parts) > 1 and parts[1] else None
    return user_id, session_id


@router.post("/chat/completions")
async def chat_completions(request: Request, body: ChatCompletionRequest):
    """OpenAI-compatible chat completions endpoint.
    
    Streams responses from the LangGraph agent in OpenAI SSE format.
    This enables integration with Pipecat and other OpenAI-compatible clients.
    
    Request body:
        model: str - Model name (ignored, uses LangGraph agent)
        messages: List[ChatMessage] - Conversation history
        stream: bool - Whether to stream (must be True for now)
        temperature: float - Sampling temperature (passed to underlying LLM)
        max_tokens: int - Max tokens (passed to underlying LLM)
    
    Returns:
        SSE stream in OpenAI format:
        data: {"id": "...", "choices": [{"delta": {"content": "..."}}]}
        data: [DONE]
    """
    if not body.stream:
        raise HTTPException(
            status_code=400,
            detail="Non-streaming mode not supported. Set stream=true.",
        )
    
    # Get graph from app state
    graph = getattr(request.app.state, "graph", None)
    if not graph:
        raise HTTPException(
            status_code=503,
            detail="LangGraph agent not initialized",
        )
    
    # Extract the last user message for the agent
    user_messages = [m for m in body.messages if m.role == "user"]
    if not user_messages:
        raise HTTPException(
            status_code=400,
            detail="No user message found in messages",
        )
    
    last_user_message = user_messages[-1].content
    
    # Generate unique IDs for this completion
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
    
    # Parse user field to extract user_id and session_id
    # Format from voice pipeline: "user_id::session_id"
    user_id, session_id = parse_user_field(body.user)
    
    # Use session_id as thread_id for conversation continuity
    # Falls back to body.thread_id (for non-voice clients) or generates new one
    thread_id = session_id or body.thread_id or f"voice-{uuid.uuid4().hex[:16]}"
    
    # Detect voice client: has session_id in user field (format: "user_id::session_id")
    is_voice = session_id is not None
    
    async def generate_stream():
        """Generate SSE stream from LangGraph agent."""
        try:
            # Build config with thread_id, is_voice flag, and optional user_id
            config = {"configurable": {"thread_id": thread_id, "is_voice": is_voice}}
            if user_id:
                config["configurable"]["user_id"] = user_id
            
            async for event in graph.astream_events(
                {"messages": [("user", last_user_message)]},
                config=config,
                version="v2",
            ):
                event_type = event.get("event")
                
                # Stream LLM response chunks
                if event_type == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        content = chunk.content
                        # Handle different content formats
                        if isinstance(content, str):
                            text_content = content
                        elif isinstance(content, list):
                            text_content = ""
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    text_content += block.get("text", "")
                                elif isinstance(block, str):
                                    text_content += block
                        else:
                            text_content = str(content)
                        
                        if text_content:
                            yield create_chat_completion_chunk(
                                chunk_id=completion_id,
                                content=text_content,
                                model=body.model,
                            )
            
            # Send finish reason
            yield create_chat_completion_chunk(
                chunk_id=completion_id,
                content="",
                model=body.model,
                finish_reason="stop",
            )
            
            # Send [DONE] marker
            yield create_chat_completion_done()
            
        except Exception as e:
            logger.error(f"Error streaming from LangGraph: {e}")
            # Send error as content then close
            error_chunk = create_chat_completion_chunk(
                chunk_id=completion_id,
                content=f"Error: {str(e)}",
                model=body.model,
                finish_reason="error",
            )
            yield error_chunk
            yield create_chat_completion_done()
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/models")
async def list_models():
    """List available models (OpenAI-compatible)."""
    return {
        "object": "list",
        "data": [
            {
                "id": "langgraph-agent",
                "object": "model",
                "created": int(time.time()),
                "owned_by": "project-me",
            }
        ],
    }
