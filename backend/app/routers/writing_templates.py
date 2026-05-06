from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

_CST = timezone(timedelta(hours=8))  # 中国标准时间

def _today_start_cst() -> datetime:
    """返回今天 CST 0:00 对应的 UTC 时间（用于查询'今天'的记录）"""
    now_cst = datetime.now(_CST)
    today_cst = now_cst.replace(hour=0, minute=0, second=0, microsecond=0)
    return today_cst.astimezone(timezone.utc).replace(tzinfo=None)
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
    first_learned_at: Optional[datetime]
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
    mode: str = "full"  # "fill" (填空) or "full" (完整默写)
    slot_index: int | None = None  # 填空模式时指定哪个 slot


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
    tomorrow_due: int
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
    """获取今日待复习的句型（间隔重复到期）— 今天CST内到期的都算"""
    # 用今天CST结束时间（即明天CST 0:00对应的UTC）作为截止
    now_cst = datetime.now(_CST)
    today_end_cst = now_cst.replace(hour=23, minute=59, second=59, microsecond=0)
    today_end_utc = today_end_cst.astimezone(timezone.utc).replace(tzinfo=None)
    stmt = (
        select(WritingTemplate)
        .where(
            WritingTemplate.review_count > 0,
            or_(
                WritingTemplate.next_review_at.is_(None),
                WritingTemplate.next_review_at <= today_end_utc,
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
    """获取今日新学句型。每天限 limit 条新的。
    使用 first_learned_at 精确判断"今天首次学习"的句型数量。
    """
    now = datetime.utcnow()
    today_start = _today_start_cst()

    # 今天首次学习的句型数量（first_learned_at 在今天）
    learned_today_q = await db.execute(
        select(func.count()).select_from(WritingTemplate).where(
            WritingTemplate.first_learned_at >= today_start,
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
    today_start = _today_start_cst()
    stmt = (
        select(WritingTemplate)
        .where(WritingTemplate.last_reviewed_at >= today_start)
        .order_by(WritingTemplate.last_reviewed_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


# ─── 填空片段 (Blank Slots) ──────────────────────────────────

async def _ensure_blank_slots(t: WritingTemplate, db: AsyncSession) -> list[dict]:
    """确保句型有 blank_slots，没有则用 AI 生成。返回 slots 列表。"""
    if t.blank_slots:
        try:
            return json.loads(t.blank_slots)
        except (json.JSONDecodeError, TypeError):
            pass

    # AI 生成片段
    from app.services.llm_service import complete_chat
    from app.utils.llm_config import get_llm_config

    model, api_key, api_base = await get_llm_config(db)
    slots = []

    if api_key:
        prompt = f"""将以下雅思写作句型拆分为2-3个可独立考核的核心片段。

句型：{t.template_en}
场景：{t.scene_cn}

规则：
1. 每个片段是句型中连续的一段核心文字（是需要学生记住的搭配/结构）
2. 片段应是有学习价值的核心结构（如 "there was a dramatic/sharp increase/rise in" / "from XX to XX" / "between [时间1] and [时间2]"）
3. [占位符] 本身不算片段内容，但可以包含在片段中作为结构的一部分
4. 每个片段最少3个词，覆盖句型的不同学习点
5. 输出恰好2-3个片段

输出严格JSON数组：[{{"text": "片段原文（必须是句型中连续出现的原文）", "hint": "2-4字中文提示"}}]
只输出JSON。"""
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
            slots = json.loads(cleaned)
            # 验证每个 slot 的 text 确实存在于原句中
            slots = [s for s in slots if isinstance(s, dict) and s.get("text") and s["text"] in t.template_en]
        except Exception:
            slots = []

    # Fallback: 按逗号切分
    if len(slots) < 2:
        parts = [p.strip() for p in t.template_en.split(",") if p.strip() and len(p.strip().split()) >= 3]
        slots = [{"text": p.rstrip(",.;"), "hint": f"片段{i+1}"} for i, p in enumerate(parts[:3])]
        if len(slots) < 2:
            words = t.template_en.split()
            mid = len(words) // 2
            slots = [
                {"text": " ".join(words[:mid]), "hint": "前半句"},
                {"text": " ".join(words[mid:]), "hint": "后半句"},
            ]

    t.blank_slots = json.dumps(slots, ensure_ascii=False)
    await db.commit()
    return slots


@router.get("/{template_id}/blank-slots")
async def get_blank_slots(template_id: str, db: AsyncSession = Depends(get_db)):
    """获取句型的填空片段信息，用于填空默写模式"""
    t = await db.get(WritingTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="句型不存在")

    slots = await _ensure_blank_slots(t, db)
    passed = json.loads(t.slots_passed) if t.slots_passed else []

    unpassed = [i for i in range(len(slots)) if i not in passed]
    current_idx = unpassed[0] if unpassed else 0

    current_slot = slots[current_idx] if current_idx < len(slots) else slots[0]
    template_with_blank = t.template_en.replace(current_slot["text"], "______")

    return {
        "slots": [
            {"index": i, "hint": s.get("hint", ""), "passed": i in passed}
            for i, s in enumerate(slots)
        ],
        "template_with_blank": template_with_blank,
        "current_slot_index": current_idx,
        "current_slot_hint": current_slot.get("hint", ""),
        "slots_passed_count": len(passed),
        "slots_total": len(slots),
    }


@router.post("/{template_id}/check", response_model=CheckResponse)
async def check_answer(template_id: str, body: CheckRequest, db: AsyncSession = Depends(get_db)):
    """提交默写答案，AI 判分。mode='fill'(填空,mastery 2→3) / 'full'(完整,mastery 3维持或降回2)"""
    t = await db.get(WritingTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="句型不存在")

    is_fill_mode = body.mode == "fill"
    pass_threshold = 70 if is_fill_mode else 85  # 填空70分通过，完整默写85分通过

    # AI 判分
    from app.services.llm_service import complete_chat
    from app.utils.llm_config import get_llm_config

    model, api_key, api_base = await get_llm_config(db)
    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 API Key")

    if is_fill_mode:
        # 获取当前 slot 的标准答案
        slots = await _ensure_blank_slots(t, db)
        slot_idx = body.slot_index if body.slot_index is not None else 0
        slot_text = slots[slot_idx]["text"] if slot_idx < len(slots) else t.template_en

        prompt = f"""你是雅思写作句型检验助手。学生正在做填空练习，需要填写句型中被遮挡的部分。

完整句型：{t.template_en}
被遮挡部分（标准答案）：{slot_text}
学生填写内容：{body.answer}
场景提示：{t.scene_cn}

评分规则（填空模式）：
1. 核心结构/搭配正确（主要词组一致）：60分
2. 关键动词/介词到位：25分
3. 拼写正确：15分
4. 允许同义替换（dramatic→sharp, increase→rise等）
5. 不要求 [占位符] 内容，只看学生是否写出了核心英文结构
6. 允许省略选项符号如"/"，只写其中一个选项也算对

输出严格 JSON：
{{"score": 80, "correct": true, "feedback": "核心搭配正确，注意原文还有soared/surged等词也要掌握"}}

score >= {pass_threshold} 则 correct=true。
feedback要求：中文不超过60字；如果学生用了同义替换虽算对但要指出原词让学生积累；指出遗漏的重要词汇。
只输出JSON。"""
    else:
        prompt = f"""你是雅思写作句型检验助手。学生需要背诵一个英文句型模板，现在默写了一个版本，请判断是否正确。

标准答案：{t.template_en}
学生答案：{body.answer}
场景提示：{t.scene_cn}

评分规则（完整默写，要求更严格）：
1. 核心结构正确（主要句式骨架一致）：50分
2. 关键词覆盖（重要的动词/连接词/固定搭配到位）：30分
3. 语法和拼写无误：20分
4. 允许占位符不同（如[主语]写成具体词也行）
5. 允许同义替换（如 dramatic→sharp, rise→increase）
6. 不要求标点和大小写完全一致

输出严格 JSON 格式：
{{"score": 85, "correct": true, "feedback": "核心结构正确。注意标准答案还有soared/surged等表达也要记住"}}

score >= {pass_threshold} 则 correct=true，否则 correct=false。
feedback要求：
- 用中文，不超过60字
- 如果学生用了同义替换算对，但feedback中要指出标准答案里的原词让学生多积累
- 指出学生遗漏的重要词汇/搭配
只输出JSON。"""

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
        correct = result.get("correct", score >= pass_threshold)
        feedback = result.get("feedback", "")
    except Exception:
        # Fallback: simple string similarity
        from difflib import SequenceMatcher
        ratio = SequenceMatcher(None, body.answer.lower().strip(), t.template_en.lower()).ratio()
        score = int(ratio * 100)
        correct = score >= pass_threshold
        feedback = "AI 判分暂时不可用，使用文本相似度匹配"

    # 分阶段 mastery 更新
    if is_fill_mode:
        slot_idx = body.slot_index if body.slot_index is not None else 0
        if correct:
            # 将 slot 标记为已通过
            passed = json.loads(t.slots_passed) if t.slots_passed else []
            if slot_idx not in passed:
                passed.append(slot_idx)
                t.slots_passed = json.dumps(passed)
            # 检查是否累计通过 >= 2 个不同 slot
            if len(passed) >= 2:
                _sm2_update(t, 3)  # 升级到 mastery 3
            else:
                # 通过了1个slot，间隔重复正常更新但 mastery 封顶2
                _sm2_update(t, 3, cap_mastery=2)
        else:
            _sm2_update(t, 0, cap_mastery=2)  # fail, stay at 2
    else:
        # 完整默写
        if correct:
            _sm2_update(t, 3)  # pass, maintain mastery 3
        else:
            # 完整默写失败：降回 mastery 2，清空 slots_passed
            t.mastery_level = 2
            t.slots_passed = "[]"
            t.interval_days = 1
            t.next_review_at = datetime.utcnow() + timedelta(days=1)
            t.last_reviewed_at = datetime.utcnow()
            t.review_count = (t.review_count or 0) + 1

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
    """认知测试/闪卡结果。quality: 0=不会, 1=模糊, 2=模糊偏会, 3=会了。
    闪卡最多升到 mastery=2(认识)，需默写通过才能到3(熟练)。"""
    t = await db.get(WritingTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="句型不存在")

    q = body.quality
    if q <= 0:
        # 不会：间隔重置，mastery -1
        _sm2_update(t, 0, cap_mastery=2)
    elif q == 1:
        # 模糊：间隔重置为1天，但 mastery 不变
        now = datetime.utcnow()
        t.interval_days = 1
        t.next_review_at = now + timedelta(days=1)
        t.last_reviewed_at = now
        t.review_count = (t.review_count or 0) + 1
        if not t.first_learned_at:
            t.first_learned_at = now
    else:
        # 会了(2/3)：正常 SM-2 pass，mastery 封顶2
        _sm2_update(t, 3, cap_mastery=2)

    await db.commit()
    await db.refresh(t)
    return t


@router.get("/stats", response_model=StatsOut)
async def get_stats(db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    today_start = _today_start_cst()
    # 今天CST结束时间对应的UTC
    now_cst = datetime.now(_CST)
    today_end_utc = now_cst.replace(hour=23, minute=59, second=59).astimezone(timezone.utc).replace(tzinfo=None)
    # 明天CST结束时间对应的UTC
    tomorrow_end_utc = today_end_utc + timedelta(days=1)

    total = (await db.execute(select(func.count()).select_from(WritingTemplate))).scalar() or 0
    mastered = (await db.execute(select(func.count()).select_from(WritingTemplate).where(WritingTemplate.mastery_level >= 3))).scalar() or 0
    learning = (await db.execute(select(func.count()).select_from(WritingTemplate).where(WritingTemplate.mastery_level.in_([1, 2])))).scalar() or 0
    new_count = (await db.execute(select(func.count()).select_from(WritingTemplate).where(WritingTemplate.review_count == 0))).scalar() or 0
    due_today = (await db.execute(select(func.count()).select_from(WritingTemplate).where(
        WritingTemplate.review_count > 0,
        or_(WritingTemplate.next_review_at.is_(None), WritingTemplate.next_review_at <= today_end_utc),
    ))).scalar() or 0
    tomorrow_due = (await db.execute(select(func.count()).select_from(WritingTemplate).where(
        WritingTemplate.review_count > 0,
        WritingTemplate.next_review_at > today_end_utc,
        WritingTemplate.next_review_at <= tomorrow_end_utc,
    ))).scalar() or 0
    learned_today = (await db.execute(select(func.count()).select_from(WritingTemplate).where(
        WritingTemplate.first_learned_at >= today_start,
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
        new_count=new_count, due_today=due_today, tomorrow_due=tomorrow_due,
        learned_today=learned_today, category_stats=category_stats,
    )


# ─── SM-2 Helper ──────────────────────────────────────────

def _sm2_update(t: WritingTemplate, quality: int, cap_mastery: int = 3):
    """Update spaced repetition fields. quality: 0=fail, 3=pass. cap_mastery: max mastery level allowed.
    interval 封顶7天（备考冲刺期，需要高频复习）。"""
    now = datetime.utcnow()

    if quality < 2:
        t.interval_days = 1
        t.ease_factor = max(1.3, (t.ease_factor or 2.5) - 0.2)
        t.mastery_level = max(0, (t.mastery_level or 0) - 1)
    else:
        if t.review_count == 0:
            t.interval_days = 1
        elif t.review_count == 1:
            t.interval_days = 2
        elif t.review_count == 2:
            t.interval_days = 3
        else:
            t.interval_days = min(7, max(1, int(round((t.interval_days or 1) * (t.ease_factor or 2.5)))))

        ef = (t.ease_factor or 2.5) + 0.1 - (3 - quality) * 0.08
        t.ease_factor = max(1.3, ef)
        t.mastery_level = min(cap_mastery, (t.mastery_level or 0) + 1)

    # 备考期间 interval 永远不超过7天
    t.interval_days = min(7, t.interval_days)

    t.review_count = (t.review_count or 0) + 1
    if quality >= 2:
        t.correct_count = (t.correct_count or 0) + 1
    t.next_review_at = now + timedelta(days=t.interval_days)
    t.last_reviewed_at = now
    # 首次学习时记录
    if not t.first_learned_at:
        t.first_learned_at = now
