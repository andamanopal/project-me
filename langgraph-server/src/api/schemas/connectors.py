"""Schemas for connector endpoints."""

from typing import Optional

from pydantic import BaseModel


class ConnectorStatus(BaseModel):
    """Response model for connector status."""

    connected: bool
    type: str
    display_name: Optional[str] = None
    picture_url: Optional[str] = None
    connected_at: Optional[str] = None


class AuthorizeResponse(BaseModel):
    """Response model for authorize endpoint."""

    authorization_url: str


class ConnectorListItem(BaseModel):
    """Response model for connector list item."""

    type: str
    connected: bool
    is_active: bool
    display_name: Optional[str] = None
    picture_url: Optional[str] = None
    connected_at: Optional[str] = None
    last_sync_at: Optional[str] = None


class ConnectorListResponse(BaseModel):
    """Response model for list connectors endpoint."""

    connectors: list[ConnectorListItem]
