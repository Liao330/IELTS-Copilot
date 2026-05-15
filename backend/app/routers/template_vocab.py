from __future__ import annotations

import json as _json
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.writing_template import TemplateVocab

router = APIRouter(prefix="/api/template-vocab", tags=["template-vocab"])

_CST = timezone(timedelta(hours=8))


def _today_start_cst() -> datetime:
    now_cst = datetime.now(_CST)
    if now_cst.hour < 8:
        now_cst = now_cst - timedelta(days=1)
    today_cst = now_cst.replace(hour=8, minute=0, second=0, microsecond=0)
    return today_cst.astimezone(timezone.utc).replace(tzinfo=None)


# ─── Schemas ─────────────────────────────────────────────

class VocabOut(BaseModel):
    id: str
    word_en: str
    meaning_cn: str
    example_sentence: str | None
    category: str
    sort_order: int
    status: str
    streak_days: int
    last_reviewed_at: datetime | None
    last_result: str | None
    passed_at: datetime | None

    class Config:
        from_attributes = True


class ReviewBody(BaseModel):
    result: str  # "fluent" or "hesitant"


# ─── Today ───────────────────────────────────────────────

@router.get("/today")
async def get_today(db: AsyncSession = Depends(get_db)):
    """今日待复习词汇。逻辑：
    1. 今日已复习过的 → reviewed（不再出现在pending）
    2. 之前学过(streak>0)但今天还没复习 → pending
    3. 从未学过(last_reviewed_at IS NULL) → 新词，今日上限5个
    """
    today_start = _today_start_cst()

    # 今日已复习过的 IDs
    reviewed_q = await db.execute(
        select(TemplateVocab).where(TemplateVocab.last_reviewed_at >= today_start)
    )
    reviewed = reviewed_q.scalars().all()
    reviewed_ids = {r.id for r in reviewed}

    # 之前学过但今天还没复习的（需要今天再来一遍）
    active_q = await db.execute(
        select(TemplateVocab).where(
            TemplateVocab.status == "active",
            TemplateVocab.last_reviewed_at.is_not(None),
            TemplateVocab.last_reviewed_at < today_start,
        )
    )
    pending = list(active_q.scalars().all())

    # 新词配额：今天 reviewed 中 streak_days==1 的就是今天首次学的（之前 streak 为 0 的新词）
    # streak>=2 说明昨天之前就学过的旧词，不占配额
    new_learned_today = sum(1 for r in reviewed if r.streak_days == 1)
    new_quota = max(0, 5 - new_learned_today)

    if new_quota > 0:
        fresh_q = await db.execute(
            select(TemplateVocab).where(
                TemplateVocab.status == "active",
                TemplateVocab.last_reviewed_at.is_(None),
            ).order_by(TemplateVocab.sort_order).limit(new_quota)
        )
        pending.extend(fresh_q.scalars().all())

    total_active_q = await db.execute(
        select(func.count()).select_from(TemplateVocab).where(TemplateVocab.status == "active")
    )
    total_active = total_active_q.scalar() or 0

    return {
        "pending": [VocabOut.model_validate(v) for v in pending],
        "reviewed": [VocabOut.model_validate(v) for v in reviewed],
        "total_active": total_active,
        "new_remaining": new_quota,
    }


# ─── Review ──────────────────────────────────────────────

@router.post("/{vocab_id}/review")
async def review_vocab(vocab_id: str, body: ReviewBody, db: AsyncSession = Depends(get_db)):
    v = await db.get(TemplateVocab, vocab_id)
    if not v:
        raise HTTPException(404, "词汇不存在")

    now = datetime.utcnow()
    today_start = _today_start_cst()

    # 防止同一天重复复习
    if v.last_reviewed_at and v.last_reviewed_at >= today_start:
        return VocabOut.model_validate(v)

    v.last_result = body.result
    v.last_reviewed_at = now

    if body.result == "fluent":
        v.streak_days = (v.streak_days or 0) + 1
        if v.streak_days >= 3:
            v.status = "passed"
            v.passed_at = now
    else:
        v.streak_days = 0  # 重置连续天数

    await db.commit()
    await db.refresh(v)
    return VocabOut.model_validate(v)


# ─── Seed ────────────────────────────────────────────────

@router.post("/seed")
async def seed_vocab(db: AsyncSession = Depends(get_db)):
    count_q = await db.execute(select(func.count(TemplateVocab.id)))
    count = count_q.scalar() or 0
    if count > 0:
        return {"message": f"Already has {count} vocab, skipping.", "imported": 0}

    seed_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "template_vocab_seed.json")
    if not os.path.exists(seed_path):
        raise HTTPException(500, "Seed file not found")

    with open(seed_path, "r", encoding="utf-8") as f:
        items = _json.load(f)

    sort = 0
    for item in items:
        sort += 1
        db.add(TemplateVocab(
            id=str(uuid.uuid4()),
            word_en=item["word_en"],
            meaning_cn=item["meaning_cn"],
            example_sentence=item.get("example_sentence"),
            category=item.get("category", "data"),
            sort_order=sort,
        ))

    await db.commit()
    return {"imported": len(items)}


# ─── Stats ───────────────────────────────────────────────

@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    total = (await db.execute(select(func.count()).select_from(TemplateVocab))).scalar() or 0
    active = (await db.execute(
        select(func.count()).select_from(TemplateVocab).where(TemplateVocab.status == "active")
    )).scalar() or 0
    passed = (await db.execute(
        select(func.count()).select_from(TemplateVocab).where(TemplateVocab.status == "passed")
    )).scalar() or 0
    return {"total": total, "active": active, "passed": passed}
