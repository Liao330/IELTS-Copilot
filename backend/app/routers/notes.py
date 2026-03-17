from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_

from app.database import get_db
from app.models.note import Note
from app.models.setting import Setting
from app.schemas.note import NoteCreate, NoteUpdate, NoteOut
from app.services.llm_service import complete_chat

router = APIRouter(prefix="/api/notes", tags=["notes"])


# ---------- AI generate title ----------

class GenerateTitleRequest(BaseModel):
    content: str


class GenerateTitleResponse(BaseModel):
    title: str


def _resolve_provider(model_name: str, providers: dict) -> tuple[str | None, str | None]:
    """Resolve api_key and api_base from model_name and providers config."""
    api_key = None
    api_base = None
    provider_key = model_name.split("/")[0] if "/" in model_name else model_name
    if provider_key in providers:
        provider_config = providers[provider_key]
        api_key = provider_config.get("api_key")
        api_base = provider_config.get("api_base")

    if not api_key:
        for prov_name, prov_config in providers.items():
            if prov_config.get("api_key"):
                api_key = prov_config["api_key"]
                api_base = prov_config.get("api_base")
                break

    return api_key, api_base


@router.post("/generate-title", response_model=GenerateTitleResponse)
async def generate_note_title(data: GenerateTitleRequest, db: AsyncSession = Depends(get_db)):
    """Use AI to generate a concise title for note content."""
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="内容不能为空")

    # Load settings (key-value table)
    result = await db.execute(select(Setting))
    settings = {s.key: s.value for s in result.scalars().all()}
    if not settings:
        raise HTTPException(status_code=500, detail="系统设置未初始化")

    model_name = settings.get("default_model", "openai/qwen-turbo-2024-11-01")
    providers_raw = settings.get("llm_providers", "{}")
    providers = json.loads(providers_raw) if providers_raw else {}
    api_key, api_base = _resolve_provider(model_name, providers)

    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 API Key，请前往设置页面配置")

    # Truncate content to avoid excessive token usage
    truncated = content[:2000] if len(content) > 2000 else content

    messages = [
        {
            "role": "system",
            "content": (
                "你是一个标题生成助手。根据用户提供的笔记内容，生成一个简洁、准确的中文标题。"
                "要求：1) 不超过20个字 2) 直接输出标题文本，不要加引号或其他格式 3) 概括内容核心要点"
            ),
        },
        {"role": "user", "content": f"请为以下笔记内容生成标题：\n\n{truncated}"},
    ]

    try:
        title = await complete_chat(
            model=model_name,
            api_key=api_key,
            api_base=api_base,
            messages=messages,
            temperature=0.3,
        )
        # Clean up: remove quotes, newlines, etc.
        title = title.strip().strip("\"'""''《》").strip()
        if not title:
            title = "未命名笔记"
        return GenerateTitleResponse(title=title)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 生成标题失败：{str(e)}")


@router.get("", response_model=list[NoteOut])
async def list_notes(
    category: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = select(Note)
    if category:
        query = query.where(Note.category == category)
    if search:
        query = query.where(
            or_(Note.title.contains(search), Note.content.contains(search))
        )
    query = query.order_by(desc(Note.updated_at))
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=NoteOut, status_code=201)
async def create_note(data: NoteCreate, db: AsyncSession = Depends(get_db)):
    import uuid
    note = Note(
        id=str(uuid.uuid4()),
        title=data.title,
        content=data.content,
        category=data.category,
        tags=json.dumps(data.tags, ensure_ascii=False) if data.tags else None,
        source_conversation_id=data.source_conversation_id,
        source_message_id=data.source_message_id,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.put("/{note_id}", response_model=NoteOut)
async def update_note(note_id: str, data: NoteUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Note).where(Note.id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if data.title is not None:
        note.title = data.title
    if data.content is not None:
        note.content = data.content
    if data.category is not None:
        note.category = data.category
    if data.tags is not None:
        note.tags = json.dumps(data.tags, ensure_ascii=False)
    note.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(note)
    return note


@router.delete("/{note_id}")
async def delete_note(note_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Note).where(Note.id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    await db.delete(note)
    await db.commit()
    return {"detail": "Note deleted"}
