"""Service for generating AI-powered homework summaries and daily reports.

Aggregates homework data, feedback content, and file text_content,
then calls the LLM with structured prompts to generate insights.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import select, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.homework import Homework, HomeworkFile, HomeworkFeedback
from app.models.file import File
from app.models.note import Note
from app.models.setting import Setting
from app.services.llm_service import complete_chat

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CATEGORY_LABELS = {
    "writing": "写作",
    "speaking": "口语",
    "reading": "阅读",
    "listening": "听力",
}

# Token budget limits (character-based approximation, 1 token ≈ 1.5 Chinese chars)
MAX_FILE_TEXT_CHARS = 800          # per file
MAX_FEEDBACK_TEXT_CHARS = 1200     # per feedback
MAX_HOMEWORK_CONTEXT_CHARS = 3000  # per homework total
MAX_TOTAL_CONTEXT_CHARS = 12000    # total for all homeworks
MAX_NOTE_TEXT_CHARS = 500          # per note
MAX_NOTES_TOTAL_CHARS = 2000      # total for notes section


# ---------------------------------------------------------------------------
# Recency weights
# ---------------------------------------------------------------------------

def build_recency_weights(count: int) -> list[float]:
    """Return descending recency weights for *count* items.

    The most-recent item gets 1.0; the step between items is calculated so that
    the last item gets a small positive weight.

    Examples:
        count=5  -> [1.0, 0.8, 0.6, 0.4, 0.2]
        count=3  -> [1.0, 0.6, 0.2]
        count=1  -> [1.0]
    """
    if count <= 0:
        return []
    if count == 1:
        return [1.0]
    step = 0.8 / (count - 1)
    return [round(1.0 - i * step, 2) for i in range(count)]


# ---------------------------------------------------------------------------
# LLM provider resolution (shared helper extracted from notes router pattern)
# ---------------------------------------------------------------------------

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
# Data aggregation helpers
# ---------------------------------------------------------------------------

def _truncate(text: str | None, limit: int) -> str:
    """Truncate text to *limit* characters, adding ellipsis if cut."""
    if not text:
        return ""
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[:limit] + "…"


async def _get_file_text(db: AsyncSession, file_id: str | None) -> str:
    """Return text_content of a file, or empty string."""
    if not file_id:
        return ""
    f = await db.get(File, file_id)
    return (f.text_content or "").strip() if f else ""


async def _build_homework_context(hw: Homework, db: AsyncSession, weight: float) -> dict:
    """Build a context dict for a single homework with its feedbacks and files."""
    parts: list[str] = []
    char_budget = MAX_HOMEWORK_CONTEXT_CHARS

    # Basic info
    cat = CATEGORY_LABELS.get(hw.category, hw.category)
    header = f"[{cat}] {hw.title} ({hw.homework_date})"
    parts.append(header)
    if hw.description:
        parts.append(f"备注: {_truncate(hw.description, 300)}")

    # Homework files text_content
    for hf in (hw.homework_files or []):
        text = await _get_file_text(db, hf.file_id)
        if text:
            parts.append(f"作业文件内容: {_truncate(text, MAX_FILE_TEXT_CHARS)}")

    # Legacy single file
    if hw.file_id and not hw.homework_files:
        text = await _get_file_text(db, hw.file_id)
        if text:
            parts.append(f"作业文件内容: {_truncate(text, MAX_FILE_TEXT_CHARS)}")

    # Feedbacks (highest priority for insight)
    for fb in (hw.feedbacks or []):
        if fb.content:
            parts.append(f"反馈({fb.feedback_type}): {_truncate(fb.content, MAX_FEEDBACK_TEXT_CHARS)}")
        fb_file_text = await _get_file_text(db, fb.file_id)
        if fb_file_text:
            parts.append(f"反馈附件内容: {_truncate(fb_file_text, MAX_FILE_TEXT_CHARS)}")

    full_text = "\n".join(parts)
    full_text = _truncate(full_text, char_budget)

    return {
        "homework_id": hw.id,
        "title": hw.title,
        "category": hw.category,
        "category_label": cat,
        "homework_date": str(hw.homework_date),
        "weight": weight,
        "feedback_count": len(hw.feedbacks or []),
        "context_text": full_text,
    }


def _load_options():
    """SQLAlchemy eager-load options for Homework."""
    return [selectinload(Homework.feedbacks), selectinload(Homework.homework_files)]


async def get_recent_homeworks(
    db: AsyncSession,
    limit: int = 5,
    category: str | None = None,
) -> list[Homework]:
    """Fetch the most-recent homeworks ordered by homework_date desc."""
    stmt = (
        select(Homework)
        .options(*_load_options())
        .order_by(desc(Homework.homework_date), desc(Homework.created_at))
    )
    if category:
        stmt = stmt.where(Homework.category == category)
    stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_homeworks_for_date(
    db: AsyncSession,
    target_date: date,
) -> list[Homework]:
    """Fetch all homeworks for a specific date."""
    stmt = (
        select(Homework)
        .options(*_load_options())
        .where(Homework.homework_date == target_date)
        .order_by(desc(Homework.created_at))
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_notes_for_context(
    db: AsyncSession,
    target_date: date | None = None,
    limit: int = 5,
) -> list[Note]:
    """Fetch recent notes, optionally filtered to a date range around target_date."""
    stmt = select(Note).order_by(desc(Note.updated_at)).limit(limit)
    if target_date:
        start = target_date
        end = target_date + timedelta(days=1)
        stmt = (
            select(Note)
            .where(and_(Note.updated_at >= str(start), Note.updated_at < str(end)))
            .order_by(desc(Note.updated_at))
            .limit(limit)
        )
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def _build_summary_prompt(homework_contexts: list[dict]) -> list[dict]:
    """Build the LLM messages for homework trend summary."""
    # Assemble context block with weights
    context_parts: list[str] = []
    total_chars = 0
    for ctx in homework_contexts:
        entry = f"--- 作业 (权重={ctx['weight']}) ---\n{ctx['context_text']}"
        if total_chars + len(entry) > MAX_TOTAL_CONTEXT_CHARS:
            entry = _truncate(entry, MAX_TOTAL_CONTEXT_CHARS - total_chars)
            context_parts.append(entry)
            break
        context_parts.append(entry)
        total_chars += len(entry)

    context_block = "\n\n".join(context_parts)

    system = (
        "你是一位专业的雅思学习复盘分析师。你的任务是根据学生最近的作业与老师反馈，"
        "分析学习趋势，识别进步点、薄弱环节和反复出现的问题，并给出具体可执行的改进建议。\n\n"
        "要求：\n"
        "1. 越近的作业（权重越高）越重要，请优先关注高权重作业的内容\n"
        "2. 结论必须具体，避免空话套话\n"
        "3. 识别重复出现的问题时要引用具体证据\n"
        "4. 下一步建议必须可执行，而非泛泛的「多练习」\n"
        "5. 请严格按照 JSON 格式输出，不要输出其他内容\n\n"
        "输出格式（纯 JSON，不要包裹在 markdown 代码块中）：\n"
        "{\n"
        '  "overview": "总体概览（2-3句话）",\n'
        '  "strengths": ["进步点1", "进步点2"],\n'
        '  "weaknesses": ["薄弱点1", "薄弱点2"],\n'
        '  "repeated_issues": ["重复问题1", "重复问题2"],\n'
        '  "next_actions": ["具体行动1", "具体行动2", "具体行动3"],\n'
        '  "trend": "趋势判断（如：稳定进步/波动/某一项退步）"\n'
        "}"
    )

    user = f"以下是学生最近 {len(homework_contexts)} 次作业的详细记录（按时间从近到远排列，权重递减）：\n\n{context_block}\n\n请分析以上内容并输出 JSON 格式的趋势总结。"

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _build_daily_prompt(
    target_date: date,
    today_contexts: list[dict],
    recent_contexts: list[dict],
    notes_text: str | None = None,
) -> list[dict]:
    """Build the LLM messages for daily report."""
    date_str = target_date.strftime("%Y-%m-%d")

    # Today's homework context
    if today_contexts:
        today_block_parts: list[str] = []
        for ctx in today_contexts:
            today_block_parts.append(ctx["context_text"])
        today_block = "\n\n".join(today_block_parts)
        today_section = f"## 当日作业详情\n{today_block}"
    else:
        today_section = "## 当日作业详情\n当日无新增作业。"

    # Recent homework context for comparison
    if recent_contexts:
        recent_parts: list[str] = []
        total = 0
        for ctx in recent_contexts:
            entry = f"[{ctx['category_label']}] {ctx['title']} ({ctx['homework_date']}, 权重={ctx['weight']})"
            # For daily report, only include brief info for recent ones
            if ctx.get("context_text"):
                brief = _truncate(ctx["context_text"], 600)
                entry += f"\n{brief}"
            if total + len(entry) > 6000:
                break
            recent_parts.append(entry)
            total += len(entry)
        recent_block = "\n\n".join(recent_parts)
        recent_section = f"## 近期作业参考（用于对比）\n{recent_block}"
    else:
        recent_section = "## 近期作业参考\n暂无历史作业数据。"

    # Notes section (optional)
    notes_section = ""
    if notes_text:
        notes_section = f"\n\n## 笔记补充\n{notes_text}"

    system = (
        "你是一位专业的雅思学习日报助手。你的任务是为学生生成当日学习回顾日报。\n\n"
        "要求：\n"
        "1. 即使当天没有新作业，也要生成有价值的轻日报（回顾近期重点问题、建议明日行动）\n"
        "2. 对比当日与近期作业，识别变化趋势\n"
        "3. 建议具体可执行，不要泛泛而谈\n"
        "4. 保持积极鼓励的语气，但不回避问题\n"
        "5. 请严格按照 JSON 格式输出，不要输出其他内容\n\n"
        "输出格式（纯 JSON，不要包裹在 markdown 代码块中）：\n"
        "{\n"
        '  "overview": "今日概览（1-2句话）",\n'
        '  "today_focus": ["今日重点1", "今日重点2"],\n'
        '  "today_issues": ["今日问题1", "今日问题2"],\n'
        '  "comparison_to_recent": "与近期对比的变化分析（1-2句话）",\n'
        '  "tomorrow_actions": ["明日行动1", "明日行动2", "明日行动3"]\n'
        "}"
    )

    user = (
        f"日期：{date_str}\n\n"
        f"{today_section}\n\n"
        f"{recent_section}"
        f"{notes_section}\n\n"
        "请根据以上信息生成今日学习日报（JSON 格式）。"
    )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


# ---------------------------------------------------------------------------
# LLM response parsing
# ---------------------------------------------------------------------------

def _parse_json_response(raw: str) -> dict:
    """Best-effort parse of LLM JSON output, handling markdown fences."""
    text = raw.strip()
    # Remove markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```json or ```) and last line (```)
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON object in the text
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass
        # Fallback: return raw text as overview
        return {"overview": text, "parse_error": True}


# ---------------------------------------------------------------------------
# Public API: generate summaries
# ---------------------------------------------------------------------------

async def generate_homework_summary(
    db: AsyncSession,
    limit: int = 5,
    category: str | None = None,
) -> dict:
    """Generate an AI-powered trend summary of recent homeworks.

    Returns a dict with:
      - ai_summary: structured AI analysis
      - stats: basic statistics
      - source_homework_ids: list of homework IDs used
      - source_count: number of homeworks analyzed
    """
    homeworks = await get_recent_homeworks(db, limit=limit, category=category)

    if not homeworks:
        return {
            "ai_summary": {
                "overview": "暂无作业数据，无法生成趋势总结。请先上传作业后再来查看。",
                "strengths": [],
                "weaknesses": [],
                "repeated_issues": [],
                "next_actions": ["开始你的第一次作业练习！"],
                "trend": "暂无数据",
            },
            "stats": {
                "total_homeworks": 0,
                "categories": {},
                "total_feedbacks": 0,
                "date_range": None,
            },
            "source_homework_ids": [],
            "source_count": 0,
        }

    weights = build_recency_weights(len(homeworks))

    # Build context for each homework
    homework_contexts: list[dict] = []
    for hw, w in zip(homeworks, weights):
        ctx = await _build_homework_context(hw, db, w)
        homework_contexts.append(ctx)

    # Basic statistics
    cat_counts: dict[str, int] = {}
    total_feedbacks = 0
    for hw in homeworks:
        cat_counts[hw.category] = cat_counts.get(hw.category, 0) + 1
        total_feedbacks += len(hw.feedbacks or [])

    dates = [hw.homework_date for hw in homeworks]
    date_range = {
        "start": str(min(dates)),
        "end": str(max(dates)),
    }

    # Call LLM
    model, api_key, api_base = await _resolve_llm_config(db)
    messages = _build_summary_prompt(homework_contexts)
    raw_response = await complete_chat(
        model=model,
        api_key=api_key,
        api_base=api_base,
        messages=messages,
        temperature=0.4,
    )

    ai_summary = _parse_json_response(raw_response)

    return {
        "ai_summary": ai_summary,
        "stats": {
            "total_homeworks": len(homeworks),
            "categories": {CATEGORY_LABELS.get(k, k): v for k, v in cat_counts.items()},
            "total_feedbacks": total_feedbacks,
            "date_range": date_range,
        },
        "source_homework_ids": [hw.id for hw in homeworks],
        "source_count": len(homeworks),
    }


async def generate_daily_report(
    db: AsyncSession,
    target_date: date | None = None,
    include_notes: bool = False,
) -> dict:
    """Generate an AI-powered daily learning report.

    Returns a dict with:
      - ai_report: structured AI daily report
      - stats: today's statistics
      - date: the report date
    """
    if target_date is None:
        target_date = date.today()

    # Today's homeworks
    today_hws = await get_homeworks_for_date(db, target_date)

    # Recent homeworks for comparison (last 5, excluding today's)
    recent_hws = await get_recent_homeworks(db, limit=7)
    recent_hws = [hw for hw in recent_hws if hw.homework_date != target_date][:5]

    # Build contexts
    today_contexts: list[dict] = []
    for hw in today_hws:
        ctx = await _build_homework_context(hw, db, weight=1.0)
        today_contexts.append(ctx)

    recent_weights = build_recency_weights(len(recent_hws))
    recent_contexts: list[dict] = []
    for hw, w in zip(recent_hws, recent_weights):
        ctx = await _build_homework_context(hw, db, w)
        recent_contexts.append(ctx)

    # Notes (optional)
    notes_text: str | None = None
    if include_notes:
        notes = await get_notes_for_context(db, target_date=target_date)
        if not notes:
            # Fallback to recent notes
            notes = await get_notes_for_context(db, limit=3)
        if notes:
            parts: list[str] = []
            total = 0
            for n in notes:
                entry = f"[{n.category}] {n.title}: {_truncate(n.content, MAX_NOTE_TEXT_CHARS)}"
                if total + len(entry) > MAX_NOTES_TOTAL_CHARS:
                    break
                parts.append(entry)
                total += len(entry)
            notes_text = "\n".join(parts) if parts else None

    # Today's stats
    today_categories = list(set(hw.category for hw in today_hws))
    today_feedback_count = sum(len(hw.feedbacks or []) for hw in today_hws)

    stats = {
        "date": str(target_date),
        "homework_count": len(today_hws),
        "categories": [CATEGORY_LABELS.get(c, c) for c in today_categories],
        "feedback_count": today_feedback_count,
        "has_data": len(today_hws) > 0,
    }

    # Call LLM
    model, api_key, api_base = await _resolve_llm_config(db)
    messages = _build_daily_prompt(target_date, today_contexts, recent_contexts, notes_text)
    raw_response = await complete_chat(
        model=model,
        api_key=api_key,
        api_base=api_base,
        messages=messages,
        temperature=0.4,
    )

    ai_report = _parse_json_response(raw_response)

    return {
        "ai_report": ai_report,
        "stats": stats,
        "date": str(target_date),
    }
