from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from pydantic import BaseModel

from app.database import get_db
from app.models.writing_template import WritingTemplate

router = APIRouter(prefix="/api/writing-templates", tags=["writing-templates"])


# ─── Schemas ───────────────────────────────────────────────

class TemplateOut(BaseModel):
    id: str
    category: str
    sub_category: str
    scene_cn: str
    template_en: str
    example_en: Optional[str]
    note: Optional[str]
    difficulty: int
    sort_order: int
    mastery_level: int
    review_count: int
    correct_count: int
    interval_days: int
    next_review_at: Optional[datetime]
    last_reviewed_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class TemplateCreate(BaseModel):
    category: str
    sub_category: str
    scene_cn: str
    template_en: str
    example_en: Optional[str] = None
    note: Optional[str] = None
    difficulty: int = 1
    sort_order: int = 0


class CheckRequest(BaseModel):
    answer: str


class CheckResponse(BaseModel):
    correct: bool
    score: int
    expected: str
    feedback: str
    mastery_level: int
    interval_days: int


class ReviewRequest(BaseModel):
    quality: int  # 0=不会 3=会


class StatsOut(BaseModel):
    total: int
    mastered: int  # mastery >= 3
    learning: int  # mastery 1-2
    new_count: int  # mastery 0
    due_today: int
    learned_today: int  # 今日已学数
    category_stats: dict  # {category: {total, mastered, due, remaining_new}}


# ─── Endpoints ─────────────────────────────────────────────

@router.get("/", response_model=List[TemplateOut])
async def list_templates(
    category: Optional[str] = None,
    sub_category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(WritingTemplate).order_by(WritingTemplate.category, WritingTemplate.sort_order)
    if category:
        stmt = stmt.where(WritingTemplate.category == category)
    if sub_category:
        stmt = stmt.where(WritingTemplate.sub_category == sub_category)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=TemplateOut, status_code=201)
async def create_template(data: TemplateCreate, db: AsyncSession = Depends(get_db)):
    t = WritingTemplate(
        id=str(uuid.uuid4()),
        **data.model_dump(),
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@router.post("/batch", response_model=dict)
async def batch_import(items: List[TemplateCreate], db: AsyncSession = Depends(get_db)):
    created = 0
    for data in items:
        t = WritingTemplate(id=str(uuid.uuid4()), **data.model_dump())
        db.add(t)
        created += 1
    await db.commit()
    return {"created": created}


@router.get("/due", response_model=List[TemplateOut])
async def get_due_templates(
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """获取今日待复习的句型（间隔重复到期）"""
    now = datetime.utcnow()
    stmt = (
        select(WritingTemplate)
        .where(
            WritingTemplate.review_count > 0,  # 至少看过一次
            or_(
                WritingTemplate.next_review_at.is_(None),
                WritingTemplate.next_review_at <= now,
            ),
        )
        .order_by(WritingTemplate.next_review_at.asc().nullsfirst())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/new-today", response_model=List[TemplateOut])
async def get_new_today(
    limit: int = Query(5, ge=1, le=15),
    db: AsyncSession = Depends(get_db),
):
    """获取今日新学句型。按4周背诵计划推送对应分类，每天限 limit 条新的。"""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # 今天已经学过的新句型数量
    learned_today_q = await db.execute(
        select(func.count()).select_from(WritingTemplate).where(
            WritingTemplate.review_count == 1,
            WritingTemplate.last_reviewed_at >= today_start,
        )
    )
    learned_today = learned_today_q.scalar() or 0
    remaining = max(0, limit - learned_today)
    if remaining <= 0:
        return []

    # 按背诵计划推送：优先推还有未学句型的分类
    # Week 1: data(趋势类) → Week 2: data(其他) → Week 3: map+process → Week 4: essay
    # 简化：按 data → map → process → essay 的顺序，每个分类内先完成再下一个
    priority_order = ["data", "map", "process", "essay"]

    results = []
    for cat in priority_order:
        if len(results) >= remaining:
            break
        stmt = (
            select(WritingTemplate)
            .where(WritingTemplate.review_count == 0, WritingTemplate.category == cat)
            .order_by(WritingTemplate.sort_order, WritingTemplate.created_at)
            .limit(remaining - len(results))
        )
        r = await db.execute(stmt)
        results.extend(r.scalars().all())

    return results


@router.get("/learned-today", response_model=List[TemplateOut])
async def get_learned_today(db: AsyncSession = Depends(get_db)):
    """获取今日已学过的句型（含今天新学 + 今天复习的）"""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    stmt = (
        select(WritingTemplate)
        .where(WritingTemplate.last_reviewed_at >= today_start)
        .order_by(WritingTemplate.last_reviewed_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/{template_id}/check", response_model=CheckResponse)
async def check_answer(template_id: str, body: CheckRequest, db: AsyncSession = Depends(get_db)):
    """提交默写答案，AI 判分"""
    t = await db.get(WritingTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="句型不存在")

    # AI 判分
    from app.services.llm_service import complete_chat
    from app.utils.llm_config import get_llm_config

    model, api_key, api_base = await get_llm_config(db)
    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 API Key")

    prompt = f"""你是雅思写作句型检验助手。学生需要背诵一个英文句型模板，现在默写了一个版本，请判断是否正确。

标准答案：{t.template_en}
学生答案：{body.answer}
场景提示：{t.scene_cn}

评分规则：
1. 核心结构正确（主要句式骨架一致）：60分
2. 关键词覆盖（重要的动词/连接词/固定搭配到位）：30分
3. 语法无误：10分
4. 允许占位符不同（如[主语]写成具体词也行）
5. 允许同义替换（如 dramatic→sharp, rise→increase）
6. 不要求标点和大小写完全一致

输出严格 JSON 格式：
{{"score": 85, "correct": true, "feedback": "核心结构正确，关键词覆盖完整。注意: rise可替换为increase"}}

score >= 70 则 correct=true，否则 correct=false。
feedback 用中文，一句话点评（不超过50字）。只输出JSON。"""

    try:
        raw = await complete_chat(
            model=model, api_key=api_key, api_base=api_base,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            cleaned = "\n".join(lines).strip()
        result = json.loads(cleaned)
        score = result.get("score", 0)
        correct = result.get("correct", score >= 70)
        feedback = result.get("feedback", "")
    except Exception:
        # Fallback: simple string similarity
        from difflib import SequenceMatcher
        ratio = SequenceMatcher(None, body.answer.lower().strip(), t.template_en.lower()).ratio()
        score = int(ratio * 100)
        correct = score >= 70
        feedback = "AI 判分暂时不可用，使用文本相似度匹配"

    # SM-2 update
    quality = 3 if correct else 0
    _sm2_update(t, quality)
    await db.commit()

    return CheckResponse(
        correct=correct,
        score=score,
        expected=t.template_en,
        feedback=feedback,
        mastery_level=t.mastery_level,
        interval_days=t.interval_days,
    )


@router.post("/{template_id}/review", response_model=TemplateOut)
async def review_template(template_id: str, body: ReviewRequest, db: AsyncSession = Depends(get_db)):
    """认知测试/闪卡结果 — 标记会或不会"""
    t = await db.get(WritingTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="句型不存在")

    quality = 3 if body.quality >= 2 else 0
    _sm2_update(t, quality)
    await db.commit()
    await db.refresh(t)
    return t


@router.get("/stats", response_model=StatsOut)
async def get_stats(db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    total = (await db.execute(select(func.count()).select_from(WritingTemplate))).scalar() or 0
    mastered = (await db.execute(select(func.count()).select_from(WritingTemplate).where(WritingTemplate.mastery_level >= 3))).scalar() or 0
    learning = (await db.execute(select(func.count()).select_from(WritingTemplate).where(WritingTemplate.mastery_level.in_([1, 2])))).scalar() or 0
    new_count = (await db.execute(select(func.count()).select_from(WritingTemplate).where(WritingTemplate.review_count == 0))).scalar() or 0
    due_today = (await db.execute(select(func.count()).select_from(WritingTemplate).where(
        WritingTemplate.review_count > 0,
        or_(WritingTemplate.next_review_at.is_(None), WritingTemplate.next_review_at <= now),
    ))).scalar() or 0
    learned_today = (await db.execute(select(func.count()).select_from(WritingTemplate).where(
        WritingTemplate.last_reviewed_at >= today_start,
    ))).scalar() or 0

    # Per category with remaining new count
    category_stats = {}
    for cat in ["data", "map", "process", "essay"]:
        cat_total = (await db.execute(select(func.count()).select_from(WritingTemplate).where(WritingTemplate.category == cat))).scalar() or 0
        cat_mastered = (await db.execute(select(func.count()).select_from(WritingTemplate).where(WritingTemplate.category == cat, WritingTemplate.mastery_level >= 3))).scalar() or 0
        cat_due = (await db.execute(select(func.count()).select_from(WritingTemplate).where(
            WritingTemplate.category == cat,
            WritingTemplate.review_count > 0,
            or_(WritingTemplate.next_review_at.is_(None), WritingTemplate.next_review_at <= now),
        ))).scalar() or 0
        cat_remaining = (await db.execute(select(func.count()).select_from(WritingTemplate).where(
            WritingTemplate.category == cat, WritingTemplate.review_count == 0,
        ))).scalar() or 0
        category_stats[cat] = {"total": cat_total, "mastered": cat_mastered, "due": cat_due, "remaining_new": cat_remaining}

    return StatsOut(
        total=total, mastered=mastered, learning=learning,
        new_count=new_count, due_today=due_today, learned_today=learned_today,
        category_stats=category_stats,
    )


# ─── SM-2 Helper ──────────────────────────────────────────

def _sm2_update(t: WritingTemplate, quality: int):
    """Update spaced repetition fields. quality: 0=fail, 3=pass."""
    now = datetime.utcnow()

    if quality < 2:
        t.interval_days = 1
        t.ease_factor = max(1.3, (t.ease_factor or 2.5) - 0.2)
        t.mastery_level = max(0, (t.mastery_level or 0) - 1)
    else:
        if t.review_count == 0:
            t.interval_days = 1
        elif t.review_count == 1:
            t.interval_days = 3
        else:
            t.interval_days = max(1, int(round((t.interval_days or 1) * (t.ease_factor or 2.5))))

        ef = (t.ease_factor or 2.5) + 0.1 - (3 - quality) * 0.08
        t.ease_factor = max(1.3, ef)
        t.mastery_level = min(3, (t.mastery_level or 0) + 1)

    t.review_count = (t.review_count or 0) + 1
    if quality >= 2:
        t.correct_count = (t.correct_count or 0) + 1
    t.next_review_at = now + timedelta(days=t.interval_days)
    t.last_reviewed_at = now
