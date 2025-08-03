"""Conversations CRUD endpoints for Project-Me.

Endpoints:
- GET /api/conversations - List user's conversations
- POST /api/conversations - Create new conversation with welcome message
- GET /api/conversations/{id} - Get single conversation with messages

Note: Messages are stored in LangGraph checkpoints (PostgresSaver).
The conversations table only stores metadata (title, timestamps) for UI listing.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import pytz
from fastapi import APIRouter, HTTPException, Query, Request

from src.api.deps import get_user_id_from_request
from src.api.schemas import (
    ConversationResponse,
    ConversationWithMessagesResponse,
    CreateConversationRequest,
)
from src.services.supabase import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["conversations"])


def generate_welcome_message(user_timezone: str = "Asia/Bangkok") -> str:
    """Generate contextual welcome message based on time of day.

    Args:
        user_timezone: User's timezone (default: Asia/Bangkok)

    Returns:
        Welcome message string
    """
    try:
        tz = pytz.timezone(user_timezone)
    except pytz.UnknownTimeZoneError:
        tz = pytz.timezone("Asia/Bangkok")

    hour = datetime.now(tz).hour

    if 5 <= hour < 12:
        greeting = "Good morning"
    elif 12 <= hour < 17:
        greeting = "Good afternoon"
    else:
        greeting = "Good evening"

    return f"{greeting}! I'm here to help. What's on your mind?"


@router.post("/conversations", response_model=ConversationWithMessagesResponse)
async def create_conversation(
    request: Request,
    body: Optional[CreateConversationRequest] = None,
) -> Dict[str, Any]:
    """Create a new conversation with welcome message.

    Args:
        request: FastAPI request for auth extraction
        body: Optional title for the conversation

    Returns:
        Created conversation with welcome message
    """
    user_id = get_user_id_from_request(request)

    client = get_supabase_client()
    if not client:
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "SERVICE_UNAVAILABLE",
                    "message": "Database service unavailable",
                }
            },
        )

    try:
        # Create the conversation
        conversation_data = {
            "user_id": user_id,
            "title": body.title if body else None,
        }

        result = (
            client.table("conversations")
            .insert(conversation_data)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": {
                        "code": "CREATE_FAILED",
                        "message": "Failed to create conversation",
                    }
                },
            )

        conversation = result.data[0]
        welcome_message = generate_welcome_message()

        logger.info(f"Created conversation {conversation['id'][:8]}... for user {user_id[:8]}...")

        return {
            "id": conversation["id"],
            "user_id": conversation["user_id"],
            "title": conversation.get("title"),
            "created_at": conversation["created_at"],
            "updated_at": conversation["updated_at"],
            "messages": [],
            "welcome_message": welcome_message,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create conversation for user {user_id[:8]}...: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "CREATE_FAILED",
                    "message": "Failed to create conversation",
                }
            },
        )


@router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(
    request: Request,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> List[Dict[str, Any]]:
    """List conversations for the authenticated user.

    Args:
        request: FastAPI request for auth extraction
        limit: Maximum number of results (default 20, max 100)
        offset: Pagination offset

    Returns:
        List of conversation records ordered by updated_at desc
    """
    user_id = get_user_id_from_request(request)

    client = get_supabase_client()
    if not client:
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "SERVICE_UNAVAILABLE",
                    "message": "Database service unavailable",
                }
            },
        )

    try:
        result = (
            client.table("conversations")
            .select("id, user_id, title, created_at, updated_at")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(limit)
            .offset(offset)
            .execute()
        )

        return [
            {
                "id": row["id"],
                "user_id": row["user_id"],
                "title": row.get("title"),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
            for row in result.data
        ]

    except Exception as e:
        logger.error(f"Failed to list conversations for user {user_id[:8]}...: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "FETCH_FAILED",
                    "message": "Failed to fetch conversations",
                }
            },
        )


async def get_messages_from_langgraph(graph, thread_id: str) -> List[Dict[str, Any]]:
    """Retrieve messages from LangGraph checkpoint.

    Args:
        graph: LangGraph compiled graph instance
        thread_id: The conversation/thread ID

    Returns:
        List of message dicts with role and content
    """
    try:
        config = {"configurable": {"thread_id": thread_id}}
        state = await graph.aget_state(config)

        if not state or not state.values:
            return []

        messages = state.values.get("messages", [])
        result = []

        for i, msg in enumerate(messages):
            # LangGraph messages can be HumanMessage, AIMessage, ToolMessage, etc.
            role = "user"
            tool_name = None

            if hasattr(msg, "type"):
                if msg.type == "ai":
                    role = "assistant"
                elif msg.type == "human":
                    role = "user"
                elif msg.type == "system":
                    role = "system"
                elif msg.type == "tool":
                    role = "tool"
                    # ToolMessage has a 'name' attribute for the tool that was called
                    tool_name = getattr(msg, "name", None)

            content = msg.content if hasattr(msg, "content") else str(msg)

            # Handle content blocks (Anthropic format)
            if isinstance(content, list):
                text_parts = []
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        text_parts.append(block.get("text", ""))
                    elif isinstance(block, str):
                        text_parts.append(block)
                content = "".join(text_parts)

            message_data = {
                "id": str(i),  # Use index as ID since checkpoints don't have message IDs
                "conversation_id": thread_id,
                "role": role,
                "content": content,
            }

            # Include tool_name for tool messages
            if tool_name:
                message_data["tool_name"] = tool_name

            result.append(message_data)

        return result

    except Exception as e:
        logger.warning(f"Failed to get messages from LangGraph: {e}")
        return []


@router.get("/conversations/{conversation_id}", response_model=ConversationWithMessagesResponse)
async def get_conversation(
    conversation_id: str,
    request: Request,
) -> Dict[str, Any]:
    """Get a single conversation with its messages.

    Messages are loaded from LangGraph checkpoints (PostgresSaver).

    Args:
        conversation_id: UUID of the conversation
        request: FastAPI request for auth extraction

    Returns:
        Conversation with messages
    """
    user_id = get_user_id_from_request(request)

    client = get_supabase_client()
    if not client:
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "SERVICE_UNAVAILABLE",
                    "message": "Database service unavailable",
                }
            },
        )

    try:
        # Get the conversation metadata
        conv_result = (
            client.table("conversations")
            .select("id, user_id, title, created_at, updated_at")
            .eq("id", conversation_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )

        if not conv_result.data:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": {
                        "code": "NOT_FOUND",
                        "message": "Conversation not found",
                    }
                },
            )

        conversation = conv_result.data

        # Get messages from LangGraph checkpoints
        graph = request.app.state.graph
        messages = await get_messages_from_langgraph(graph, conversation_id)

        # Generate welcome message if no messages exist
        welcome_message = None
        if not messages:
            welcome_message = generate_welcome_message()

        return {
            "id": conversation["id"],
            "user_id": conversation["user_id"],
            "title": conversation.get("title"),
            "created_at": conversation["created_at"],
            "updated_at": conversation["updated_at"],
            "messages": messages,
            "welcome_message": welcome_message,
        }

    except HTTPException:
        raise
    except Exception as e:
        # Handle not found from single() query
        if "No rows" in str(e) or "PGRST116" in str(e):
            raise HTTPException(
                status_code=404,
                detail={
                    "error": {
                        "code": "NOT_FOUND",
                        "message": "Conversation not found",
                    }
                },
            )

        logger.error(f"Failed to get conversation {conversation_id[:8]}...: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "FETCH_FAILED",
                    "message": "Failed to fetch conversation",
                }
            },
        )
