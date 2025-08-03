"""Custom exceptions for Project-Me application.

These exceptions provide structured error responses consistent
with the API's error format.
"""

from typing import Any, Dict, Optional


class ProjectMeException(Exception):
    """Base exception for Project-Me application."""

    def __init__(
        self,
        message: str,
        code: str = "INTERNAL_ERROR",
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None,
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to API error response format."""
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                **self.details,
            }
        }


class AuthenticationError(ProjectMeException):
    """Raised when authentication fails."""

    def __init__(self, message: str = "Authentication required. Please log in."):
        super().__init__(
            message=message,
            code="UNAUTHORIZED",
            status_code=401,
        )


class NotFoundError(ProjectMeException):
    """Raised when a requested resource is not found."""

    def __init__(self, resource: str = "Resource", message: Optional[str] = None):
        super().__init__(
            message=message or f"{resource} not found",
            code="NOT_FOUND",
            status_code=404,
        )


class ValidationError(ProjectMeException):
    """Raised when request validation fails."""

    def __init__(self, message: str, field: Optional[str] = None):
        details = {"field": field} if field else {}
        super().__init__(
            message=message,
            code="INVALID_REQUEST",
            status_code=400,
            details=details,
        )


class ServiceUnavailableError(ProjectMeException):
    """Raised when an external service is unavailable."""

    def __init__(self, service: str = "Service"):
        super().__init__(
            message=f"{service} is currently unavailable",
            code="SERVICE_UNAVAILABLE",
            status_code=503,
        )


class ForbiddenError(ProjectMeException):
    """Raised when user doesn't have permission."""

    def __init__(self, message: str = "You don't have permission to access this resource"):
        super().__init__(
            message=message,
            code="FORBIDDEN",
            status_code=403,
        )
