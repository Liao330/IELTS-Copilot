"""精听笔记 AI 整理服务。

把用户粘贴的、格式混乱的听力复盘笔记，交给 LLM 抽取为结构化的
「答案句 + 用户上下文 + 目标词」列表。

流程：
1. 前端把原始笔记（`raw_text`）POST 到 `/cleanup`
2. 本服务调 LLM 返回 JSON
3. 在 Python 端做一次位置定位（复用 `_find_word_offsets`）
4. 返回前端预览；前端确认后走 create_session 接口落库
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.prompts.listening_cleanup_prompt import LISTENING_CLEANUP_PROMPT
from app.services.llm_service import complete_chat
from app.services.listening_demo_service import _find_word_offsets
from app.services.listening_practice_service import _clean_json_response, _normalize_word
from app.utils.llm_config import get_llm_config


logger = logging.getLogger(__name__)


async def cleanup_listening_note(
    db: AsyncSession,
    raw_text: str,
) -> list[dict[str, Any]]:
    """把用户粘贴的笔记整理为 [{text, note, target_words, prefilled_blockers}]

    - `prefilled_blockers`: Python 端自动定位好的障碍词位置，可直接用于落库
      [{"word": str, "start": int, "end": int}]
    """
    raw_text = (raw_text or "").strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="笔记内容不能为空")

    model_name, api_key, api_base = await get_llm_config(db)
    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 API Key，请前往设置页面配置")

    messages = [
        {"role": "system", "content": LISTENING_CLEANUP_PROMPT},
        {"role": "user", "content": raw_text},
    ]

    try:
        raw = await complete_chat(
            model=model_name,
            api_key=api_key,
            api_base=api_base,
            messages=messages,
            temperature=0.2,  # 低温度：抽取任务要求忠实于原文
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 整理失败: {e}")

    cleaned = _clean_json_response(raw)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("AI 整理返回非 JSON：%s", cleaned[:500])
        raise HTTPException(status_code=500, detail="AI 返回格式异常，请重试")

    items = parsed.get("sentences") if isinstance(parsed, dict) else None
    if not isinstance(items, list):
        raise HTTPException(status_code=500, detail="AI 返回缺少 sentences 数组")

    result: list[dict[str, Any]] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        text = (it.get("text") or "").strip()
        if not text:
            continue  # 跳过没有答案句的条目
        note = (it.get("note") or "").strip() or None
        raw_words = it.get("target_words") or []
        if not isinstance(raw_words, list):
            raw_words = []

        # 仅保留真实出现在原文中的词（保留原始大小写用于后续匹配）
        target_words: list[str] = []
        seen: set[str] = set()
        for w in raw_words:
            if not isinstance(w, str):
                continue
            w_stripped = w.strip()
            if not w_stripped:
                continue
            # 大小写不敏感地判断是否在 text 里
            if w_stripped.lower() in text.lower():
                norm = _normalize_word(w_stripped)
                if norm in seen:
                    continue
                seen.add(norm)
                target_words.append(w_stripped)

        # 预定位：按 target_words 在 text 中的原样匹配，优先按原大小写定位，
        # 失败则退化为小写匹配
        prefilled = _locate_words_in_text(text, target_words)

        result.append({
            "text": text,
            "note": note,
            "target_words": target_words,
            "prefilled_blockers": prefilled,
        })

    return result


def _locate_words_in_text(text: str, words: list[str]) -> list[dict[str, Any]]:
    """返回 [{word, start, end}]，在 text 中定位每个词的字符位置。

    优先按原样匹配；若找不到，退化为小写匹配再映射回原文切片。
    """
    # 原样匹配
    matched = _find_word_offsets(text, words)
    matched_words_norm = {_normalize_word(w) for w, _, _ in matched}

    out: list[dict[str, Any]] = [
        {"word": text[s:e], "start": s, "end": e} for (_, s, e) in matched
    ]

    # 对没匹配到的词做小写匹配
    text_lower = text.lower()
    cursor_by_word: dict[str, int] = {}
    used: list[tuple[int, int]] = [(s, e) for _, s, e in matched]

    for w in words:
        if _normalize_word(w) in matched_words_norm:
            continue
        wl = w.lower()
        start_from = cursor_by_word.get(wl, 0)
        idx = text_lower.find(wl, start_from)
        while idx >= 0:
            end = idx + len(wl)
            if not any(not (end <= s or idx >= e) for s, e in used):
                break
            idx = text_lower.find(wl, end)
        if idx < 0:
            continue
        end = idx + len(wl)
        out.append({"word": text[idx:end], "start": idx, "end": end})
        used.append((idx, end))
        cursor_by_word[wl] = end

    # 按起始位置排序
    out.sort(key=lambda x: x["start"])
    return out
