from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.writing_material import WritingMaterial, WritingMaterialKeyword

router = APIRouter(prefix="/api/writing-materials", tags=["writing-materials"])

_CST = timezone(timedelta(hours=8))


def _today_start_cst() -> datetime:
    now_cst = datetime.now(_CST)
    today_cst = now_cst.replace(hour=0, minute=0, second=0, microsecond=0)
    return today_cst.astimezone(timezone.utc).replace(tzinfo=None)


# ─── Schemas ───────────────────────────────────────────────

class MaterialOut(BaseModel):
    id: str
    topic: str
    topic_cn: str
    direction: str
    direction_index: int
    stance: str
    stance_label: str
    angle: str
    angle_index: int
    reasoning_chain: str
    example: str
    sort_order: int
    mastery_level: int
    review_count: int
    correct_count: int
    interval_days: int
    next_review_at: Optional[datetime]
    last_reviewed_at: Optional[datetime]
    first_learned_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class KeywordOut(BaseModel):
    id: str
    topic: str
    direction_index: int
    cn: str
    en: str
    sort_order: int
    mastery_level: int
    review_count: int
    interval_days: int
    next_review_at: Optional[datetime]
    last_reviewed_at: Optional[datetime]
    first_learned_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class ReviewRequest(BaseModel):
    quality: int  # 0=不会 1=模糊 2=会了 3=很熟


class CheckRequest(BaseModel):
    answer: str
    mode: str = "reasoning"  # "reasoning" or "example"


class CheckResponse(BaseModel):
    correct: bool
    score: int
    expected: str
    feedback: str
    mastery_level: int
    interval_days: int


class StatsOut(BaseModel):
    total: int
    mastered: int  # mastery >= 5
    learning: int  # mastery 1-4
    new_count: int  # mastery 0
    due_today: int
    learned_today: int
    topic_stats: dict  # per topic breakdown
    keyword_total: int
    keyword_mastered: int


# ─── SM-2 Helper ──────────────────────────────────────────

def _sm2_update_material(m: WritingMaterial, quality: int, max_mastery: int = 5):
    """SM-2 for materials (5-level mastery, 7-day cap)"""
    now = datetime.utcnow()

    if quality < 2:
        m.interval_days = 1
        m.ease_factor = max(1.3, (m.ease_factor or 2.5) - 0.2)
        if quality == 0:
            m.mastery_level = max(0, (m.mastery_level or 0) - 1)
    else:
        if m.review_count == 0:
            m.interval_days = 1
        elif m.review_count <= 2:
            m.interval_days = 2
        else:
            m.interval_days = min(7, max(1, int(round((m.interval_days or 1) * (m.ease_factor or 2.5)))))

        ef = (m.ease_factor or 2.5) + 0.1 - (3 - quality) * 0.08
        m.ease_factor = max(1.3, ef)
        m.mastery_level = min(max_mastery, (m.mastery_level or 0) + 1)

    m.interval_days = min(7, m.interval_days)
    m.review_count = (m.review_count or 0) + 1
    if quality >= 2:
        m.correct_count = (m.correct_count or 0) + 1
    m.next_review_at = now + timedelta(days=m.interval_days)
    m.last_reviewed_at = now
    if not m.first_learned_at:
        m.first_learned_at = now


def _sm2_update_keyword(k: WritingMaterialKeyword, quality: int):
    """SM-2 for keywords (3-level mastery, 7-day cap)"""
    now = datetime.utcnow()

    if quality < 2:
        k.interval_days = 1
        if quality == 0:
            k.mastery_level = max(0, (k.mastery_level or 0) - 1)
    else:
        if k.review_count == 0:
            k.interval_days = 1
        elif k.review_count <= 2:
            k.interval_days = 2
        else:
            k.interval_days = min(7, max(1, int(round((k.interval_days or 1) * 2.0))))
        k.mastery_level = min(2, (k.mastery_level or 0) + 1)

    k.interval_days = min(7, k.interval_days)
    k.review_count = (k.review_count or 0) + 1
    k.next_review_at = now + timedelta(days=k.interval_days)
    k.last_reviewed_at = now
    if not k.first_learned_at:
        k.first_learned_at = now


# ─── Material Endpoints ───────────────────────────────────

@router.get("", response_model=List[MaterialOut])
async def list_materials(
    topic: str | None = None,
    mastery: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(WritingMaterial).order_by(WritingMaterial.sort_order)
    if topic:
        stmt = stmt.where(WritingMaterial.topic == topic)
    if mastery is not None:
        stmt = stmt.where(WritingMaterial.mastery_level == mastery)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/stats", response_model=StatsOut)
async def get_stats(db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    today_start = _today_start_cst()

    total = (await db.execute(select(func.count()).select_from(WritingMaterial))).scalar() or 0
    mastered = (await db.execute(select(func.count()).select_from(WritingMaterial).where(WritingMaterial.mastery_level >= 5))).scalar() or 0
    learning = (await db.execute(select(func.count()).select_from(WritingMaterial).where(WritingMaterial.mastery_level.in_([1, 2, 3, 4])))).scalar() or 0
    new_count = (await db.execute(select(func.count()).select_from(WritingMaterial).where(WritingMaterial.mastery_level == 0))).scalar() or 0
    due_today = (await db.execute(select(func.count()).select_from(WritingMaterial).where(
        WritingMaterial.review_count > 0,
        or_(WritingMaterial.next_review_at.is_(None), WritingMaterial.next_review_at <= now),
    ))).scalar() or 0
    learned_today = (await db.execute(select(func.count()).select_from(WritingMaterial).where(
        WritingMaterial.first_learned_at >= today_start,
    ))).scalar() or 0

    # Per topic
    topic_stats = {}
    topics = (await db.execute(select(WritingMaterial.topic, WritingMaterial.topic_cn).distinct())).all()
    for t, t_cn in topics:
        t_total = (await db.execute(select(func.count()).select_from(WritingMaterial).where(WritingMaterial.topic == t))).scalar() or 0
        t_mastered = (await db.execute(select(func.count()).select_from(WritingMaterial).where(WritingMaterial.topic == t, WritingMaterial.mastery_level >= 5))).scalar() or 0
        topic_stats[t] = {"label": t_cn, "total": t_total, "mastered": t_mastered}

    # Keywords
    kw_total = (await db.execute(select(func.count()).select_from(WritingMaterialKeyword))).scalar() or 0
    kw_mastered = (await db.execute(select(func.count()).select_from(WritingMaterialKeyword).where(WritingMaterialKeyword.mastery_level >= 2))).scalar() or 0

    return StatsOut(
        total=total, mastered=mastered, learning=learning, new_count=new_count,
        due_today=due_today, learned_today=learned_today,
        topic_stats=topic_stats, keyword_total=kw_total, keyword_mastered=kw_mastered,
    )


@router.get("/new-today", response_model=List[MaterialOut])
async def get_new_today(limit: int = Query(4, ge=1, le=10), db: AsyncSession = Depends(get_db)):
    today_start = _today_start_cst()
    learned_today_q = await db.execute(
        select(func.count()).select_from(WritingMaterial).where(WritingMaterial.first_learned_at >= today_start)
    )
    learned_today = learned_today_q.scalar() or 0
    remaining = max(0, limit - learned_today)
    if remaining <= 0:
        return []

    stmt = (
        select(WritingMaterial)
        .where(WritingMaterial.review_count == 0)
        .order_by(WritingMaterial.sort_order)
        .limit(remaining)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/learned-today", response_model=List[MaterialOut])
async def get_learned_today(db: AsyncSession = Depends(get_db)):
    today_start = _today_start_cst()
    stmt = select(WritingMaterial).where(WritingMaterial.last_reviewed_at >= today_start).order_by(WritingMaterial.last_reviewed_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/due", response_model=List[MaterialOut])
async def get_due(limit: int = Query(20), db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    stmt = (
        select(WritingMaterial)
        .where(
            WritingMaterial.review_count > 0,
            or_(WritingMaterial.next_review_at.is_(None), WritingMaterial.next_review_at <= now),
        )
        .order_by(WritingMaterial.next_review_at.asc().nullsfirst())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/{material_id}/review", response_model=MaterialOut)
async def review_material(material_id: str, body: ReviewRequest, db: AsyncSession = Depends(get_db)):
    m = await db.get(WritingMaterial, material_id)
    if not m:
        raise HTTPException(404, "素材不存在")

    q = body.quality
    # mastery 升级有阶段限制
    # mastery 0→1: 点已看 (quality=2/3)
    # mastery 1→2: 闪卡理由链 (quality=2/3, cap at 2)
    # mastery 2→3: 闪卡关键词 (quality=2/3, cap at 3)
    # mastery 3→4 和 4→5: 只能通过 check 端点
    cap = min(3, max((m.mastery_level or 0) + 1, 1))
    _sm2_update_material(m, q, max_mastery=cap)

    await db.commit()
    await db.refresh(m)
    return m


@router.post("/{material_id}/check", response_model=CheckResponse)
async def check_material(material_id: str, body: CheckRequest, db: AsyncSession = Depends(get_db)):
    """默写检查：理由链(mastery 3→4) 或 例子(mastery 4→5)"""
    from app.services.llm_service import complete_chat
    from app.utils.llm_config import get_llm_config

    m = await db.get(WritingMaterial, material_id)
    if not m:
        raise HTTPException(404, "素材不存在")

    if body.mode == "reasoning":
        expected = m.reasoning_chain
        prompt = f"""你是雅思写作素材考核官。学生需要默写出以下理由链的核心环节。

正确答案（理由链）：{expected}
话题：{m.topic_cn} · {m.direction}
立场：{m.stance_label} · {m.angle}

学生答案：{body.answer}

评分标准：
- 写出了3个环节的核心意思（不要求完全一致原文，意思对即可） → 80-100分
- 写出了2个环节 → 60-79分
- 只写出1个环节或偏题 → 30-59分
- 完全错误 → 0-29分

输出格式（只输出JSON）：
{{"score": 数字, "feedback": "简短点评"}}"""
    else:
        expected = m.example
        prompt = f"""你是雅思写作素材考核官。学生需要回忆出以下例子的关键信息。

正确答案（例子）：{expected}
话题：{m.topic_cn} · {m.direction}
立场：{m.stance_label} · {m.angle}

学生答案：{body.answer}

评分标准：
- 写出了例子的关键信息（国家/现象/数据趋势） → 80-100分
- 部分正确（记住了国家但细节错误） → 60-79分
- 只有模糊印象 → 30-59分
- 完全错误 → 0-29分

输出格式（只输出JSON）：
{{"score": 数字, "feedback": "简短点评"}}"""

    model, api_key, api_base = await get_llm_config(db)
    raw = await complete_chat(
        model=model, api_key=api_key, api_base=api_base,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
    )

    # Parse response
    import re
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()

    try:
        data = json.loads(cleaned)
        score = int(data.get("score", 0))
        feedback = data.get("feedback", "")
    except (json.JSONDecodeError, ValueError):
        score_match = re.search(r'"score"\s*:\s*(\d+)', cleaned)
        score = int(score_match.group(1)) if score_match else 50
        feedback = "评分解析异常"

    correct = score >= 70

    if correct:
        # 升级 mastery
        if body.mode == "reasoning" and m.mastery_level == 3:
            _sm2_update_material(m, 3, max_mastery=4)
        elif body.mode == "example" and m.mastery_level == 4:
            _sm2_update_material(m, 3, max_mastery=5)
        else:
            _sm2_update_material(m, 3, max_mastery=m.mastery_level + 1)
    else:
        _sm2_update_material(m, 1, max_mastery=m.mastery_level)

    await db.commit()

    return CheckResponse(
        correct=correct, score=score, expected=expected,
        feedback=feedback, mastery_level=m.mastery_level, interval_days=m.interval_days,
    )


# ─── Keyword Endpoints ────────────────────────────────────

@router.get("/keywords", response_model=List[KeywordOut])
async def list_keywords(
    topic: str | None = None,
    direction_index: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(WritingMaterialKeyword).order_by(WritingMaterialKeyword.topic, WritingMaterialKeyword.direction_index, WritingMaterialKeyword.sort_order)
    if topic:
        stmt = stmt.where(WritingMaterialKeyword.topic == topic)
    if direction_index is not None:
        stmt = stmt.where(WritingMaterialKeyword.direction_index == direction_index)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/keywords/due", response_model=List[KeywordOut])
async def get_keywords_due(limit: int = Query(20), db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    stmt = (
        select(WritingMaterialKeyword)
        .where(
            WritingMaterialKeyword.review_count > 0,
            or_(WritingMaterialKeyword.next_review_at.is_(None), WritingMaterialKeyword.next_review_at <= now),
        )
        .order_by(WritingMaterialKeyword.next_review_at.asc().nullsfirst())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/keywords/{keyword_id}/review", response_model=KeywordOut)
async def review_keyword(keyword_id: str, body: ReviewRequest, db: AsyncSession = Depends(get_db)):
    k = await db.get(WritingMaterialKeyword, keyword_id)
    if not k:
        raise HTTPException(404, "关键词不存在")
    _sm2_update_keyword(k, body.quality)
    await db.commit()
    await db.refresh(k)
    return k


# ─── Seed Endpoint ────────────────────────────────────────

@router.post("/seed")
async def seed_materials(db: AsyncSession = Depends(get_db)):
    """一次性导入全部素材数据。如果已有数据则跳过。"""
    existing = (await db.execute(select(func.count()).select_from(WritingMaterial))).scalar() or 0
    if existing > 0:
        return {"message": f"已有 {existing} 条素材，跳过导入", "imported": 0}

    from app.data.writing_materials_seed import MATERIALS_DATA, KEYWORDS_DATA

    sort = 0
    for item in MATERIALS_DATA:
        sort += 1
        db.add(WritingMaterial(
            id=str(uuid.uuid4()),
            topic=item["topic"],
            topic_cn=item["topic_cn"],
            direction=item["direction"],
            direction_index=item["direction_index"],
            stance=item["stance"],
            stance_label=item["stance_label"],
            angle=item["angle"],
            angle_index=item["angle_index"],
            reasoning_chain=item["reasoning_chain"],
            example=item["example"],
            sort_order=sort,
        ))

    kw_sort = 0
    for kw in KEYWORDS_DATA:
        kw_sort += 1
        db.add(WritingMaterialKeyword(
            id=str(uuid.uuid4()),
            topic=kw["topic"],
            direction_index=kw["direction_index"],
            cn=kw["cn"],
            en=kw["en"],
            sort_order=kw_sort,
        ))

    await db.commit()
    return {"message": f"导入完成", "imported_materials": sort, "imported_keywords": kw_sort}
