from __future__ import annotations

import json as _json
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.speaking_phrase import SpeakingPhrase

router = APIRouter(prefix="/api/speaking-phrases", tags=["speaking-phrases"])


def _today_start_cst() -> datetime:
    """系统以每天CST 8:00为新的一天"""
    cst = timezone(timedelta(hours=8))
    now_cst = datetime.now(cst)
    if now_cst.hour < 8:
        now_cst = now_cst - timedelta(days=1)
    start_cst = now_cst.replace(hour=8, minute=0, second=0, microsecond=0)
    return start_cst.astimezone(timezone.utc).replace(tzinfo=None)


# ─── Schemas ───

class ReviewBody(BaseModel):
    result: str  # "fluent" or "hesitant"


def _serialize(p: SpeakingPhrase) -> dict:
    return {
        "id": p.id,
        "category": p.category,
        "cn": p.cn,
        "en": p.en,
        "status": p.status,
        "streak_days": p.streak_days,
        "last_reviewed_at": p.last_reviewed_at.isoformat() if p.last_reviewed_at else None,
        "last_result": p.last_result,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "passed_at": p.passed_at.isoformat() if p.passed_at else None,
    }


# ─── Endpoints ───

@router.get("")
async def list_phrases(
    category: str | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """列表，支持 category 和 status 筛选"""
    q = select(SpeakingPhrase).order_by(SpeakingPhrase.category, SpeakingPhrase.created_at)
    if category:
        q = q.where(SpeakingPhrase.category == category)
    if status:
        q = q.where(SpeakingPhrase.status == status)
    result = await db.execute(q)
    return [_serialize(p) for p in result.scalars().all()]


@router.get("/today")
async def get_today_review(db: AsyncSession = Depends(get_db)):
    """今日闪卡复习：已学过的每天复习 + 每天解锁5条新的。

    规则：
    - 已学过（last_reviewed_at 不为空）且未过关 → 每天都需要复习
    - 新的（last_reviewed_at 为空）→ 每天最多解锁5条
    - 今天已复习过的不再出现在 pending 中
    """
    today_start = _today_start_cst()

    # 所有 active 条目
    result = await db.execute(
        select(SpeakingPhrase).where(SpeakingPhrase.status == "active")
        .order_by(SpeakingPhrase.category, SpeakingPhrase.created_at)
    )
    all_active = result.scalars().all()

    # 分类
    already_learned = [p for p in all_active if p.last_reviewed_at is not None]
    never_learned = [p for p in all_active if p.last_reviewed_at is None]

    # 已学过的：今天还没复习的 = pending
    learned_pending = [p for p in already_learned if p.last_reviewed_at < today_start]
    learned_reviewed_today = [p for p in already_learned if p.last_reviewed_at >= today_start]

    # 新的：今天最多解锁5条（扣除今天已经学过的新条目数）
    # 今天新学的 = last_reviewed_at 在今天 且 streak_days <= 1（第一次复习）
    new_learned_today = [p for p in learned_reviewed_today if p.streak_days <= 1 and p.last_reviewed_at >= today_start]
    new_quota = max(0, 5 - len(new_learned_today))
    new_to_learn = never_learned[:new_quota]

    pending = learned_pending + new_to_learn
    reviewed_today = learned_reviewed_today

    return {
        "pending": [_serialize(p) for p in pending],
        "reviewed": [_serialize(p) for p in reviewed_today],
        "total_active": len(all_active),
        "new_today": len(new_to_learn),
        "new_remaining": len(never_learned) - new_quota if new_quota < len(never_learned) else 0,
    }


@router.post("/{phrase_id}/review")
async def review_phrase(phrase_id: str, body: ReviewBody, db: AsyncSession = Depends(get_db)):
    """复习结果：fluent（脱口而出）或 hesitant（还要想）"""
    q = await db.execute(
        select(SpeakingPhrase).where(SpeakingPhrase.id == phrase_id)
    )
    p = q.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Not found")

    now = datetime.utcnow()
    p.last_reviewed_at = now
    p.last_result = body.result

    if body.result == "fluent":
        p.streak_days = (p.streak_days or 0) + 1
        # 连续3天过关
        if p.streak_days >= 3:
            p.status = "passed"
            p.passed_at = now
    else:
        p.streak_days = 0

    await db.commit()
    await db.refresh(p)
    return _serialize(p)


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """统计数据"""
    total_q = await db.execute(select(func.count(SpeakingPhrase.id)))
    total = total_q.scalar() or 0

    active_q = await db.execute(
        select(func.count(SpeakingPhrase.id)).where(SpeakingPhrase.status == "active")
    )
    active = active_q.scalar() or 0

    passed_q = await db.execute(
        select(func.count(SpeakingPhrase.id)).where(SpeakingPhrase.status == "passed")
    )
    passed = passed_q.scalar() or 0

    # 各 category 分布
    cat_q = await db.execute(
        select(SpeakingPhrase.category, func.count(SpeakingPhrase.id))
        .group_by(SpeakingPhrase.category)
    )
    by_category = {row[0]: row[1] for row in cat_q.all()}

    # 各 category 已过关数
    cat_passed_q = await db.execute(
        select(SpeakingPhrase.category, func.count(SpeakingPhrase.id))
        .where(SpeakingPhrase.status == "passed")
        .group_by(SpeakingPhrase.category)
    )
    passed_by_category = {row[0]: row[1] for row in cat_passed_q.all()}

    return {
        "total": total,
        "active": active,
        "passed": passed,
        "by_category": by_category,
        "passed_by_category": passed_by_category,
    }


@router.post("/seed")
async def seed_phrases(db: AsyncSession = Depends(get_db)):
    """从 JSON 文件导入所有短语（仅当表为空时）"""
    count_q = await db.execute(select(func.count(SpeakingPhrase.id)))
    count = count_q.scalar() or 0
    if count > 0:
        return {"message": f"Table already has {count} phrases, skipping seed.", "imported": 0}

    seed_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "speaking_phrases_seed.json")
    if not os.path.exists(seed_path):
        raise HTTPException(status_code=500, detail="Seed file not found")

    with open(seed_path, "r", encoding="utf-8") as f:
        items = _json.load(f)

    for item in items:
        db.add(SpeakingPhrase(
            id=str(uuid.uuid4()),
            category=item["category"],
            cn=item["cn"],
            en=item["en"],
        ))

    await db.commit()
    return {"message": f"Imported {len(items)} phrases.", "imported": len(items)}


class BatchImportPhrasesBody(BaseModel):
    text: str


@router.post("/batch-import")
async def batch_import_phrases(body: BatchImportPhrasesBody, db: AsyncSession = Depends(get_db)):
    """AI解析用户粘贴的降级表达文本，批量导入。"""
    from app.services.llm_service import complete_chat
    from app.utils.llm_config import get_llm_config

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    model, api_key, api_base = await get_llm_config(db)
    if not api_key:
        raise HTTPException(status_code=500, detail="LLM not configured")

    prompt = f"""从以下文本中提取"口语降级表达"条目（即"你想表达某个中文→对应的简单英文"的部分）。

注意：只提取降级表达类（用户想表达某个意思，给出简单英文表达），不要提取"纠错"类（有Wrong→Corrected的语法纠错）。

分类只能是以下之一：feelings（感受评价）、reasons（原因影响）、people（描述人）、places（地点环境）、changes（变化对比）、opinions（观点态度）、frequency（频率程度）、habits（喜好习惯）、difficulties（困难问题）、filler（填充拖时间）

文本：
{text}

输出格式（只输出JSON数组，如果没有降级表达条目则输出空数组[]）：
[{{"cn": "中文表达", "en": "对应的简单英文", "category": "分类"}}]

规则：
- 提取"你想表达"或中英文对照的降级表达
- cn 字段填中文原意（简短），en 字段填简单英文
- 根据内容判断 category
- 如果判断不出类型，默认用 opinions"""

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

    try:
        items = _json.loads(cleaned)
    except _json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="AI解析失败，请检查格式")

    created = []
    for item in items:
        cn = item.get("cn", "").strip()
        en = item.get("en", "").strip()
        category = item.get("category", "opinions")
        if not cn or not en:
            continue
        if category not in ("feelings", "reasons", "people", "places", "changes", "opinions", "frequency", "habits", "difficulties", "filler"):
            category = "opinions"
        p = SpeakingPhrase(
            id=str(uuid.uuid4()),
            category=category,
            cn=cn,
            en=en,
        )
        db.add(p)
        created.append(p)

    await db.commit()
    return {"imported": len(created), "items": [_serialize(p) for p in created]}
