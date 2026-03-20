"""API router for study plan management."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.study_plan import StudyPlan, StudyPlanDay
from app.schemas.study_plan import (
    StudyPlanOut, StudyPlanCurrentDayOut, StudyPlanDayOut, LinkHomeworkRequest,
)
from app.services.study_plan_service import parse_plan_pdf

router = APIRouter(prefix="/api/study-plan", tags=["study-plan"])


def _plan_load_options():
    return [selectinload(StudyPlan.days)]


# ---- Get active plan ----

@router.get("/active", response_model=Optional[StudyPlanOut])
async def get_active_plan(db: AsyncSession = Depends(get_db)):
    """Get the currently active study plan with all days."""
    stmt = (
        select(StudyPlan)
        .options(*_plan_load_options())
        .where(StudyPlan.is_active == True)  # noqa: E712
    )
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    return plan


# ---- Get current day tasks (lightweight, for homepage) ----

@router.get("/current-day", response_model=Optional[StudyPlanCurrentDayOut])
async def get_current_day(db: AsyncSession = Depends(get_db)):
    """Get the current day's tasks from the active plan."""
    stmt = (
        select(StudyPlan)
        .options(*_plan_load_options())
        .where(StudyPlan.is_active == True)  # noqa: E712
    )
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        return None

    # Find current day
    current = None
    for d in plan.days:
        if d.day_number == plan.current_day:
            current = d
            break

    return StudyPlanCurrentDayOut(
        plan_id=plan.id,
        plan_title=plan.title,
        current_day=plan.current_day,
        total_days=plan.total_days,
        day=current,
    )


# ---- Upload & parse plan PDF ----

@router.post("/parse", response_model=StudyPlanOut, status_code=201)
async def parse_plan(
    file_id: str = Query(..., description="已上传的 PDF 文件 ID"),
    db: AsyncSession = Depends(get_db),
):
    """Parse an uploaded PDF into a structured study plan."""
    try:
        plan = await parse_plan_pdf(db, file_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解析计划失败：{str(e)}")

    # Re-fetch with relationships loaded
    stmt = select(StudyPlan).options(*_plan_load_options()).where(StudyPlan.id == plan.id)
    result = await db.execute(stmt)
    return result.scalar_one()


# ---- Advance / set current day ----

@router.post("/advance-day", response_model=StudyPlanCurrentDayOut)
async def advance_day(db: AsyncSession = Depends(get_db)):
    """Advance the active plan to the next day."""
    stmt = (
        select(StudyPlan)
        .options(*_plan_load_options())
        .where(StudyPlan.is_active == True)  # noqa: E712
    )
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="没有进行中的学习计划")

    if plan.current_day >= plan.total_days:
        raise HTTPException(status_code=400, detail="已完成全部计划！恭喜！🎉")

    plan.current_day += 1
    await db.commit()
    await db.refresh(plan)

    current = None
    for d in plan.days:
        if d.day_number == plan.current_day:
            current = d
            break

    return StudyPlanCurrentDayOut(
        plan_id=plan.id,
        plan_title=plan.title,
        current_day=plan.current_day,
        total_days=plan.total_days,
        day=current,
    )


@router.put("/current-day", response_model=StudyPlanCurrentDayOut)
async def set_current_day(
    day: int = Query(..., ge=1, description="设置当前进度为第几天"),
    db: AsyncSession = Depends(get_db),
):
    """Manually set the current day of the active plan."""
    stmt = (
        select(StudyPlan)
        .options(*_plan_load_options())
        .where(StudyPlan.is_active == True)  # noqa: E712
    )
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="没有进行中的学习计划")

    if day > plan.total_days:
        raise HTTPException(status_code=400, detail=f"超出计划范围，最多 {plan.total_days} 天")

    plan.current_day = day
    await db.commit()
    await db.refresh(plan)

    current = None
    for d in plan.days:
        if d.day_number == plan.current_day:
            current = d
            break

    return StudyPlanCurrentDayOut(
        plan_id=plan.id,
        plan_title=plan.title,
        current_day=plan.current_day,
        total_days=plan.total_days,
        day=current,
    )


# ---- Link homework to a plan day task ----

@router.post("/days/{day_number}/link-homework", response_model=StudyPlanDayOut)
async def link_homework(
    day_number: int,
    data: LinkHomeworkRequest,
    db: AsyncSession = Depends(get_db),
):
    """Link a homework to a specific subject task on a plan day (marks it as completed)."""
    stmt = select(StudyPlan).where(StudyPlan.is_active == True)  # noqa: E712
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="没有进行中的学习计划")

    stmt = select(StudyPlanDay).where(
        StudyPlanDay.plan_id == plan.id,
        StudyPlanDay.day_number == day_number,
    )
    result = await db.execute(stmt)
    day = result.scalar_one_or_none()
    if not day:
        raise HTTPException(status_code=404, detail=f"Day {day_number} 不存在")

    subject = data.subject
    if subject not in ("listening", "speaking", "reading", "writing"):
        raise HTTPException(status_code=400, detail=f"无效的科目: {subject}")

    hw_field = f"{subject}_homework_id"
    setattr(day, hw_field, data.homework_id)
    await db.commit()
    await db.refresh(day)
    return day


# ---- Unlink homework from plan day ----

@router.delete("/days/{day_number}/unlink-homework", response_model=StudyPlanDayOut)
async def unlink_homework(
    day_number: int,
    subject: str = Query(..., description="科目: listening/speaking/reading/writing"),
    db: AsyncSession = Depends(get_db),
):
    """Remove the homework link from a plan day task."""
    stmt = select(StudyPlan).where(StudyPlan.is_active == True)  # noqa: E712
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="没有进行中的学习计划")

    stmt = select(StudyPlanDay).where(
        StudyPlanDay.plan_id == plan.id,
        StudyPlanDay.day_number == day_number,
    )
    result = await db.execute(stmt)
    day = result.scalar_one_or_none()
    if not day:
        raise HTTPException(status_code=404, detail=f"Day {day_number} 不存在")

    if subject not in ("listening", "speaking", "reading", "writing"):
        raise HTTPException(status_code=400, detail=f"无效的科目: {subject}")

    setattr(day, f"{subject}_homework_id", None)
    await db.commit()
    await db.refresh(day)
    return day


# ---- Delete plan ----

@router.delete("/{plan_id}", status_code=204)
async def delete_plan(plan_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a study plan and all its days."""
    plan = await db.get(StudyPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="计划不存在")
    await db.delete(plan)
    await db.commit()
