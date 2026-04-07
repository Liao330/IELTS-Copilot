"""Service for generating review notes from homework + feedback content.

Gathers homework files text, feedback content, and calls the appropriate
agent (based on homework category) with a review-note prompt to produce
a concise, actionable review note.
"""

from __future__ import annotations

import base64
import json
import os

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


async def _get_file(db: AsyncSession, file_id: str | None) -> File | None:
    if not file_id:
        return None
    return await db.get(File, file_id)


def _get_file_text(f: File | None) -> str:
    if not f:
        return ""
    return (f.text_content or "").strip()


def _is_image(f: File | None) -> bool:
    if not f:
        return False
    return (f.mime_type or "").startswith("image/")


def _is_audio(f: File | None) -> bool:
    if not f:
        return False
    return (f.mime_type or "").startswith("audio/")


def _encode_image_base64(f: File) -> str | None:
    """Read an image file from disk and return its base64 data URL string."""
    if not f or not os.path.exists(f.filepath):
        return None
    try:
        with open(f.filepath, "rb") as fh:
            data = fh.read()
        mime = f.mime_type or "image/png"
        return f"data:{mime};base64,{base64.b64encode(data).decode()}"
    except Exception:
        return None


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
# Context builder (returns text + image list for vision-capable LLM)
# ---------------------------------------------------------------------------

async def _build_homework_material(
    hw: Homework, db: AsyncSession
) -> tuple[str, list[str]]:
    """Build a text block and a list of base64 image URLs from homework + feedbacks.

    Returns:
        (text_material, image_urls) where image_urls are data: URIs for vision input.
    """
    parts: list[str] = []
    images: list[str] = []

    cat_label = CATEGORY_LABELS.get(hw.category, hw.category)
    parts.append(f"# 作业信息\n- 科目：{cat_label}\n- 标题：{hw.title}\n- 日期：{hw.homework_date}")

    if hw.description:
        parts.append(f"- 备注：{hw.description}")

    # Homework files text content
    for hf in (hw.homework_files or []):
        f = await _get_file(db, hf.file_id)
        text = _get_file_text(f)
        if text:
            parts.append(f"\n## 作业原文\n{_truncate(text, MAX_FILE_TEXT_CHARS)}")
        elif _is_image(f):
            img_url = _encode_image_base64(f)
            if img_url:
                parts.append("\n## 作业原文（图片）\n[见附图]")
                images.append(img_url)

    # Legacy single file
    if hw.file_id and not hw.homework_files:
        f = await _get_file(db, hw.file_id)
        text = _get_file_text(f)
        if text:
            parts.append(f"\n## 作业原文\n{_truncate(text, MAX_FILE_TEXT_CHARS)}")
        elif _is_image(f):
            img_url = _encode_image_base64(f)
            if img_url:
                parts.append("\n## 作业原文（图片）\n[见附图]")
                images.append(img_url)

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

        # Text content from the feedback itself
        if fb.content:
            if fb.feedback_type == "teacher_text":
                parts.append(f"【老师文字点评 - 请重点参考】\n{_truncate(fb.content, MAX_FEEDBACK_TEXT_CHARS)}")
            else:
                parts.append(_truncate(fb.content, MAX_FEEDBACK_TEXT_CHARS))

        # Feedback attached file
        fb_file = await _get_file(db, fb.file_id)
        fb_file_text = _get_file_text(fb_file)

        if fb_file_text:
            parts.append(f"反馈附件内容：\n{_truncate(fb_file_text, MAX_FILE_TEXT_CHARS)}")
        elif _is_image(fb_file):
            # Teacher image feedback -> send to vision model
            img_url = _encode_image_base64(fb_file)
            if img_url:
                parts.append(f"[老师图片点评见附图 - 请仔细阅读图片中的标注和批改内容]")
                images.append(img_url)
        elif _is_audio(fb_file):
            parts.append("[该反馈为语音点评，暂无法自动转文字。如有文字版本请补充到反馈内容中。]")

    return "\n".join(parts), images


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

    # Build material text + images
    material, images = await _build_homework_material(hw, db)

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

    # 3. User message with homework + feedbacks (multimodal if images exist)
    if images:
        # Build multimodal content: text + image(s)
        content_parts: list[dict] = [
            {"type": "text", "text": f"请根据以下作业和反馈内容，生成一份精华复盘笔记：\n\n{material}"},
        ]
        for img_url in images:
            content_parts.append({
                "type": "image_url",
                "image_url": {"url": img_url},
            })
        messages.append({"role": "user", "content": content_parts})
    else:
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
