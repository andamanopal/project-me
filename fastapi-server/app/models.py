from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime


class TodoItem(BaseModel):
    id: Optional[int] = None
    timestamp: datetime
    title: str
    status: Literal["active", "done"] = "active"


class TodoCreate(BaseModel):
    title: str


class TodoUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[Literal["active", "done"]] = None