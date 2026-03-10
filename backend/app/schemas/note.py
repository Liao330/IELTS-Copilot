from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel


class NoteCreate(BaseModel):
    title: str
    content: str
    category: str  # writing, speaking, reading, listening, general
    tags: list[str] | None = None
    source_conversation_id: str | None = None
    source_message_id: str | None = None


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    category: str | None = None
    tags: list[str] | None = None


class NoteOut(BaseModel):
    id: str
    title: str
    content: str
    category: str
    tags: str | None = None
    source_conversation_id: str | None = None
    source_message_id: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
