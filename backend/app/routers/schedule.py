from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel

from app.database import get_db
from app.models.schedule import ScheduleTask

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


# ─── Schemas ───────────────────────────────────────────────

class ScheduleTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    scheduled_date: date
    start_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    sort_order: int = 0


class ScheduleTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    scheduled_date: Optional[date] = None
    start_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    done: Optional[bool] = None
    sort_order: Optional[int] = None


class ScheduleTaskOut(BaseModel):
    id: str
    title: str
    description: Optional[str]
    category: Optional[str]
    scheduled_date: date
    start_time: Optional[str]
    duration_minutes: Optional[int]
    done: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Endpoints ─────────────────────────────────────────────

@router.get("/", response_model=List[ScheduleTaskOut])
async def list_schedule_tasks(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
):
    """列出日程任务，可按日期范围过滤"""
    stmt = select(ScheduleTask).order_by(ScheduleTask.scheduled_date, ScheduleTask.sort_order, ScheduleTask.start_time)
    if date_from:
        stmt = stmt.where(ScheduleTask.scheduled_date >= date_from)
    if date_to:
        stmt = stmt.where(ScheduleTask.scheduled_date <= date_to)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=ScheduleTaskOut)
async def create_schedule_task(
    data: ScheduleTaskCreate,
    db: AsyncSession = Depends(get_db),
):
    task = ScheduleTask(
        id=str(uuid.uuid4()),
        title=data.title,
        description=data.description,
        category=data.category,
        scheduled_date=data.scheduled_date,
        start_time=data.start_time,
        duration_minutes=data.duration_minutes,
        sort_order=data.sort_order,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=ScheduleTaskOut)
async def update_schedule_task(
    task_id: str,
    data: ScheduleTaskUpdate,
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(ScheduleTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(task, key, value)
    task.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/{task_id}")
async def delete_schedule_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(ScheduleTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    await db.delete(task)
    await db.commit()
    return {"ok": True}


@router.post("/batch", response_model=List[ScheduleTaskOut])
async def batch_create_schedule_tasks(
    tasks: List[ScheduleTaskCreate],
    db: AsyncSession = Depends(get_db),
):
    """批量创建日程任务"""
    created = []
    for data in tasks:
        task = ScheduleTask(
            id=str(uuid.uuid4()),
            title=data.title,
            description=data.description,
            category=data.category,
            scheduled_date=data.scheduled_date,
            start_time=data.start_time,
            duration_minutes=data.duration_minutes,
            sort_order=data.sort_order,
        )
        db.add(task)
        created.append(task)
    await db.commit()
    for t in created:
        await db.refresh(t)
    return created
