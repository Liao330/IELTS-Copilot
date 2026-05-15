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
from app.models.speaking_material import SpeakingMaterial

router = APIRouter(prefix="/api/speaking-materials", tags=["speaking-materials"])

_CST = timezone(timedelta(hours=8))
_STREAK_THRESHOLD = 5  # 连续5天过关
_DAILY_NEW_QUOTA = 1   # 每天最多学习1篇新素材（P2长段落，一天一篇足矣）


def _today_start_cst() -> datetime:
    """系统以每天CST 8:00为新的一天"""
    now_cst = datetime.now(_CST)
    if now_cst.hour < 8:
        now_cst = now_cst - timedelta(days=1)
    today_cst = now_cst.replace(hour=8, minute=0, second=0, microsecond=0)
    return today_cst.astimezone(timezone.utc).replace(tzinfo=None)


# ─── Schemas ─────────────────────────────────────────────

class MaterialOut(BaseModel):
    id: str
    title: str
    topic: str
    part: str
    content: str
    keywords_cn: list[str]  # 返回时解析为数组
    score: float
    status: str
    streak_days: int
    last_reviewed_at: datetime | None
    last_result: str | None
    passed_at: datetime | None
    sort_order: int


class ReviewBody(BaseModel):
    result: str  # "fluent" or "hesitant"


def _serialize(m: SpeakingMaterial) -> dict:
    try:
        keywords = _json.loads(m.keywords_cn) if m.keywords_cn else []
    except (ValueError, TypeError):
        keywords = []
    return {
        "id": m.id,
        "title": m.title,
        "topic": m.topic,
        "part": m.part,
        "content": m.content,
        "keywords_cn": keywords,
        "score": m.score,
        "status": m.status,
        "streak_days": m.streak_days,
        "last_reviewed_at": m.last_reviewed_at.isoformat() if m.last_reviewed_at else None,
        "last_result": m.last_result,
        "passed_at": m.passed_at.isoformat() if m.passed_at else None,
        "sort_order": m.sort_order,
    }


# ─── Today ───────────────────────────────────────────────

@router.get("/today")
async def get_today(db: AsyncSession = Depends(get_db)):
    """今日复习：已学过的每天复习 + 每天最多解锁2篇新素材。

    规则：
    - 已学过（last_reviewed_at 不为空）且未过关 → 每天都需要复习
    - 新的（last_reviewed_at 为空）→ 每天最多解锁2篇
    - 今天已复习过的不再出现在 pending 中
    """
    today_start = _today_start_cst()

    # 今日已复习过的
    reviewed_q = await db.execute(
        select(SpeakingMaterial).where(
            SpeakingMaterial.last_reviewed_at >= today_start
        )
    )
    reviewed = reviewed_q.scalars().all()
    reviewed_ids = {r.id for r in reviewed}

    # 之前学过但今天还没复习的
    active_q = await db.execute(
        select(SpeakingMaterial).where(
            SpeakingMaterial.status == "active",
            SpeakingMaterial.last_reviewed_at.is_not(None),
            SpeakingMaterial.last_reviewed_at < today_start,
        )
    )
    pending = list(active_q.scalars().all())

    # 新素材配额：今天 reviewed 中 streak_days==1 的就是今天首次学的新词
    new_learned_today = sum(1 for r in reviewed if r.streak_days == 1)
    new_quota = max(0, _DAILY_NEW_QUOTA - new_learned_today)

    if new_quota > 0:
        fresh_q = await db.execute(
            select(SpeakingMaterial).where(
                SpeakingMaterial.status == "active",
                SpeakingMaterial.last_reviewed_at.is_(None),
            ).order_by(SpeakingMaterial.sort_order).limit(new_quota)
        )
        pending.extend(fresh_q.scalars().all())

    # 统计
    total_active_q = await db.execute(
        select(func.count()).select_from(SpeakingMaterial).where(
            SpeakingMaterial.status == "active"
        )
    )
    total_active = total_active_q.scalar() or 0

    return {
        "pending": [_serialize(m) for m in pending],
        "reviewed": [_serialize(m) for m in reviewed],
        "total_active": total_active,
        "new_remaining": new_quota,
        "streak_threshold": _STREAK_THRESHOLD,
    }


# ─── Review ──────────────────────────────────────────────

@router.post("/{material_id}/review")
async def review_material(material_id: str, body: ReviewBody, db: AsyncSession = Depends(get_db)):
    """复习结果：fluent（背诵流利）或 hesitant（还不熟）。连续5天过关。"""
    m = await db.get(SpeakingMaterial, material_id)
    if not m:
        raise HTTPException(404, "素材不存在")

    now = datetime.utcnow()
    today_start = _today_start_cst()

    # 防止同一天重复复习
    if m.last_reviewed_at and m.last_reviewed_at >= today_start:
        return _serialize(m)

    m.last_result = body.result
    m.last_reviewed_at = now

    if body.result == "fluent":
        m.streak_days = (m.streak_days or 0) + 1
        if m.streak_days >= _STREAK_THRESHOLD:
            m.status = "passed"
            m.passed_at = now
    else:
        m.streak_days = 0  # 重置连续天数

    await db.commit()
    await db.refresh(m)
    return _serialize(m)


# ─── List ────────────────────────────────────────────────

class MaterialUpdateBody(BaseModel):
    title: str | None = None
    topic: str | None = None
    part: str | None = None
    content: str | None = None
    keywords_cn: list[str] | None = None


@router.patch("/{material_id}")
async def update_material(material_id: str, body: MaterialUpdateBody, db: AsyncSession = Depends(get_db)):
    """编辑素材"""
    m = await db.get(SpeakingMaterial, material_id)
    if not m:
        raise HTTPException(404, "素材不存在")

    if body.title is not None:
        m.title = body.title
    if body.topic is not None:
        m.topic = body.topic
    if body.part is not None:
        m.part = body.part
    if body.content is not None:
        m.content = body.content
    if body.keywords_cn is not None:
        m.keywords_cn = _json.dumps(body.keywords_cn, ensure_ascii=False)

    await db.commit()
    await db.refresh(m)
    return _serialize(m)


@router.get("")
async def list_materials(
    status: str | None = None,
    part: str | None = None,
    topic: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """列表，支持 status/part/topic 筛选"""
    q = select(SpeakingMaterial).order_by(SpeakingMaterial.sort_order)
    if status:
        q = q.where(SpeakingMaterial.status == status)
    if part:
        q = q.where(SpeakingMaterial.part == part)
    if topic:
        q = q.where(SpeakingMaterial.topic == topic)
    result = await db.execute(q)
    return [_serialize(m) for m in result.scalars().all()]


# ─── Stats ───────────────────────────────────────────────

@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """统计数据"""
    total = (await db.execute(select(func.count()).select_from(SpeakingMaterial))).scalar() or 0
    active = (await db.execute(
        select(func.count()).select_from(SpeakingMaterial).where(SpeakingMaterial.status == "active")
    )).scalar() or 0
    passed = (await db.execute(
        select(func.count()).select_from(SpeakingMaterial).where(SpeakingMaterial.status == "passed")
    )).scalar() or 0

    # 按 part 分布
    part_q = await db.execute(
        select(SpeakingMaterial.part, func.count(SpeakingMaterial.id))
        .group_by(SpeakingMaterial.part)
    )
    by_part = {row[0]: row[1] for row in part_q.all()}

    return {
        "total": total,
        "active": active,
        "passed": passed,
        "by_part": by_part,
        "streak_threshold": _STREAK_THRESHOLD,
    }


# ─── Seed ────────────────────────────────────────────────

@router.post("/seed")
async def seed_materials(db: AsyncSession = Depends(get_db)):
    """从 JSON 种子文件导入素材（仅当表为空时）"""
    count_q = await db.execute(select(func.count(SpeakingMaterial.id)))
    count = count_q.scalar() or 0
    if count > 0:
        return {"message": f"已有 {count} 条素材，跳过导入。", "imported": 0}

    seed_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "data", "speaking_materials_seed.json"
    )
    if not os.path.exists(seed_path):
        raise HTTPException(500, "种子文件不存在")

    with open(seed_path, "r", encoding="utf-8") as f:
        items = _json.load(f)

    for i, item in enumerate(items):
        db.add(SpeakingMaterial(
            id=str(uuid.uuid4()),
            title=item["title"],
            topic=item["topic"],
            part=item["part"],
            content=item["content"],
            keywords_cn=_json.dumps(item["keywords_cn"], ensure_ascii=False),
            score=item["score"],
            homework_id=item.get("homework_id"),
            sort_order=i,
        ))

    await db.commit()
    return {"message": f"导入 {len(items)} 条口语素材。", "imported": len(items)}
