from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.setting import Setting
from app.schemas.setting import SettingsOut, SettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


async def _get_all_settings(db: AsyncSession) -> dict[str, str]:
    result = await db.execute(select(Setting))
    return {s.key: s.value for s in result.scalars().all()}


@router.get("", response_model=SettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db)):
    raw = await _get_all_settings(db)

    return SettingsOut(
        llm_providers=json.loads(raw.get("llm_providers", "{}")),
        default_model=raw.get("default_model", "openai/qwen-turbo-2024-11-01"),
        context_window_size=int(raw.get("context_window_size", "20")),
        stream_enabled=raw.get("stream_enabled", "true") == "true",
        speech_providers=json.loads(raw.get("speech_providers", "{}")),
    )


@router.put("", response_model=SettingsOut)
async def update_settings(data: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    updates = {}
    if data.llm_providers is not None:
        updates["llm_providers"] = json.dumps(data.llm_providers, ensure_ascii=False)
    if data.default_model is not None:
        updates["default_model"] = data.default_model
    if data.context_window_size is not None:
        updates["context_window_size"] = str(data.context_window_size)
    if data.stream_enabled is not None:
        updates["stream_enabled"] = "true" if data.stream_enabled else "false"
    if data.speech_providers is not None:
        updates["speech_providers"] = json.dumps(data.speech_providers, ensure_ascii=False)

    for key, value in updates.items():
        result = await db.execute(select(Setting).where(Setting.key == key))
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = value
            setting.updated_at = datetime.utcnow()
        else:
            db.add(Setting(key=key, value=value))

    await db.commit()
    return await get_settings(db)
