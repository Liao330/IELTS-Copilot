from __future__ import annotations

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete

from app.database import get_db
from app.models.schedule import ScheduleTask
from app.services.study_plan_generator import generate_phase3_tasks, PLAN_SOURCE

router = APIRouter(prefix="/api/study-plan", tags=["study-plan"])

PLAN_START = date(2026, 5, 6)
PLAN_END = date(2026, 6, 28)


@router.post("/generate")
async def generate_plan(db: AsyncSession = Depends(get_db)):
    """一次性生成第三阶段备考计划（54天）。已存在则返回 409。"""
    # Check if plan already exists
    count_q = await db.execute(
        select(func.count(ScheduleTask.id)).where(ScheduleTask.source == PLAN_SOURCE)
    )
    existing = count_q.scalar() or 0
    if existing > 0:
        raise HTTPException(status_code=409, detail=f"计划已存在（{existing}条任务）。如需重新生成请先重置。")

    # Generate tasks
    task_dicts = generate_phase3_tasks(PLAN_START, PLAN_END)

    # Batch insert
    for d in task_dicts:
        task = ScheduleTask(
            id=str(uuid.uuid4()),
            title=d["title"],
            description=d.get("description"),
            category=d.get("category"),
            scheduled_date=date.fromisoformat(d["scheduled_date"]),
            start_time=d.get("start_time"),
            duration_minutes=d.get("duration_minutes"),
            sort_order=d.get("sort_order", 0),
            source=d.get("source"),
            plan_tag=d.get("plan_tag"),
        )
        db.add(task)

    await db.commit()

    return {
        "total_tasks": len(task_dicts),
        "days": (PLAN_END - PLAN_START).days + 1,
        "message": f"已生成 {len(task_dicts)} 条备考任务 ({PLAN_START} → {PLAN_END})",
    }


@router.get("/status")
async def get_status(db: AsyncSession = Depends(get_db)):
    """获取备考计划状态"""
    count_q = await db.execute(
        select(func.count(ScheduleTask.id)).where(ScheduleTask.source == PLAN_SOURCE)
    )
    total = count_q.scalar() or 0

    if total == 0:
        return {
            "exists": False,
            "start_date": PLAN_START.isoformat(),
            "end_date": PLAN_END.isoformat(),
            "total_tasks": 0,
            "total_days": (PLAN_END - PLAN_START).days + 1,
            "current_day": 0,
            "days_remaining": 0,
            "completed_tasks": 0,
            "completion_pct": 0,
        }

    done_q = await db.execute(
        select(func.count(ScheduleTask.id)).where(
            ScheduleTask.source == PLAN_SOURCE,
            ScheduleTask.done == True,
        )
    )
    done = done_q.scalar() or 0

    today = date.today()
    if today < PLAN_START:
        current_day = 0
        days_remaining = (PLAN_END - PLAN_START).days + 1
    elif today > PLAN_END:
        current_day = (PLAN_END - PLAN_START).days + 1
        days_remaining = 0
    else:
        current_day = (today - PLAN_START).days + 1
        days_remaining = (PLAN_END - today).days

    return {
        "exists": True,
        "start_date": PLAN_START.isoformat(),
        "end_date": PLAN_END.isoformat(),
        "total_tasks": total,
        "total_days": (PLAN_END - PLAN_START).days + 1,
        "current_day": current_day,
        "days_remaining": days_remaining,
        "completed_tasks": done,
        "completion_pct": round(done / total * 100, 1) if total > 0 else 0,
    }


@router.get("/progress")
async def get_progress(db: AsyncSession = Depends(get_db)):
    """获取各科目进度详情"""
    # Overall
    total_q = await db.execute(
        select(func.count(ScheduleTask.id)).where(ScheduleTask.source == PLAN_SOURCE)
    )
    total = total_q.scalar() or 0
    done_q = await db.execute(
        select(func.count(ScheduleTask.id)).where(
            ScheduleTask.source == PLAN_SOURCE,
            ScheduleTask.done == True,
        )
    )
    done = done_q.scalar() or 0

    # By category
    by_category = {}
    for cat in ["writing", "speaking", "reading", "listening", "vocabulary", "other"]:
        cat_total_q = await db.execute(
            select(func.count(ScheduleTask.id)).where(
                ScheduleTask.source == PLAN_SOURCE,
                ScheduleTask.category == cat,
            )
        )
        cat_total = cat_total_q.scalar() or 0
        cat_done_q = await db.execute(
            select(func.count(ScheduleTask.id)).where(
                ScheduleTask.source == PLAN_SOURCE,
                ScheduleTask.category == cat,
                ScheduleTask.done == True,
            )
        )
        cat_done = cat_done_q.scalar() or 0
        if cat_total > 0:
            by_category[cat] = {
                "total": cat_total,
                "done": cat_done,
                "pct": round(cat_done / cat_total * 100, 1),
            }

    # Milestones (count by plan_tag pattern)
    async def _count_tag_pattern(pattern: str, done_only: bool = False):
        stmt = select(func.count(ScheduleTask.id)).where(
            ScheduleTask.source == PLAN_SOURCE,
            ScheduleTask.plan_tag.like(f"{pattern}%"),
        )
        if done_only:
            stmt = stmt.where(ScheduleTask.done == True)
        r = await db.execute(stmt)
        return r.scalar() or 0

    milestones = {
        "writing_big_done": await _count_tag_pattern("大作文#", True),
        "writing_big_total": await _count_tag_pattern("大作文#"),
        "writing_small_done": await _count_tag_pattern("小作文#", True),
        "writing_small_total": await _count_tag_pattern("小作文#"),
        "speaking_done": await _count_tag_pattern("口语录音#", True),
        "speaking_total": await _count_tag_pattern("口语录音#"),
        "listening_done": await _count_tag_pattern("听力套题#", True),
        "listening_total": await _count_tag_pattern("听力套题#"),
        "reading_done": await _count_tag_pattern("阅读套题#", True),
        "reading_total": await _count_tag_pattern("阅读套题#"),
        "templates_done": await _count_tag_pattern("句型Day", True),
        "templates_total": await _count_tag_pattern("句型Day"),
    }

    return {
        "overall": {"total": total, "done": done, "pct": round(done / total * 100, 1) if total > 0 else 0},
        "by_category": by_category,
        "milestones": milestones,
    }


@router.delete("/reset")
async def reset_plan(db: AsyncSession = Depends(get_db)):
    """删除所有备考计划任务（可重新生成）"""
    result = await db.execute(
        delete(ScheduleTask).where(ScheduleTask.source == PLAN_SOURCE)
    )
    await db.commit()
    return {"ok": True, "deleted": result.rowcount}


@router.get("/quote")
async def get_daily_quote():
    """代理获取每日励志语录（避免前端 CORS 问题）"""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get("https://zenquotes.io/api/today")
            data = resp.json()
            if data and data[0].get("q"):
                return {"q": data[0]["q"], "a": data[0]["a"]}
    except Exception:
        pass
    return {"q": "The secret of getting ahead is getting started.", "a": "Mark Twain"}
