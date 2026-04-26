from __future__ import annotations

from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    voice: str | None = None
    # e.g. "-10%" / "+0%" / "-20%"
    rate: str | None = None


class VoicePreset(BaseModel):
    id: str
    label: str
    accent: str


class VoiceListResponse(BaseModel):
    voices: list[VoicePreset]
    default_voice: str
    configured: bool  # TTS 是否已配置
    asr_configured: bool = False  # ASR 是否已配置（DashScope/openai key）
