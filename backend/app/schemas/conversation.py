from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class ConversationCreate(BaseModel):
    model_config = {"protected_namespaces": ()}
    agent_id: str
    model_name: str | None = None


class ConversationUpdate(BaseModel):
    title: str | None = None


class ConversationOut(BaseModel):
    model_config = {"from_attributes": True, "protected_namespaces": ()}
    id: str
    agent_id: str
    title: str | None = None
    model_name: str | None = None
    created_at: datetime
    updated_at: datetime


class ConversationDetailOut(ConversationOut):
    messages: list["MessageOut"] = []
    agent_name: str | None = None
    agent_icon: str | None = None


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    attachments: str | None = None
    token_count: int | None = None
    routed_agent_id: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationListOut(BaseModel):
    conversations: list[ConversationOut]
    total: int
    page: int
    page_size: int
