from __future__ import annotations

import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import DATA_DIR
from app.database import get_db
from app.schemas.speech import TTSRequest, VoiceListResponse, VoicePreset
from app.services.speech_service import (
    DEFAULT_VOICE,
    VOICE_PRESETS,
    get_asr_config,
    get_tts_config,
    synthesize_speech,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/speech", tags=["speech"])

TTS_CACHE_DIR = DATA_DIR / "tts_cache"
TTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _cache_key(text: str, voice: str, rate: str | None) -> str:
    h = hashlib.sha256()
    h.update(text.encode("utf-8"))
    h.update(b"|")
    h.update(voice.encode("utf-8"))
    h.update(b"|")
    h.update((rate or "").encode("utf-8"))
    return h.hexdigest()


@router.get("/voices", response_model=VoiceListResponse)
async def list_voices(db: AsyncSession = Depends(get_db)):
    tts_cfg = await get_tts_config(db)
    asr_cfg = await get_asr_config(db)
    tts_configured = bool(tts_cfg.get("secret_id") and tts_cfg.get("secret_key"))
    default_voice = tts_cfg.get("default_voice") or DEFAULT_VOICE

    voices = [
        VoicePreset(id=vid, label=meta["label"], accent=meta["accent"])
        for vid, meta in VOICE_PRESETS.items()
    ]
    return VoiceListResponse(
        voices=voices,
        default_voice=default_voice,
        configured=tts_configured,
        asr_configured=bool(asr_cfg.get("api_key")),
    )


@router.post("/tts")
async def text_to_speech(req: TTSRequest, db: AsyncSession = Depends(get_db)):
    """文本合成语音，返回 mp3。带磁盘缓存。"""
    tts_cfg = await get_tts_config(db)
    voice = req.voice or tts_cfg.get("default_voice") or DEFAULT_VOICE
    rate = req.rate if req.rate is not None else tts_cfg.get("default_rate") or tts_cfg.get("default_speed")

    cache_key = _cache_key(req.text, voice, rate or "")
    cache_path = TTS_CACHE_DIR / f"{cache_key}.mp3"

    if not cache_path.exists():
        try:
            audio = await synthesize_speech(db, req.text, voice=voice, rate=rate)
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        if not audio:
            raise HTTPException(status_code=500, detail="语音合成失败")
        cache_path.write_bytes(audio)

    return FileResponse(
        str(cache_path),
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "public, max-age=2592000",
            "X-Voice": voice,
        },
    )
