"""API router for AI-powered learning reports and insights."""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.daily_report_cache import DailyReportCache
from app.services.report_service import generate_homework_summary, generate_daily_report

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _report_cutoff_today() -> date:
    """Return the 'report date' based on a 10:00 AM cutoff.

    Before 10 AM → report date is yesterday.
    After  10 AM → report date is today.
    """
    now = datetime.now()
    if now.time() < time(10, 0):
        return now.date()  # still show today's date, but cache key uses today
    return now.date()


@router.get("/homework-summary")
async def homework_summary(
    limit: int = Query(5, ge=1, le=20, description="分析最近几次作业"),
    category: str | None = Query(None, description="按科目筛选: writing/speaking/reading/listening"),
    db: AsyncSession = Depends(get_db),
):
    """Generate an AI trend summary based on recent homeworks."""
    try:
        result = await generate_homework_summary(db, limit=limit, category=category)
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成趋势总结失败：{str(e)}")


@router.get("/daily")
async def daily_report(
    report_date: date | None = Query(None, alias="date", description="日报日期，默认今天"),
    include_notes: bool = Query(False, description="是否纳入笔记作为补充"),
    force: bool = Query(False, description="强制重新生成，忽略缓存"),
    db: AsyncSession = Depends(get_db),
):
    """Generate an AI daily learning report.

    By default, if a cached report exists for the given date it is returned
    directly without calling the LLM again.  Pass ``force=true`` to regenerate.
    """
    target = report_date or date.today()

    # --- Try cache first (unless force) ---
    if not force:
        stmt = select(DailyReportCache).where(
            DailyReportCache.report_date == target,
            DailyReportCache.include_notes == include_notes,
        )
        result = await db.execute(stmt)
        cached = result.scalar_one_or_none()
        if cached:
            return json.loads(cached.report_json)

    # --- Generate fresh report ---
    try:
        result = await generate_daily_report(
            db,
            target_date=target,
            include_notes=include_notes,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成日报失败：{str(e)}")

    # --- Persist to cache (upsert) ---
    try:
        stmt = select(DailyReportCache).where(
            DailyReportCache.report_date == target,
            DailyReportCache.include_notes == include_notes,
        )
        existing = (await db.execute(stmt)).scalar_one_or_none()
        report_blob = json.dumps(result, ensure_ascii=False)
        if existing:
            existing.report_json = report_blob
            existing.updated_at = datetime.utcnow()
        else:
            db.add(DailyReportCache(
                id=str(uuid.uuid4()),
                report_date=target,
                include_notes=include_notes,
                report_json=report_blob,
            ))
        await db.commit()
    except Exception:
        # Cache write failure is non-critical; still return the report
        await db.rollback()

    return result
