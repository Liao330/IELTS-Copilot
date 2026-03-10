from __future__ import annotations

from pydantic import BaseModel


class MessageCreate(BaseModel):
    content: str
    attachments: list[str] | None = None  # file IDs


class MessageEdit(BaseModel):
    message_id: str
    content: str
