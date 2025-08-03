"""Supabase service for database operations in Project-Me.

This module provides functions for:
- Connector management (LINE, etc.)
- User profile operations
"""

import os
import logging
from typing import Any, Dict, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Lazy-loaded Supabase client
_supabase_client = None


def get_supabase_client():
    """Get or create Supabase client with secret key.

    Uses secret key for backend operations (bypasses RLS).
    This is safe because the backend already authenticates users via headers.

    Returns:
        Supabase client instance
    """
    global _supabase_client

    if _supabase_client is None:
        try:
            from supabase import create_client

            # Read env vars at runtime (after main.py loads dotenv)
            supabase_url = os.getenv("SUPABASE_URL")
            # Use secret key to bypass RLS (backend handles auth separately)
            supabase_key = os.getenv("SUPABASE_SECRET_KEY")

            if not supabase_url or not supabase_key:
                logger.warning("Supabase credentials not configured (need SUPABASE_URL and SUPABASE_SECRET_KEY)")
                return None

            _supabase_client = create_client(supabase_url, supabase_key)
            logger.info("Supabase client initialized with secret key")
        except ImportError:
            logger.error("supabase package not installed. Run: pip install supabase")
            return None
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")
            return None

    return _supabase_client


async def get_connector(user_id: str, connector_type: str) -> Optional[Dict[str, Any]]:
    """Get a connector by user ID and type.

    Args:
        user_id: Supabase auth user ID
        connector_type: Connector type (e.g., 'line')

    Returns:
        Connector record or None if not found
    """
    client = get_supabase_client()
    if not client:
        return None

    try:
        response = (
            client.table("connectors")
            .select("*")
            .eq("user_id", user_id)
            .eq("type", connector_type)
            .single()
            .execute()
        )
        return response.data
    except Exception as e:
        # Single query returns error if not found
        if "No rows" in str(e) or "PGRST116" in str(e):
            return None
        logger.error(f"Error getting connector: {e}")
        return None


async def create_connector(
    user_id: str,
    connector_type: str,
    external_user_id: str,
    config: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Create a new connector record.

    Args:
        user_id: Supabase auth user ID
        connector_type: Connector type (e.g., 'line')
        external_user_id: External platform user ID
        config: Platform-specific configuration (JSONB)

    Returns:
        Created connector record or None on error
    """
    client = get_supabase_client()
    if not client:
        return None

    try:
        data = {
            "user_id": user_id,
            "type": connector_type,
            "external_user_id": external_user_id,
            "config": config,
            "is_active": True,
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }

        response = client.table("connectors").insert(data).execute()
        return response.data[0] if response.data else None
    except Exception as e:
        logger.error(f"Error creating connector: {e}")
        return None


async def update_connector(
    user_id: str,
    connector_type: str,
    config: Dict[str, Any],
    external_user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Update an existing connector.

    Args:
        user_id: Supabase auth user ID
        connector_type: Connector type (e.g., 'line')
        config: New configuration to merge with existing
        external_user_id: Optional new external user ID

    Returns:
        Updated connector record or None on error
    """
    client = get_supabase_client()
    if not client:
        return None

    try:
        # Build update data
        update_data: Dict[str, Any] = {
            "config": config,
            "last_sync_at": datetime.now(timezone.utc).isoformat(),
        }

        if external_user_id:
            update_data["external_user_id"] = external_user_id

        response = (
            client.table("connectors")
            .update(update_data)
            .eq("user_id", user_id)
            .eq("type", connector_type)
            .execute()
        )
        return response.data[0] if response.data else None
    except Exception as e:
        logger.error(f"Error updating connector: {e}")
        return None


async def upsert_connector(
    user_id: str,
    connector_type: str,
    external_user_id: str,
    config: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Create or update a connector (upsert operation).

    If connector exists, updates it. If not, creates new.

    Args:
        user_id: Supabase auth user ID
        connector_type: Connector type (e.g., 'line')
        external_user_id: External platform user ID
        config: Platform-specific configuration

    Returns:
        Upserted connector record or None on error
    """
    client = get_supabase_client()
    if not client:
        return None

    try:
        data = {
            "user_id": user_id,
            "type": connector_type,
            "external_user_id": external_user_id,
            "config": config,
            "is_active": True,
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }

        response = (
            client.table("connectors")
            .upsert(data, on_conflict="user_id,type")
            .execute()
        )
        return response.data[0] if response.data else None
    except Exception as e:
        logger.error(f"Error upserting connector: {e}")
        return None


async def delete_connector(user_id: str, connector_type: str) -> bool:
    """Delete a connector.

    Args:
        user_id: Supabase auth user ID
        connector_type: Connector type (e.g., 'line')

    Returns:
        True if deleted, False on error
    """
    client = get_supabase_client()
    if not client:
        return False

    try:
        client.table("connectors").delete().eq("user_id", user_id).eq(
            "type", connector_type
        ).execute()
        return True
    except Exception as e:
        logger.error(f"Error deleting connector: {e}")
        return False


async def get_user_by_external_id(
    connector_type: str, external_user_id: str
) -> Optional[str]:
    """Find app user ID by external connector ID.

    Used for webhook processing to map LINE user ID to app user.

    Args:
        connector_type: Connector type (e.g., 'line')
        external_user_id: External platform user ID

    Returns:
        App user ID or None if not found
    """
    client = get_supabase_client()
    if not client:
        return None

    try:
        response = (
            client.table("connectors")
            .select("user_id")
            .eq("type", connector_type)
            .eq("external_user_id", external_user_id)
            .eq("is_active", True)
            .single()
            .execute()
        )
        return response.data.get("user_id") if response.data else None
    except Exception as e:
        if "No rows" in str(e) or "PGRST116" in str(e):
            return None
        logger.error(f"Error finding user by external ID: {e}")
        return None


async def get_user_by_line_id(line_user_id: str) -> Optional[Dict[str, Any]]:
    """Find connector record by LINE user ID.

    Used for webhook processing to look up app user from LINE user ID.
    Returns full connector record for access to config and user_id.

    Args:
        line_user_id: LINE platform user ID

    Returns:
        Full connector record or None if not found
    """
    client = get_supabase_client()
    if not client:
        return None

    try:
        response = (
            client.table("connectors")
            .select("*")
            .eq("type", "line")
            .eq("external_user_id", line_user_id)
            .eq("is_active", True)
            .single()
            .execute()
        )
        return response.data
    except Exception as e:
        if "No rows" in str(e) or "PGRST116" in str(e):
            return None
        logger.error(f"Error finding user by LINE ID: {e}")
        return None


async def update_connector_friendship(
    user_id: str,
    connector_type: str,
    is_friend: bool,
) -> Optional[Dict[str, Any]]:
    """Update the is_friend status in connector config.

    Used when LINE users follow/unfollow the bot.

    Args:
        user_id: Supabase auth user ID
        connector_type: Connector type (e.g., 'line')
        is_friend: Whether user has added bot as friend

    Returns:
        Updated connector record or None on error
    """
    client = get_supabase_client()
    if not client:
        return None

    try:
        # First get current config to merge
        existing = await get_connector(user_id, connector_type)
        if not existing:
            logger.warning(f"Connector not found for friendship update: {user_id[:8]}...")
            return None

        # Merge new friendship status into existing config
        config = existing.get("config", {})
        config["is_friend"] = is_friend
        config["friendship_changed_at"] = datetime.now(timezone.utc).isoformat()

        response = (
            client.table("connectors")
            .update({"config": config, "last_sync_at": datetime.now(timezone.utc).isoformat()})
            .eq("user_id", user_id)
            .eq("type", connector_type)
            .execute()
        )
        return response.data[0] if response.data else None
    except Exception as e:
        logger.error(f"Error updating connector friendship: {e}")
        return None


# =============================================================================
# Imported Chats Operations
# =============================================================================


async def bulk_insert_imported_chats(
    user_id: str,
    messages: list[Dict[str, Any]],
    batch_size: int = 100,
) -> int:
    """Bulk insert imported chat messages.

    Args:
        user_id: Supabase auth user ID
        messages: List of message dicts with keys: content, source, sent_at, metadata
        batch_size: Number of messages to insert per batch

    Returns:
        Total number of messages inserted
    """
    client = get_supabase_client()
    if not client:
        return 0

    total_inserted = 0

    try:
        # Process in batches to avoid memory issues
        for i in range(0, len(messages), batch_size):
            batch = messages[i : i + batch_size]

            # Prepare records with user_id
            records = [
                {
                    "user_id": user_id,
                    "source": msg.get("source", "line"),
                    "content": msg["content"],
                    "sent_at": msg.get("sent_at"),
                    "metadata": msg.get("metadata", {}),
                }
                for msg in batch
            ]

            response = client.table("imported_chats").insert(records).execute()
            total_inserted += len(response.data) if response.data else 0

        logger.info(f"Inserted {total_inserted} imported chats for user {user_id[:8]}...")
        return total_inserted

    except Exception as e:
        logger.error(f"Error bulk inserting imported chats: {e}")
        return total_inserted


async def delete_imported_chats(user_id: str, source: str) -> int:
    """Delete all imported chats for a user and source.

    Args:
        user_id: Supabase auth user ID
        source: Source platform (e.g., 'line')

    Returns:
        Number of records deleted (estimate)
    """
    client = get_supabase_client()
    if not client:
        return 0

    try:
        # Get count before deletion
        count_response = (
            client.table("imported_chats")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("source", source)
            .execute()
        )
        count = count_response.count or 0

        # Delete records
        client.table("imported_chats").delete().eq("user_id", user_id).eq(
            "source", source
        ).execute()

        logger.info(f"Deleted {count} imported chats for user {user_id[:8]}...")
        return count

    except Exception as e:
        logger.error(f"Error deleting imported chats: {e}")
        return 0


async def get_import_stats(user_id: str, source: str) -> Dict[str, Any]:
    """Get import statistics for a user and source.

    Args:
        user_id: Supabase auth user ID
        source: Source platform (e.g., 'line')

    Returns:
        Dict with message_count, oldest_message, newest_message
    """
    client = get_supabase_client()
    if not client:
        return {"message_count": 0}

    try:
        # Get count
        count_response = (
            client.table("imported_chats")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("source", source)
            .execute()
        )

        # Get date range
        oldest_response = (
            client.table("imported_chats")
            .select("sent_at")
            .eq("user_id", user_id)
            .eq("source", source)
            .order("sent_at", desc=False)
            .limit(1)
            .execute()
        )

        newest_response = (
            client.table("imported_chats")
            .select("sent_at")
            .eq("user_id", user_id)
            .eq("source", source)
            .order("sent_at", desc=True)
            .limit(1)
            .execute()
        )

        return {
            "message_count": count_response.count or 0,
            "oldest_message": oldest_response.data[0]["sent_at"] if oldest_response.data else None,
            "newest_message": newest_response.data[0]["sent_at"] if newest_response.data else None,
        }

    except Exception as e:
        logger.error(f"Error getting import stats: {e}")
        return {"message_count": 0}


async def update_connector_import_stats(
    user_id: str,
    connector_type: str,
    message_count: int,
) -> Optional[Dict[str, Any]]:
    """Update connector config with import statistics.

    Args:
        user_id: Supabase auth user ID
        connector_type: Connector type (e.g., 'line')
        message_count: Number of messages imported

    Returns:
        Updated connector record or None on error
    """
    client = get_supabase_client()
    if not client:
        return None

    try:
        # Get current connector to merge config
        existing = await get_connector(user_id, connector_type)
        if not existing:
            logger.warning(f"Connector not found for import stats: {user_id[:8]}...")
            return None

        # Merge import stats into existing config
        config = existing.get("config", {})
        config["last_import_at"] = datetime.now(timezone.utc).isoformat()
        config["import_message_count"] = message_count

        response = (
            client.table("connectors")
            .update({"config": config, "last_sync_at": datetime.now(timezone.utc).isoformat()})
            .eq("user_id", user_id)
            .eq("type", connector_type)
            .execute()
        )
        return response.data[0] if response.data else None

    except Exception as e:
        logger.error(f"Error updating connector import stats: {e}")
        return None


async def deactivate_connector(user_id: str, connector_type: str) -> bool:
    """Soft-delete connector by setting is_active=false.

    Preserves data for potential reconnection.

    Args:
        user_id: Supabase auth user ID
        connector_type: Connector type (e.g., 'line')

    Returns:
        True if deactivated, False on error
    """
    client = get_supabase_client()
    if not client:
        return False

    try:
        response = (
            client.table("connectors")
            .update({"is_active": False, "last_sync_at": datetime.now(timezone.utc).isoformat()})
            .eq("user_id", user_id)
            .eq("type", connector_type)
            .execute()
        )
        success = bool(response.data)
        if success:
            logger.info(f"Deactivated {connector_type} connector for user {user_id[:8]}...")
        return success
    except Exception as e:
        logger.error(f"Error deactivating connector: {e}")
        return False


async def get_all_connectors(user_id: str) -> list[Dict[str, Any]]:
    """Get all connectors for a user (including inactive).

    Used for displaying integrations status page.

    Args:
        user_id: Supabase auth user ID

    Returns:
        List of connector records
    """
    client = get_supabase_client()
    if not client:
        return []

    try:
        response = (
            client.table("connectors")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        return response.data or []
    except Exception as e:
        logger.error(f"Error getting all connectors: {e}")
        return []
