from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.feedback import FeedbackItem

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


class FeedbackCreate(BaseModel):
    text: str


class FeedbackUpdate(BaseModel):
    done: bool | None = None
    text: str | None = None


class FeedbackOut(BaseModel):
    id: str
    text: str
    done: bool
    created_at: str


@router.get("/", response_model=list[FeedbackOut])
async def list_feedback(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FeedbackItem).order_by(FeedbackItem.created_at))
    items = result.scalars().all()
    return [FeedbackOut(id=it.id, text=it.text, done=it.done, created_at=it.created_at.isoformat()) for it in items]


@router.post("/", response_model=FeedbackOut, status_code=201)
async def create_feedback(body: FeedbackCreate, db: AsyncSession = Depends(get_db)):
    item = FeedbackItem(id=str(uuid.uuid4()), text=body.text.strip())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return FeedbackOut(id=item.id, text=item.text, done=item.done, created_at=item.created_at.isoformat())


@router.patch("/{item_id}", response_model=FeedbackOut)
async def update_feedback(item_id: str, body: FeedbackUpdate, db: AsyncSession = Depends(get_db)):
    item = await db.get(FeedbackItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if body.done is not None:
        item.done = body.done
    if body.text is not None:
        item.text = body.text.strip()
    await db.commit()
    await db.refresh(item)
    return FeedbackOut(id=item.id, text=item.text, done=item.done, created_at=item.created_at.isoformat())


@router.delete("/{item_id}")
async def delete_feedback(item_id: str, db: AsyncSession = Depends(get_db)):
    item = await db.get(FeedbackItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(item)
    await db.commit()
    return {"ok": True}
