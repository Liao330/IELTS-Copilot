from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.homework import Homework, HomeworkFile, HomeworkFeedback
from app.models.file import File
from app.prompts.homework_summary_prompt import HOMEWORK_SUMMARY_PROMPT, HOMEWORK_SEARCH_PROMPT
from app.services.llm_service import complete_chat
from app.utils.llm_config import get_llm_config


async def generate_summary_for_homework(db: AsyncSession, homework_id: str) -> str | None:
    """为单个作业生成 AI 摘要并持久化。返回摘要文本。"""
    hw = await db.get(Homework, homework_id)
    if not hw:
        return None

    # 收集所有文本内容
    texts: list[str] = []

    # 1. 附件文本
    hf_q = await db.execute(
        select(HomeworkFile).where(HomeworkFile.homework_id == homework_id)
    )
    for hf in hf_q.scalars().all():
        f = await db.get(File, hf.file_id)
        if f and f.text_content:
            texts.append(f.text_content[:3000])  # 每个文件取前 3000 字

    # 2. 反馈内容（AI report 等）
    fb_q = await db.execute(
        select(HomeworkFeedback).where(HomeworkFeedback.homework_id == homework_id)
    )
    for fb in fb_q.scalars().all():
        if fb.content:
            texts.append(fb.content[:2000])

    if not texts:
        # 没有文本内容，只用标题生成简要摘要
        hw.summary = f"[{hw.category}] {hw.title}（无附件文本内容）"
        hw.summary_updated_at = datetime.utcnow()
        return hw.summary

    combined = "\n---\n".join(texts)
    # 限制总长度
    if len(combined) > 8000:
        combined = combined[:8000]

    model_name, api_key, api_base = await get_llm_config(db)
    if not api_key:
        return None

    user_msg = f"标题: {hw.title}\n类别: {hw.category}\n内容:\n{combined}"

    messages = [
        {"role": "system", "content": HOMEWORK_SUMMARY_PROMPT},
        {"role": "user", "content": user_msg},
    ]

    try:
        summary = await complete_chat(
            model=model_name,
            api_key=api_key,
            api_base=api_base,
            messages=messages,
            temperature=0.3,
        )
        summary = summary.strip()
    except Exception as e:
        print(f"[homework_summary] 生成摘要失败 hw={homework_id}: {e}")
        return None

    hw.summary = summary
    hw.summary_updated_at = datetime.utcnow()
    return summary


async def search_homeworks_by_query(
    db: AsyncSession,
    query: str,
    category: str | None = None,
) -> list[dict]:
    """用 AI 语义搜索作业。使用复盘笔记作为上下文（信息量更大、搜索更准确）。
    返回 [{homework_id, title, category, homework_date, relevance_reason}]"""

    from sqlalchemy.orm import selectinload

    # 加载所有作业（含 feedbacks）
    stmt = select(Homework).options(selectinload(Homework.feedbacks))
    if category:
        stmt = stmt.where(Homework.category == category)
    stmt = stmt.order_by(Homework.homework_date.desc())

    result = await db.execute(stmt)
    homeworks = result.scalars().all()

    if not homeworks:
        return []

    # 构建上下文：优先使用复盘笔记，其次摘要，最后描述
    context_items: list[str] = []
    hw_map: dict[str, Homework] = {}
    for hw in homeworks:
        hw_map[hw.id] = hw
        # 获取复盘笔记
        review_note = ""
        for fb in (hw.feedbacks or []):
            if fb.feedback_type == "review_note" and fb.content:
                review_note = fb.content[:1500]  # 每份限制 1500 字
                break
        # Fallback: 用摘要或描述
        context_text = review_note or hw.summary or hw.description or "(无内容)"
        context_items.append(
            f"[{hw.id}] 《{hw.title}》 | {hw.category} | {hw.homework_date}\n{context_text}"
        )

    # 如果作业数太多，分批处理
    BATCH_SIZE = 40  # 复盘笔记更长，每批少一些
    all_results: list[dict] = []

    for i in range(0, len(context_items), BATCH_SIZE):
        batch = context_items[i:i + BATCH_SIZE]
        context_text = "\n---\n".join(batch)

        user_msg = f"用户查询：{query}\n\n作业列表（共 {len(batch)} 份）：\n{context_text}"

        model_name, api_key, api_base = await get_llm_config(db)
        if not api_key:
            return []

        messages = [
            {"role": "system", "content": HOMEWORK_SEARCH_PROMPT},
            {"role": "user", "content": user_msg},
        ]

        try:
            raw = await complete_chat(
                model=model_name,
                api_key=api_key,
                api_base=api_base,
                messages=messages,
                temperature=0.2,
            )
            # 清理可能的 markdown 包裹
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                lines = cleaned.split("\n")
                lines = [l for l in lines if not l.strip().startswith("```")]
                cleaned = "\n".join(lines).strip()

            parsed = json.loads(cleaned)
            if not isinstance(parsed, list):
                continue

            for item in parsed:
                hw_id = item.get("id", "")
                reason = item.get("reason", "")
                if hw_id in hw_map:
                    hw = hw_map[hw_id]
                    all_results.append({
                        "homework_id": hw.id,
                        "title": hw.title,
                        "category": hw.category,
                        "homework_date": hw.homework_date,
                        "relevance_reason": reason,
                    })
        except Exception as e:
            print(f"[homework_search] 搜索失败: {e}")
            continue

    return all_results
