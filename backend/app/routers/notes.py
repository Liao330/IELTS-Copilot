from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_

from app.database import get_db
from app.models.note import Note
from app.schemas.note import NoteCreate, NoteUpdate, NoteOut

router = APIRouter(prefix="/api/notes", tags=["notes"])


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
