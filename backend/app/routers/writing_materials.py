from __future__ import annotations

import json
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.writing_material import WritingMaterial, WritingMaterialKeyword, DowngradeAttempt

router = APIRouter(prefix="/api/writing-materials", tags=["writing-materials"])

_CST = timezone(timedelta(hours=8))


def _next_review_time(interval_days: int) -> datetime:
    """计算下次复习时间：对齐到 CST 8:00 日界线。返回 UTC naive datetime。"""
    now_cst = datetime.now(_CST)
    if now_cst.hour < 8:
        today_start_cst = (now_cst - timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
    else:
        today_start_cst = now_cst.replace(hour=8, minute=0, second=0, microsecond=0)
    next_cst = today_start_cst + timedelta(days=interval_days)
    return next_cst.astimezone(timezone.utc).replace(tzinfo=None)


def _today_start_cst() -> datetime:
    """系统以每天CST 8:00为新的一天"""
    now_cst = datetime.now(_CST)
    if now_cst.hour < 8:
        now_cst = now_cst - timedelta(days=1)
    today_cst = now_cst.replace(hour=8, minute=0, second=0, microsecond=0)
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
    topic_sentence: Optional[str]
    topic_sentence_en: Optional[str]
    reasoning_chain: str
    reasoning_chain_en: Optional[str]
    chain_sentence_en: Optional[str]
    example: str
    example_en: Optional[str]
    memory_anchor: Optional[str]
    reuse_hint: Optional[str]
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


class MaterialUpdateRequest(BaseModel):
    topic_sentence: Optional[str] = None
    topic_sentence_en: Optional[str] = None
    reasoning_chain: Optional[str] = None
    reasoning_chain_en: Optional[str] = None
    chain_sentence_en: Optional[str] = None
    example: Optional[str] = None
    example_en: Optional[str] = None


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
    tomorrow_due: int
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
    m.next_review_at = _next_review_time(m.interval_days)
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
    k.next_review_at = _next_review_time(k.interval_days)
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


@router.patch("/{material_id}", response_model=MaterialOut)
async def update_material(material_id: str, body: MaterialUpdateRequest, db: AsyncSession = Depends(get_db)):
    """手动编辑素材内容（观点句、理由链、例子的中英文）"""
    m = await db.get(WritingMaterial, material_id)
    if not m:
        raise HTTPException(404, "素材不存在")

    for field in ("topic_sentence", "topic_sentence_en", "reasoning_chain", "reasoning_chain_en", "chain_sentence_en", "example", "example_en"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(m, field, val)

    await db.commit()
    await db.refresh(m)
    return m


@router.post("/batch-generate-topic-sentences")
async def batch_generate_topic_sentences(db: AsyncSession = Depends(get_db)):
    """批量使用 qwen-max 为素材生成观点句（TEE结构中的T）"""
    from app.services.llm_service import complete_chat
    from app.utils.llm_config import get_llm_config

    result = await db.execute(
        select(WritingMaterial).where(
            or_(WritingMaterial.topic_sentence.is_(None), WritingMaterial.topic_sentence == "")
        ).order_by(WritingMaterial.sort_order).limit(10)
    )
    items = result.scalars().all()
    if not items:
        return {"generated": 0, "message": "全部素材已有观点句", "remaining": 0}

    _, api_key, api_base = await get_llm_config(db)
    model = "openai/qwen-max"  # 使用语言表达能力最强的模型

    prompt = """你是一位雅思写作教练。我正在整理大作文素材库，每条素材采用 TEE 结构：
- T (Topic Sentence): 观点句，段落首句，概括该角度的核心论点
- E (Explanation): 理由链，用 → 连接的逻辑推理
- E (Example): 具体例子

现在需要你为以下素材生成 Topic Sentence（观点句）。要求：
1. 观点句应简洁有力，一句话概括该角度的核心论点
2. 适合作为雅思大作文段落的首句
3. 同时给出中文和英文版本
4. 英文版本要求语法正确、表达地道，适合 6.5-7.5 分水平

素材列表：
"""
    for i, m in enumerate(items):
        prompt += f"\n{i+1}. 话题：{m.topic_cn} · {m.direction}\n   立场：{m.stance_label} · 角度：{m.angle}\n   理由链(Explanation)：{m.reasoning_chain}\n   例子(Example)：{m.example}\n"

    prompt += '\n\n请输出 JSON 数组，格式：[{"topic_sentence": "中文观点句", "topic_sentence_en": "English topic sentence"}, ...]'

    raw = await complete_chat(
        model=model, api_key=api_key, api_base=api_base,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()

    try:
        results_data = json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        return {"generated": 0, "message": "AI response parse failed", "raw": cleaned[:300]}

    count = 0
    for i, m in enumerate(items):
        if i < len(results_data):
            t = results_data[i]
            if t.get("topic_sentence"):
                m.topic_sentence = t["topic_sentence"]
            if t.get("topic_sentence_en"):
                m.topic_sentence_en = t["topic_sentence_en"]
            count += 1

    await db.commit()
    remaining = (await db.execute(
        select(func.count()).select_from(WritingMaterial).where(
            or_(WritingMaterial.topic_sentence.is_(None), WritingMaterial.topic_sentence == "")
        )
    )).scalar() or 0
    return {"generated": count, "remaining": remaining}


@router.get("/stats", response_model=StatsOut)
async def get_stats(db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    today_start = _today_start_cst()
    # 今天结束 = 明天CST 8:00 对应的UTC
    now_cst = datetime.now(_CST)
    if now_cst.hour < 8:
        today_end_utc = now_cst.replace(hour=8, minute=0, second=0, microsecond=0).astimezone(timezone.utc).replace(tzinfo=None)
    else:
        today_end_utc = (now_cst + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0).astimezone(timezone.utc).replace(tzinfo=None)
    tomorrow_end_utc = today_end_utc + timedelta(days=1)

    total = (await db.execute(select(func.count()).select_from(WritingMaterial))).scalar() or 0
    mastered = (await db.execute(select(func.count()).select_from(WritingMaterial).where(WritingMaterial.mastery_level >= 5))).scalar() or 0
    learning = (await db.execute(select(func.count()).select_from(WritingMaterial).where(WritingMaterial.mastery_level.in_([1, 2, 3, 4])))).scalar() or 0
    new_count = (await db.execute(select(func.count()).select_from(WritingMaterial).where(WritingMaterial.mastery_level == 0))).scalar() or 0
    due_today = (await db.execute(select(func.count()).select_from(WritingMaterial).where(
        WritingMaterial.review_count > 0,
        or_(WritingMaterial.next_review_at.is_(None), WritingMaterial.next_review_at <= today_end_utc),
    ))).scalar() or 0
    tomorrow_due = (await db.execute(select(func.count()).select_from(WritingMaterial).where(
        WritingMaterial.review_count > 0,
        WritingMaterial.next_review_at > today_end_utc,
        WritingMaterial.next_review_at <= tomorrow_end_utc,
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
        due_today=due_today, tomorrow_due=tomorrow_due, learned_today=learned_today,
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
    """获取今日待复习素材（到今天结束前到期的都算）"""
    now_cst = datetime.now(_CST)
    if now_cst.hour < 8:
        today_end_cst = now_cst.replace(hour=8, minute=0, second=0, microsecond=0)
    else:
        today_end_cst = (now_cst + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
    today_end_utc = today_end_cst.astimezone(timezone.utc).replace(tzinfo=None)
    stmt = (
        select(WritingMaterial)
        .where(
            WritingMaterial.review_count > 0,
            or_(WritingMaterial.next_review_at.is_(None), WritingMaterial.next_review_at <= today_end_utc),
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
    # mastery 升级体系（新版）:
    # 0→1: 今日学习点已看
    # 1→2: L1角度回忆通过（通过 l1-pass 端点批量升级）
    # 2→3: 素材闪卡通过 (quality>=2, cap at 3)
    # 3→4 和 4→5: 只能通过 check 端点（默写测试）
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
async def get_keywords_due(limit: int = Query(20), include_new: int = Query(5), db: AsyncSession = Depends(get_db)):
    """获取今日待复习关键词（到今天结束前到期的都算）+ 新词"""
    # Calculate today_end_utc using CST 8:00 boundary (same as /due endpoint)
    now_cst = datetime.now(_CST)
    if now_cst.hour < 8:
        today_end_utc = now_cst.replace(hour=8, minute=0, second=0, microsecond=0).astimezone(timezone.utc).replace(tzinfo=None)
    else:
        today_end_utc = (now_cst + timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0).astimezone(timezone.utc).replace(tzinfo=None)

    # 已学过且到期的
    stmt = (
        select(WritingMaterialKeyword)
        .where(
            WritingMaterialKeyword.review_count > 0,
            or_(WritingMaterialKeyword.next_review_at.is_(None), WritingMaterialKeyword.next_review_at <= today_end_utc),
        )
        .order_by(WritingMaterialKeyword.next_review_at.asc().nullsfirst())
        .limit(limit)
    )
    result = await db.execute(stmt)
    items = list(result.scalars().all())

    # 补充新词（未学过的），但今天新学总数不超过 include_new
    if include_new > 0:
        today_start = _today_start_cst()
        new_learned_today = (await db.execute(
            select(func.count()).select_from(WritingMaterialKeyword).where(
                WritingMaterialKeyword.first_learned_at >= today_start
            )
        )).scalar() or 0
        new_quota = max(0, include_new - new_learned_today)
        if new_quota > 0 and len(items) < limit:
            new_limit = min(new_quota, limit - len(items))
            new_stmt = (
                select(WritingMaterialKeyword)
                .where(WritingMaterialKeyword.review_count == 0)
                .order_by(WritingMaterialKeyword.sort_order)
                .limit(new_limit)
            )
            new_result = await db.execute(new_stmt)
            items.extend(new_result.scalars().all())

    return items


@router.post("/keywords/{keyword_id}/review", response_model=KeywordOut)
async def review_keyword(keyword_id: str, body: ReviewRequest, db: AsyncSession = Depends(get_db)):
    k = await db.get(WritingMaterialKeyword, keyword_id)
    if not k:
        raise HTTPException(404, "关键词不存在")
    _sm2_update_keyword(k, body.quality)
    await db.commit()
    await db.refresh(k)
    return k


# ─── Batch translate (generate downgrade English) ─────────

@router.post("/batch-translate")
async def batch_translate_materials(db: AsyncSession = Depends(get_db)):
    """批量为素材生成降级英文版本（reasoning_chain_en + example_en）"""
    from app.services.llm_service import complete_chat
    from app.utils.llm_config import get_llm_config

    result = await db.execute(
        select(WritingMaterial).where(
            or_(WritingMaterial.reasoning_chain_en.is_(None), WritingMaterial.example_en.is_(None))
        ).order_by(WritingMaterial.sort_order).limit(10)
    )
    items = result.scalars().all()
    if not items:
        return {"translated": 0, "message": "全部已有英文版本"}

    model, api_key, api_base = await get_llm_config(db)

    prompt = "For each item below, provide a SIMPLE downgrade English version (use basic words, simple grammar, clear meaning). Output JSON array.\n\n"
    prompt += "Rules:\n- reasoning_chain_en: translate the Chinese reasoning chain using simple A → B → C format with basic English\n- example_en: translate the example into key phrases (country/phenomenon/data) in simple English\n\n"
    prompt += "Items:\n"
    for i, m in enumerate(items):
        prompt += f"{i+1}. reasoning_chain: \"{m.reasoning_chain}\"\n   example: \"{m.example}\"\n"
    prompt += '\nOutput format: [{"reasoning_chain_en":"...","example_en":"..."},...]'

    raw = await complete_chat(
        model=model, api_key=api_key, api_base=api_base,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()

    try:
        translations = json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        return {"translated": 0, "message": "AI response parse failed", "raw": cleaned[:200]}

    count = 0
    for i, m in enumerate(items):
        if i < len(translations):
            t = translations[i]
            if t.get("reasoning_chain_en"):
                m.reasoning_chain_en = t["reasoning_chain_en"]
            if t.get("example_en"):
                m.example_en = t["example_en"]
            count += 1

    await db.commit()
    remaining = (await db.execute(
        select(func.count()).select_from(WritingMaterial).where(WritingMaterial.reasoning_chain_en.is_(None))
    )).scalar() or 0
    return {"translated": count, "remaining": remaining}


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
            topic_sentence=item.get("topic_sentence"),
            topic_sentence_en=item.get("topic_sentence_en"),
            reasoning_chain_en=item.get("reasoning_chain_en"),
            chain_sentence_en=item.get("chain_sentence_en"),
            example_en=item.get("example_en"),
            memory_anchor=item.get("memory_anchor"),
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


@router.post("/backfill-topic-sentences")
async def backfill_topic_sentences(force: bool = Query(False), db: AsyncSession = Depends(get_db)):
    """回填已有素材的观点句（从seed数据匹配）。force=true时覆盖已有观点句"""
    from app.data.writing_materials_seed import MATERIALS_DATA

    # Build lookup: (topic, direction_index, stance, angle_index) -> topic_sentence
    lookup = {}
    for item in MATERIALS_DATA:
        key = (item["topic"], item["direction_index"], item["stance"], item["angle_index"])
        lookup[key] = (item.get("topic_sentence"), item.get("topic_sentence_en"))

    if force:
        result = await db.execute(select(WritingMaterial))
    else:
        result = await db.execute(
            select(WritingMaterial).where(
                or_(WritingMaterial.topic_sentence.is_(None), WritingMaterial.topic_sentence == "")
            )
        )
    items = result.scalars().all()
    count = 0
    for m in items:
        key = (m.topic, m.direction_index, m.stance, m.angle_index)
        if key in lookup:
            ts, ts_en = lookup[key]
            if ts:
                m.topic_sentence = ts
            if ts_en:
                m.topic_sentence_en = ts_en
            count += 1

    await db.commit()
    return {"backfilled": count, "total": len(items)}


@router.post("/backfill-memory-anchors")
async def backfill_memory_anchors(db: AsyncSession = Depends(get_db)):
    """从 seed JSON 回填 memory_anchor 到已有素材"""
    from app.data.writing_materials_seed import MATERIALS_DATA

    lookup: dict[tuple, str] = {}
    for item in MATERIALS_DATA:
        key = (item["topic"], item["direction_index"], item["stance"], item["angle_index"])
        anchor = item.get("memory_anchor")
        if anchor:
            lookup[key] = anchor

    result = await db.execute(select(WritingMaterial))
    items = result.scalars().all()
    count = 0
    for m in items:
        key = (m.topic, m.direction_index, m.stance, m.angle_index)
        if key in lookup:
            m.memory_anchor = lookup[key]
            count += 1

    await db.commit()
    return {"backfilled": count, "total": len(items)}


@router.post("/backfill-chain-sentences")
async def backfill_chain_sentences(db: AsyncSession = Depends(get_db)):
    """从 seed JSON 回填 chain_sentence_en 到已有素材"""
    from app.data.writing_materials_seed import MATERIALS_DATA

    lookup: dict[tuple, str] = {}
    for item in MATERIALS_DATA:
        key = (item["topic"], item["direction_index"], item["stance"], item["angle_index"])
        cs = item.get("chain_sentence_en")
        if cs:
            lookup[key] = cs

    result = await db.execute(select(WritingMaterial))
    items = result.scalars().all()
    count = 0
    for m in items:
        key = (m.topic, m.direction_index, m.stance, m.angle_index)
        if key in lookup:
            m.chain_sentence_en = lookup[key]
            count += 1

    await db.commit()
    return {"backfilled": count, "total": len(items)}


# ─── L1 Angle Recall (角度回忆卡) ────────────────────────

class AngleInfo(BaseModel):
    stance: str
    stance_label: str
    angle: str
    angle_index: int
    topic_sentence: Optional[str]
    topic_sentence_en: Optional[str]
    min_mastery: int  # 该角度下素材的最低mastery

class DirectionL1Out(BaseModel):
    topic: str
    topic_cn: str
    direction: str
    direction_index: int
    memory_anchor: Optional[str]
    pro_angles: list[AngleInfo]
    con_angles: list[AngleInfo]
    pro_min_mastery: int  # 正方所有素材的最低mastery
    con_min_mastery: int  # 反方所有素材的最低mastery


@router.get("/l1-directions", response_model=List[DirectionL1Out])
async def get_l1_directions(db: AsyncSession = Depends(get_db)):
    """返回所有方向的 L1 数据，按 direction 分组"""
    result = await db.execute(
        select(WritingMaterial).order_by(
            WritingMaterial.topic, WritingMaterial.direction_index, WritingMaterial.stance, WritingMaterial.angle_index
        )
    )
    materials = result.scalars().all()

    # Group by (topic, direction_index)
    from collections import defaultdict
    groups: dict[tuple, list] = defaultdict(list)
    for m in materials:
        groups[(m.topic, m.direction_index)].append(m)

    directions: list[DirectionL1Out] = []
    for (_topic, _di), items in groups.items():
        first = items[0]
        pro_angles = []
        con_angles = []
        pro_masteries = []
        con_masteries = []

        for m in items:
            info = AngleInfo(
                stance=m.stance,
                stance_label=m.stance_label,
                angle=m.angle,
                angle_index=m.angle_index,
                topic_sentence=m.topic_sentence,
                topic_sentence_en=m.topic_sentence_en,
                min_mastery=m.mastery_level or 0,
            )
            if m.stance == "pro":
                pro_angles.append(info)
                pro_masteries.append(m.mastery_level or 0)
            else:
                con_angles.append(info)
                con_masteries.append(m.mastery_level or 0)

        directions.append(DirectionL1Out(
            topic=first.topic,
            topic_cn=first.topic_cn,
            direction=first.direction,
            direction_index=first.direction_index,
            memory_anchor=first.memory_anchor,
            pro_angles=pro_angles,
            con_angles=con_angles,
            pro_min_mastery=min(pro_masteries) if pro_masteries else 0,
            con_min_mastery=min(con_masteries) if con_masteries else 0,
        ))

    return directions


class L1PassRequest(BaseModel):
    topic: str
    direction_index: int
    stance: str  # "pro" or "con"


@router.post("/l1-pass")
async def l1_pass(body: L1PassRequest, db: AsyncSession = Depends(get_db)):
    """L1角度回忆通过：将指定方向+立场下 mastery=1 的素材升级为 mastery=2，使用SM-2计算下次复习时间"""
    now = datetime.utcnow()

    stmt = select(WritingMaterial).where(
        WritingMaterial.topic == body.topic,
        WritingMaterial.direction_index == body.direction_index,
        WritingMaterial.stance == body.stance,
        WritingMaterial.mastery_level == 1,
    )
    result = await db.execute(stmt)
    items = result.scalars().all()

    count = 0
    for m in items:
        # Use SM-2 with cap at mastery 2 (L1→L2 transition)
        _sm2_update_material(m, quality=2, max_mastery=2)
        count += 1

    await db.commit()
    return {"promoted": count, "topic": body.topic, "direction_index": body.direction_index, "stance": body.stance}


@router.post("/l1-fail")
async def l1_fail(body: L1PassRequest, db: AsyncSession = Depends(get_db)):
    """L1角度回忆失败：重置间隔，明天再来"""
    now = datetime.utcnow()

    stmt = select(WritingMaterial).where(
        WritingMaterial.topic == body.topic,
        WritingMaterial.direction_index == body.direction_index,
        WritingMaterial.stance == body.stance,
        WritingMaterial.mastery_level == 1,
    )
    result = await db.execute(stmt)
    items = result.scalars().all()

    count = 0
    for m in items:
        # SM-2 with quality=1 (模糊): interval resets to 1, stays at mastery 1
        _sm2_update_material(m, quality=1, max_mastery=1)
        count += 1

    await db.commit()
    return {"failed": count, "topic": body.topic, "direction_index": body.direction_index, "stance": body.stance}


# ─── Downgrade Practice (降级练习) ────────────────────────

DOWNGRADE_EXPRESSIONS = [
    {"id": "dg-01", "chinese": "眼睁睁看着机会流失", "hint": "miss opportunities"},
    {"id": "dg-02", "chinese": "一蹶不振", "hint": "give up easily / fail to recover"},
    {"id": "dg-03", "chinese": "被同伴压力左右", "hint": "be influenced by their peers"},
    {"id": "dg-04", "chinese": "损害长远利益", "hint": "harm their future"},
    {"id": "dg-05", "chinese": "不堪一击", "hint": "cannot handle difficulties"},
    {"id": "dg-06", "chinese": "适得其反", "hint": "have the opposite effect"},
    {"id": "dg-07", "chinese": "阶层固化", "hint": "the gap between rich and poor becomes permanent"},
    {"id": "dg-08", "chinese": "挤占预算", "hint": "leave less money for other areas"},
    {"id": "dg-09", "chinese": "激发潜能", "hint": "help people do their best"},
    {"id": "dg-10", "chinese": "沦为受害者", "hint": "be harmed by"},
    {"id": "dg-11", "chinese": "根深蒂固的问题", "hint": "a problem that is difficult to solve"},
    {"id": "dg-12", "chinese": "寅吃卯粮/不可持续", "hint": "use more than we can replace"},
]


class DowngradeSentenceOut(BaseModel):
    id: str
    chinese: str
    source_material_id: Optional[str] = None
    hint: Optional[str] = None


class DowngradeCheckRequest(BaseModel):
    chinese: str
    answer: str
    source_material_id: Optional[str] = None


class DowngradeCheckResponse(BaseModel):
    score: int
    correct: bool
    feedback: str
    reference_answer: str
    corrected_answer: str = ""  # 基于用户答案的修正版（未通过时提供）
    steps: dict  # {core_meaning, keywords, simple_sentence}


@router.get("/downgrade-sentences", response_model=List[DowngradeSentenceOut])
async def get_downgrade_sentences(db: AsyncSession = Depends(get_db)):
    """返回今日剩余降级练习句子（每天上限5条，已练过的扣除）
    来源：仅限通用表达短语（素材的英文输出由L3默写测试负责）
    """
    # 计算今日已练数量
    today_start = _today_start_cst()
    today_done = (await db.execute(
        select(func.count()).select_from(DowngradeAttempt)
        .where(DowngradeAttempt.created_at >= today_start)
    )).scalar() or 0

    remaining = max(0, 5 - today_done)
    if remaining == 0:
        return []

    sentences: List[DowngradeSentenceOut] = []

    # 只从通用表达中抽取
    picked_exprs = random.sample(DOWNGRADE_EXPRESSIONS, min(remaining, len(DOWNGRADE_EXPRESSIONS)))
    for expr in picked_exprs:
        sentences.append(DowngradeSentenceOut(
            id=expr["id"],
            chinese=expr["chinese"],
            source_material_id=None,
            hint=expr.get("hint"),
        ))

    random.shuffle(sentences)
    return sentences[:remaining]


@router.post("/downgrade-check", response_model=DowngradeCheckResponse)
async def check_downgrade(body: DowngradeCheckRequest, db: AsyncSession = Depends(get_db)):
    """AI判断降级表达是否正确：核心意思传达？语法正确？关联推荐关键词"""
    from app.services.llm_service import complete_chat
    from app.utils.llm_config import get_llm_config

    # 查找相关关键词作为参考词汇
    recommended_vocab = ""
    if body.source_material_id:
        mat = await db.get(WritingMaterial, body.source_material_id)
        if mat:
            kw_result = await db.execute(
                select(WritingMaterialKeyword).where(
                    WritingMaterialKeyword.topic == mat.topic,
                    WritingMaterialKeyword.direction_index == mat.direction_index,
                )
            )
            kws = kw_result.scalars().all()
            if kws:
                basic_pairs = [f"  {kw.cn} = {kw.en}" for kw in kws if (kw.level or "basic") == "basic"]
                advanced_pairs = [f"  {kw.cn} = {kw.en}" for kw in kws if (kw.level or "basic") == "advanced"]
                vocab_parts = []
                if basic_pairs:
                    vocab_parts.append("【基础词汇（参考答案必须使用这些词）】：\n" + "\n".join(basic_pairs))
                if advanced_pairs:
                    vocab_parts.append("【进阶词汇（学生用到可额外加分）】：\n" + "\n".join(advanced_pairs))
                recommended_vocab = "\n\n" + "\n\n".join(vocab_parts)

    prompt = f"""你是一位雅思写作教练，帮助学生练习"降级表达法"——把复杂中文用清晰、正确的简单英语表达。

核心理念：降级表达 = 用最简单的词把意思说清楚。不追求华丽词汇，追求清晰和正确。

关键规则——参考答案必须是完整的英文句子：
- 如果输入是短语/词组（如"沦为受害者""适得其反"）→ 参考答案给对应的英文短语（如 "become a victim" "have the opposite effect"）
- 如果输入是因果链（A → B → C）→ 参考答案必须是一个完整句子，用 so / which means / leading to / thereby 把各步串成一句话。绝对禁止在参考答案中使用箭头(→/->)！
- 如果输入是完整句子 → 参考答案给等长度的英文句子
- 参考答案应使用基础词汇（如提供了词汇列表）

绝对禁止：参考答案中出现箭头(→/->/→)、参考答案比输入长3倍以上、自己编造输入中没有的信息、堆砌高级词汇

中文原句：{body.chinese}
学生答案：{body.answer}{recommended_vocab}

重要规则：
- 参考答案必须使用基础词汇列表中的词
- 如果学生使用了进阶词汇列表中的词，评分时给予额外加分（+5~10分）
- 评判标准是：意思是否完整清晰表达出来了 + 语法是否正确 + 能否将分散的单词组拼成完整句子

评分标准：
- 90-100: 意思准确 + 语法正确 + 使用了进阶词汇
- 75-89: 意思完整 + 语法正确（用简单词也OK）
- 60-74: 意思基本对 但语法有错或表达不完整
- 40-59: 意思部分对 或 逻辑断裂
- 0-39: 偏题或无法理解

⚠️ 特别注意：如果学生的答案与中文原句的意思完全无关（比如写了"I don't know"、随便写了几个无关的词、或者答案完全没有尝试表达原句的含义），必须给0分且correct为false。不要因为学生写了语法正确的英文就给分——必须判断答案是否在表达原句的意思。

输出格式（只输出JSON）：
{{"score": 数字, "correct": true/false(>=70为true), "feedback": "简短点评（一两句话）", "reference_answer": "一个完整英文句子（禁止箭头，用连接词串成一句话）", "corrected_answer": "基于学生答案的修正版（保留学生的表达习惯和句式，只修正错误部分；如果学生答对了则留空字符串）", "steps": {{"core_meaning": "核心意思（5字）", "keywords": "关键词英文", "simple_sentence": "最终完整句子（和reference_answer一致）"}}}}"""

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
        correct = data.get("correct", score >= 70)
        feedback = data.get("feedback", "")
        reference_answer = data.get("reference_answer", "")
        corrected_answer = data.get("corrected_answer", "") if not correct else ""
        steps = data.get("steps", {"core_meaning": "", "keywords": "", "simple_sentence": ""})
    except (json.JSONDecodeError, ValueError):
        score_match = re.search(r'"score"\s*:\s*(\d+)', cleaned)
        score = int(score_match.group(1)) if score_match else 50
        correct = score >= 70
        feedback = "评分解析异常，请重试"
        reference_answer = ""
        corrected_answer = ""
        steps = {"core_meaning": "", "keywords": "", "simple_sentence": ""}

    # 保存练习记录
    attempt = DowngradeAttempt(
        chinese=body.chinese,
        answer=body.answer,
        score=score,
        correct=1 if correct else 0,
        reference_answer=reference_answer,
        feedback=feedback,
        source_material_id=body.source_material_id,
        needs_retry=1 if score < 70 else 0,
    )
    db.add(attempt)
    await db.commit()

    return DowngradeCheckResponse(
        score=score,
        correct=correct,
        feedback=feedback,
        reference_answer=reference_answer,
        corrected_answer=corrected_answer,
        steps=steps,
    )


# ─── Downgrade: retry (错题重练) ──────────────────────────

@router.get("/downgrade-retry", response_model=List[DowngradeSentenceOut])
async def get_downgrade_retry(db: AsyncSession = Depends(get_db)):
    """获取需要重练的降级题目（score < 70 且未重练过的）"""
    result = await db.execute(
        select(DowngradeAttempt)
        .where(DowngradeAttempt.needs_retry == 1, DowngradeAttempt.retried == 0)
        .order_by(DowngradeAttempt.created_at.desc())
        .limit(5)
    )
    attempts = result.scalars().all()
    sentences = []
    for a in attempts:
        sentences.append(DowngradeSentenceOut(
            id=f"retry-{a.id[:8]}",
            chinese=a.chinese,
            source_material_id=a.source_material_id,
            hint=f"上次得分 {a.score}分",
        ))
    return sentences


@router.post("/downgrade-retry/{attempt_id}/done")
async def mark_retry_done(attempt_id: str, db: AsyncSession = Depends(get_db)):
    """标记某条错题已重练"""
    result = await db.execute(
        select(DowngradeAttempt).where(DowngradeAttempt.id.like(f"{attempt_id}%"))
    )
    attempt = result.scalar_one_or_none()
    if attempt:
        attempt.retried = 1
        await db.commit()
    return {"ok": True}


# ─── Downgrade: stats (练习统计) ──────────────────────────

@router.get("/downgrade-stats")
async def get_downgrade_stats(db: AsyncSession = Depends(get_db)):
    """降级练习统计"""
    total = (await db.execute(select(func.count()).select_from(DowngradeAttempt))).scalar() or 0
    correct_count = (await db.execute(
        select(func.count()).select_from(DowngradeAttempt).where(DowngradeAttempt.correct == 1)
    )).scalar() or 0
    avg_score = (await db.execute(
        select(func.avg(DowngradeAttempt.score)).select_from(DowngradeAttempt)
    )).scalar() or 0
    retry_pending = (await db.execute(
        select(func.count()).select_from(DowngradeAttempt)
        .where(DowngradeAttempt.needs_retry == 1, DowngradeAttempt.retried == 0)
    )).scalar() or 0

    # 今日练习
    today_start = _today_start_cst()
    today_count = (await db.execute(
        select(func.count()).select_from(DowngradeAttempt)
        .where(DowngradeAttempt.created_at >= today_start)
    )).scalar() or 0
    today_avg = (await db.execute(
        select(func.avg(DowngradeAttempt.score)).select_from(DowngradeAttempt)
        .where(DowngradeAttempt.created_at >= today_start)
    )).scalar() or 0

    return {
        "total_attempts": total,
        "correct_count": correct_count,
        "accuracy_pct": round(correct_count / total * 100) if total > 0 else 0,
        "avg_score": round(float(avg_score), 1),
        "retry_pending": retry_pending,
        "today_count": today_count,
        "today_avg_score": round(float(today_avg), 1) if today_avg else 0,
    }
