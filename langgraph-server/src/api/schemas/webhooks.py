"""Schemas for webhook endpoints."""

from typing import List, Optional

from pydantic import BaseModel, Field


class LineEventSource(BaseModel):
    """Source of the LINE event (user, group, or room)."""

    model_config = {"populate_by_name": True}

    type: str  # "user", "group", "room"
    user_id: Optional[str] = Field(None, alias="userId")
    group_id: Optional[str] = Field(None, alias="groupId")
    room_id: Optional[str] = Field(None, alias="roomId")


class LineMessageContent(BaseModel):
    """Content of a LINE message event."""

    model_config = {"populate_by_name": True}

    type: str  # "text", "image", "video", "audio", "file", "location", "sticker"
    id: str
    text: Optional[str] = None


class LineWebhookEvent(BaseModel):
    """A single LINE webhook event."""

    model_config = {"populate_by_name": True}

    type: str  # "message", "follow", "unfollow", "postback", etc.
    timestamp: int
    source: LineEventSource
    reply_token: Optional[str] = Field(None, alias="replyToken")
    message: Optional[LineMessageContent] = None


class LineWebhookPayload(BaseModel):
    """LINE webhook request payload containing multiple events."""

    destination: str
    events: List[LineWebhookEvent]
