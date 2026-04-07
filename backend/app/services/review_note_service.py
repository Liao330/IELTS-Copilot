"""Service for generating review notes from homework + feedback content.

Gathers homework files text, feedback content, and calls the appropriate
agent (based on homework category) with a review-note prompt to produce
a concise, actionable review note.
"""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.homework import Homework, HomeworkFeedback
from app.models.file import File
from app.models.setting import Setting
from app.models.agent import Agent
from app.services.llm_service import complete_chat
from app.prompts.review_note import REVIEW_NOTE_PROMPT


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CATEGORY_LABELS = {
    "writing": "写作",
    "speaking": "口语",
    "reading": "阅读",
    "listening": "听力",
}

MAX_FILE_TEXT_CHARS = 2000
MAX_FEEDBACK_TEXT_CHARS = 3000

# Map homework category to preferred agent for generating review notes
CATEGORY_AGENT_MAP = {
    "writing": "writing-assistant",
    "speaking": "speaking-feedback",
    "reading": "reading-assistant",
    "listening": "listening-assistant",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _truncate(text: str | None, limit: int) -> str:
    if not text:
        return ""
    text = text.strip()
    return text[:limit] + "…" if len(text) > limit else text


async def _get_file_text(db: AsyncSession, file_id: str | None) -> str:
    if not file_id:
        return ""
    f = await db.get(File, file_id)
    return (f.text_content or "").strip() if f else ""


async def _resolve_llm_config(db: AsyncSession) -> tuple[str, str, str | None]:
    """Return (model_name, api_key, api_base) from settings table."""
    result = await db.execute(select(Setting))
    settings = {s.key: s.value for s in result.scalars().all()}
    if not settings:
        raise RuntimeError("系统设置未初始化，请前往设置页面配置 LLM")

    model_name = settings.get("default_model", "openai/qwen-turbo-2024-11-01")
    providers_raw = settings.get("llm_providers", "{}")
    providers: dict = json.loads(providers_raw) if providers_raw else {}

    api_key: str | None = None
    api_base: str | None = None
    provider_key = model_name.split("/")[0] if "/" in model_name else model_name
    if provider_key in providers:
        cfg = providers[provider_key]
        api_key = cfg.get("api_key")
        api_base = cfg.get("api_base")
    if not api_key:
        for _name, cfg in providers.items():
            if cfg.get("api_key"):
                api_key = cfg["api_key"]
                api_base = cfg.get("api_base")
                break

    if not api_key:
        raise RuntimeError("未配置 API Key，请前往设置页面配置")

    return model_name, api_key, api_base


# ---------------------------------------------------------------------------
# Context builder
# ---------------------------------------------------------------------------

async def _build_homework_material(hw: Homework, db: AsyncSession) -> str:
    """Build a text block containing the homework content and all feedbacks."""
    parts: list[str] = []

    cat_label = CATEGORY_LABELS.get(hw.category, hw.category)
    parts.append(f"# 作业信息\n- 科目：{cat_label}\n- 标题：{hw.title}\n- 日期：{hw.homework_date}")

    if hw.description:
        parts.append(f"- 备注：{hw.description}")

    # Homework files text content
    for hf in (hw.homework_files or []):
        text = await _get_file_text(db, hf.file_id)
        if text:
            parts.append(f"\n## 作业原文\n{_truncate(text, MAX_FILE_TEXT_CHARS)}")

    # Legacy single file
    if hw.file_id and not hw.homework_files:
        text = await _get_file_text(db, hw.file_id)
        if text:
            parts.append(f"\n## 作业原文\n{_truncate(text, MAX_FILE_TEXT_CHARS)}")

    # Feedbacks (skip review_note type to avoid circular reference)
    fb_idx = 0
    for fb in (hw.feedbacks or []):
        if fb.feedback_type == "review_note":
            continue
        fb_idx += 1
        fb_type_label = {
            "ai_report": "AI 点评报告",
            "teacher_text": "老师文字点评",
            "teacher_audio": "老师语音点评",
            "teacher_image": "老师图片点评",
        }.get(fb.feedback_type, fb.feedback_type)

        parts.append(f"\n## 反馈 {fb_idx}（{fb_type_label}）")
        if fb.content:
            parts.append(_truncate(fb.content, MAX_FEEDBACK_TEXT_CHARS))
        fb_file_text = await _get_file_text(db, fb.file_id)
        if fb_file_text:
            parts.append(f"反馈附件内容：\n{_truncate(fb_file_text, MAX_FILE_TEXT_CHARS)}")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate_review_note(
    db: AsyncSession,
    homework_id: str,
) -> str:
    """Generate a review note for a homework with feedbacks.

    Returns the generated markdown content string.
    Raises RuntimeError if no feedbacks or LLM config issue.
    """
    # Load homework with relations
    stmt = (
        select(Homework)
        .options(selectinload(Homework.feedbacks), selectinload(Homework.homework_files))
        .where(Homework.id == homework_id)
    )
    result = await db.execute(stmt)
    hw = result.scalar_one_or_none()
    if not hw:
        raise RuntimeError("作业不存在")

    # Check that there are feedbacks (excluding existing review_notes)
    real_feedbacks = [fb for fb in (hw.feedbacks or []) if fb.feedback_type != "review_note"]
    if not real_feedbacks:
        raise RuntimeError("该作业暂无反馈，无法生成复盘笔记")

    # Build material text
    material = await _build_homework_material(hw, db)

    # Get agent system prompt for the category (adds domain expertise)
    agent_id = CATEGORY_AGENT_MAP.get(hw.category, "writing-assistant")
    agent_result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = agent_result.scalar_one_or_none()

    # Build LLM messages
    messages: list[dict] = []

    # 1. Review note system prompt (primary role)
    messages.append({"role": "system", "content": REVIEW_NOTE_PROMPT})

    # 2. Agent domain expertise as supplementary context
    if agent and agent.system_prompt:
        messages.append({
            "role": "system",
            "content": f"[领域专业知识参考]\n你同时具备以下{CATEGORY_LABELS.get(hw.category, '学习')}专项助手的专业知识，"
                       f"请在整理复盘笔记时参考其专业标准：\n\n{agent.system_prompt[:800]}",
        })

    # 3. User message with homework + feedbacks
    messages.append({
        "role": "user",
        "content": f"请根据以下作业和反馈内容，生成一份精华复盘笔记：\n\n{material}",
    })

    # Call LLM
    model, api_key, api_base = await _resolve_llm_config(db)
    content = await complete_chat(
        model=model,
        api_key=api_key,
        api_base=api_base,
        messages=messages,
        temperature=0.3,
    )

    return content.strip()
