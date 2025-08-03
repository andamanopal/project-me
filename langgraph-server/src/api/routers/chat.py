"""Chat streaming endpoint.

Provides SSE streaming for AI responses.
Message persistence is handled by LangGraph's PostgresSaver checkpointer.
"""

import json
import logging
import traceback
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from src.api.deps import get_user_id_from_request
from src.api.schemas import ChatStreamRequest
from src.services.supabase import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


async def verify_conversation_ownership(conversation_id: str, user_id: str) -> bool:
    """Verify that a conversation belongs to the user.

    Args:
        conversation_id: UUID of the conversation
        user_id: User ID to verify ownership

    Returns:
        True if user owns the conversation, False otherwise
    """
    client = get_supabase_client()
    if not client:
        logger.error("Database service unavailable")
        return False

    try:
        result = (
            client.table("conversations")
            .select("id")
            .eq("id", conversation_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        return bool(result.data)
    except Exception as e:
        if "No rows" in str(e) or "PGRST116" in str(e):
            return False
        logger.error(f"Failed to verify conversation ownership: {e}")
        return False


async def update_conversation_timestamp(conversation_id: str) -> None:
    """Update conversation updated_at timestamp.

    Args:
        conversation_id: UUID of the conversation
    """
    client = get_supabase_client()
    if not client:
        return

    try:
        client.table("conversations").update({"updated_at": "now()"}).eq(
            "id", conversation_id
        ).execute()
    except Exception as e:
        logger.warning(f"Failed to update conversation timestamp: {e}")


@router.post("/chat/stream")
async def chat_stream(request: Request):
    """Stream chat responses using Server-Sent Events (SSE).

    Stores user message before streaming, stores AI response after completion.
    Uses conversation_id as LangGraph thread_id for state persistence.

    Request body:
        message: str - The user's message
        conversation_id: str - The conversation UUID (used as thread_id)

    Returns:
        SSE stream with events: content, tool_call, tool_result, done, error
    """
    # Get authenticated user
    user_id = get_user_id_from_request(request)

    # Parse request body
    try:
        body = await request.json()
        message = body.get("message", "").strip()
        conversation_id = body.get("conversation_id", "")

        if not message:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INVALID_REQUEST",
                        "message": "Message cannot be empty",
                    }
                },
            )

        if not conversation_id:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "INVALID_REQUEST",
                        "message": "conversation_id is required",
                    }
                },
            )

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "INVALID_JSON",
                    "message": "Invalid JSON in request body",
                }
            },
        )

    # Verify user owns this conversation
    if not await verify_conversation_ownership(conversation_id, user_id):
        raise HTTPException(
            status_code=403,
            detail={
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Cannot send message to this conversation",
                }
            },
        )

    # Get graph from app state (initialized in lifespan)
    graph = request.app.state.graph

    async def event_generator():
        """Generate SSE events from LangGraph streaming."""
        accumulated_response = ""

        try:
            # Use conversation_id as thread_id for LangGraph state
            # Pass user_id in config for tools to access
            config = {"configurable": {"thread_id": conversation_id, "user_id": user_id}}

            # Stream events from LangGraph
            async for event in graph.astream_events(
                {"messages": [("user", message)]},
                config=config,
                version="v2",
            ):
                event_type = event.get("event")

                # Stream LLM response chunks
                if event_type == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        content = chunk.content
                        # Handle different content formats (string vs content blocks)
                        if isinstance(content, str):
                            text_content = content
                        elif isinstance(content, list):
                            # Extract text from content blocks (Anthropic format)
                            text_content = ""
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    text_content += block.get("text", "")
                                elif isinstance(block, str):
                                    text_content += block
                        else:
                            text_content = str(content)

                        if text_content:
                            accumulated_response += text_content
                            yield {
                                "event": "message",
                                "data": json.dumps(
                                    {"type": "content", "content": text_content}
                                ),
                            }

                # Stream tool calls
                elif event_type == "on_chat_model_end":
                    data = event.get("data", {})
                    output = data.get("output")
                    if output and hasattr(output, "tool_calls") and output.tool_calls:
                        for tool_call in output.tool_calls:
                            yield {
                                "event": "tool_call",
                                "data": json.dumps(
                                    {
                                        "type": "tool_call",
                                        "name": tool_call.get("name"),
                                        "args": tool_call.get("args"),
                                    }
                                ),
                            }

                # Stream tool results
                elif event_type == "on_tool_end":
                    data = event.get("data", {})
                    output = data.get("output")
                    name = event.get("name", "")
                    if output is not None:
                        yield {
                            "event": "tool_result",
                            "data": json.dumps(
                                {
                                    "type": "tool_result",
                                    "name": name,
                                    "result": str(output),
                                }
                            ),
                        }

            # Update conversation timestamp for UI sorting
            # (Messages are persisted by LangGraph's PostgresSaver)
            if accumulated_response:
                await update_conversation_timestamp(conversation_id)

            # Send completion event
            yield {"event": "done", "data": json.dumps({"type": "done"})}

        except Exception as e:
            logger.error(f"Streaming error for conversation {conversation_id[:8]}...: {e}\n{traceback.format_exc()}")
            # Send error event
            yield {
                "event": "error",
                "data": json.dumps(
                    {
                        "type": "error",
                        "error": "I'm having trouble responding. Let's try again.",
                    }
                ),
            }

    return EventSourceResponse(
        event_generator(),
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
