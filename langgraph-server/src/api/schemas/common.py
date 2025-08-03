"""Common schemas used across multiple endpoints."""

from typing import Any, Dict

from pydantic import BaseModel


class ErrorDetail(BaseModel):
    """Standard error detail structure."""

    code: str
    message: str


class ErrorResponse(BaseModel):
    """Standard error response model."""

    error: ErrorDetail
