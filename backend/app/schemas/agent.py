from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel


class AgentOut(BaseModel):
    id: str
    name: str
    description: str | None = None
    icon: str | None = None
    is_active: bool = True
    sort_order: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgentDetailOut(AgentOut):
    system_prompt: str
    welcome_message: str | None = None
