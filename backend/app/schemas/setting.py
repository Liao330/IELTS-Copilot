from __future__ import annotations

from pydantic import BaseModel
from typing import Any


class SettingsOut(BaseModel):
    llm_providers: dict[str, Any] = {}
    default_model: str = "openai/qwen-turbo-2024-11-01"
    context_window_size: int = 20
    stream_enabled: bool = True
    speech_providers: dict[str, Any] = {}


class SettingsUpdate(BaseModel):
    llm_providers: dict[str, Any] | None = None
    default_model: str | None = None
    context_window_size: int | None = None
    stream_enabled: bool | None = None
    speech_providers: dict[str, Any] | None = None
