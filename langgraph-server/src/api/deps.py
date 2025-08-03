"""Shared dependencies for FastAPI endpoints.

This module provides reusable dependencies for authentication,
database access, and other common operations.
"""

from typing import Annotated

from fastapi import Depends, HTTPException, Request

from src.core.exceptions import AuthenticationError


def get_user_id_from_request(request: Request) -> str:
    """Extract and validate user ID from request headers.

    In production, this should:
    1. Extract JWT from Authorization header
    2. Verify JWT signature with Supabase
    3. Extract user ID from claims

    For development, we use X-User-Id header (development only).

    Args:
        request: FastAPI request object

    Returns:
        User ID string

    Raises:
        HTTPException: If no valid authentication found

    SECURITY: User ID should NEVER come from query parameters
    as that would allow user impersonation.
    """
    # Try Authorization header (Supabase JWT)
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        # TODO: Verify JWT and extract user ID
        # For now, we'll use X-User-Id header as fallback
        pass

    # X-User-Id header (for development only)
    user_id = request.headers.get("X-User-Id")
    if user_id:
        return user_id

    raise HTTPException(
        status_code=401,
        detail={
            "error": {
                "code": "UNAUTHORIZED",
                "message": "Authentication required. Please log in.",
            }
        },
    )


# Type alias for dependency injection
UserId = Annotated[str, Depends(get_user_id_from_request)]
