from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.speaking_correction import SpeakingCorrection

router = APIRouter(prefix="/api/speaking-corrections", tags=["speaking-corrections"])


def _today_date_cst() -> str:
    cst = timezone(timedelta(hours=8))
    return datetime.now(cst).strftime("%Y-%m-%d")


def _today_start_cst() -> datetime:
    """系统以每天CST 8:00为新的一天"""
    cst = timezone(timedelta(hours=8))
    now_cst = datetime.now(cst)
    if now_cst.hour < 8:
        now_cst = now_cst - timedelta(days=1)
    start_cst = now_cst.replace(hour=8, minute=0, second=0, microsecond=0)
    return start_cst.astimezone(timezone.utc).replace(tzinfo=None)


# ─── Schemas ───

class CorrectionCreate(BaseModel):
    correct_text: str
    error_type: str = "grammar"


class BatchImportBody(BaseModel):
    text: str  # 用户粘贴的原始文本


class CorrectionOut(BaseModel):
    id: str
    correct_text: str
    error_type: str
    status: str
    streak_days: int
    last_reviewed_at: str | None
    last_result: str | None
    created_at: str
    passed_at: str | None


class ReviewBody(BaseModel):
    result: str  # "fluent" or "hesitant"


def _serialize(c: SpeakingCorrection) -> dict:
    return {
        "id": c.id,
        "correct_text": c.correct_text,
        "error_type": c.error_type,
        "status": c.status,
        "streak_days": c.streak_days,
        "last_reviewed_at": c.last_reviewed_at.isoformat() if c.last_reviewed_at else None,
        "last_result": c.last_result,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "passed_at": c.passed_at.isoformat() if c.passed_at else None,
    }


# ─── Endpoints ───

@router.post("")
async def create_correction(body: CorrectionCreate, db: AsyncSession = Depends(get_db)):
    """新增口语纠错条目"""
    if not body.correct_text.strip():
        raise HTTPException(status_code=400, detail="correct_text is required")
    c = SpeakingCorrection(
        id=str(uuid.uuid4()),
        correct_text=body.correct_text.strip(),
        error_type=body.error_type,
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return _serialize(c)


@router.post("/batch-import")
async def batch_import(body: BatchImportBody, db: AsyncSession = Depends(get_db)):
    """AI解析用户粘贴的纠错文本，批量导入。支持多种格式。"""
    from app.services.llm_service import complete_chat
    from app.utils.llm_config import get_llm_config
    import json as _json

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    model, api_key, api_base = await get_llm_config(db)
    if not api_key:
        raise HTTPException(status_code=500, detail="LLM not configured")

    prompt = f"""从以下文本中提取"口语纠错"条目（即学生说错了，有Wrong和Corrected对照的部分）。

注意：只提取纠错类（有错误原文→正确版本的），不要提取"降级表达"类（即"你想表达→Natural English"的部分，那些不是纠错）。

错误类型只能是以下之一：grammar（语法错误）、vocabulary（用词错误）、pronunciation（发音错误）、expression（表达不地道）

文本：
{text}

输出格式（只输出JSON数组，如果没有纠错条目则输出空数组[]）：
[{{"correct_text": "正确的英文句子", "error_type": "grammar/vocabulary/pronunciation/expression"}}]

规则：
- 只提取"Corrected version"或类似的正确版本
- 根据"Why it's wrong"的描述判断 error_type
- 如果判断不出类型，默认用 grammar"""

    raw = await complete_chat(
        model=model, api_key=api_key, api_base=api_base,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
    )

    # Parse
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()

    try:
        items = _json.loads(cleaned)
    except _json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="AI解析失败，请检查格式")

    created = []
    for item in items:
        correct_text = item.get("correct_text", "").strip()
        error_type = item.get("error_type", "grammar")
        if not correct_text:
            continue
        if error_type not in ("grammar", "vocabulary", "pronunciation", "expression"):
            error_type = "grammar"
        c = SpeakingCorrection(
            id=str(uuid.uuid4()),
            correct_text=correct_text,
            error_type=error_type,
        )
        db.add(c)
        created.append(c)

    await db.commit()
    return {"imported": len(created), "items": [_serialize(c) for c in created]}


@router.get("")
async def list_corrections(status: str | None = None, db: AsyncSession = Depends(get_db)):
    """列表，支持 status=active/passed 筛选"""
    q = select(SpeakingCorrection).order_by(SpeakingCorrection.created_at.desc())
    if status:
        q = q.where(SpeakingCorrection.status == status)
    result = await db.execute(q)
    return [_serialize(c) for c in result.scalars().all()]


@router.get("/today")
async def get_today_review(db: AsyncSession = Depends(get_db)):
    """今日需要复习的条目（status=active，且今天尚未复习过）"""
    today_start = _today_start_cst()
    q = select(SpeakingCorrection).where(
        SpeakingCorrection.status == "active",
    ).order_by(SpeakingCorrection.created_at)
    result = await db.execute(q)
    items = result.scalars().all()
    # 过滤掉今天已复习的
    today_items = [c for c in items if not c.last_reviewed_at or c.last_reviewed_at < today_start]
    # 也返回今天已复习的（用于展示完成状态）
    reviewed_today = [c for c in items if c.last_reviewed_at and c.last_reviewed_at >= today_start]
    return {
        "pending": [_serialize(c) for c in today_items],
        "reviewed": [_serialize(c) for c in reviewed_today],
        "total_active": len(items),
    }


@router.post("/{correction_id}/review")
async def review_correction(correction_id: str, body: ReviewBody, db: AsyncSession = Depends(get_db)):
    """复习结果：fluent（脱口而出）或 hesitant（还要想）"""
    q = await db.execute(
        select(SpeakingCorrection).where(SpeakingCorrection.id == correction_id)
    )
    c = q.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")

    now = datetime.utcnow()
    c.last_reviewed_at = now
    c.last_result = body.result

    if body.result == "fluent":
        c.streak_days = (c.streak_days or 0) + 1
        # 连续3天过关
        if c.streak_days >= 3:
            c.status = "passed"
            c.passed_at = now
    else:
        c.streak_days = 0

    await db.commit()
    await db.refresh(c)
    return _serialize(c)


@router.delete("/{correction_id}")
async def delete_correction(correction_id: str, db: AsyncSession = Depends(get_db)):
    q = await db.execute(
        select(SpeakingCorrection).where(SpeakingCorrection.id == correction_id)
    )
    c = q.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(c)
    await db.commit()
    return {"ok": True}


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """统计数据"""
    total_q = await db.execute(select(func.count(SpeakingCorrection.id)))
    total = total_q.scalar() or 0

    active_q = await db.execute(
        select(func.count(SpeakingCorrection.id)).where(SpeakingCorrection.status == "active")
    )
    active = active_q.scalar() or 0

    passed_q = await db.execute(
        select(func.count(SpeakingCorrection.id)).where(SpeakingCorrection.status == "passed")
    )
    passed = passed_q.scalar() or 0

    # 各错误类型分布
    type_q = await db.execute(
        select(SpeakingCorrection.error_type, func.count(SpeakingCorrection.id))
        .group_by(SpeakingCorrection.error_type)
    )
    by_type = {row[0]: row[1] for row in type_q.all()}

    # 平均过关天数（已过关条目从创建到过关的天数）
    passed_items_q = await db.execute(
        select(SpeakingCorrection).where(SpeakingCorrection.status == "passed")
    )
    passed_items = passed_items_q.scalars().all()
    if passed_items:
        avg_days = sum(
            (c.passed_at - c.created_at).days for c in passed_items if c.passed_at
        ) / len(passed_items)
    else:
        avg_days = 0

    # 近7天每日新增和过关数
    today_start = _today_start_cst()
    week_ago = today_start - timedelta(days=7)
    recent_q = await db.execute(
        select(SpeakingCorrection).where(SpeakingCorrection.created_at >= week_ago)
    )
    recent = recent_q.scalars().all()
    daily_new: dict[str, int] = {}
    daily_passed: dict[str, int] = {}
    for c in recent:
        day = c.created_at.strftime("%m-%d") if c.created_at else ""
        daily_new[day] = daily_new.get(day, 0) + 1
    for c in passed_items:
        if c.passed_at and c.passed_at >= week_ago:
            day = c.passed_at.strftime("%m-%d")
            daily_passed[day] = daily_passed.get(day, 0) + 1

    return {
        "total": total,
        "active": active,
        "passed": passed,
        "by_type": by_type,
        "avg_pass_days": round(avg_days, 1),
        "daily_new": daily_new,
        "daily_passed": daily_passed,
    }
