from __future__ import annotations

import json
import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listening_practice import (
    ListeningPracticeSentence,
    ListeningPracticeGenerated,
)
from app.models.vocabulary import VocabularyWord
from app.prompts.listening_practice_prompt import LISTENING_PRACTICE_GENERATE_PROMPT
from app.services.llm_service import complete_chat
from app.utils.llm_config import get_llm_config


# ==================== 常量 ====================

VOCAB_SOURCE_PREFIX = "listening-practice:"  # 写入 source_conversation_id 的前缀，用于反查


# ==================== 工具 ====================

def _normalize_word(word: str) -> str:
    return word.strip().lower()


def _clean_json_response(raw: str) -> str:
    """剥离 LLM 返回中可能的 markdown 代码块包裹"""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()
    return cleaned


def _validate_generated_item(item: dict) -> None:
    required = {"blocker_word", "difficulty_type", "explanation", "examples"}
    missing = required - set(item.keys())
    if missing:
        raise ValueError(f"LLM 返回缺少字段: {missing}")
    if not isinstance(item["examples"], list) or not item["examples"]:
        raise ValueError("examples 必须是非空数组")
    for ex in item["examples"]:
        for k in ("text", "translation", "difficulty_level", "hint"):
            if k not in ex:
                raise ValueError(f"example 缺少字段: {k}")


# ==================== 单词本双向同步 ====================

async def sync_blockers_to_vocabulary(
    db: AsyncSession,
    session_id: str,
    old_blockers: list[dict],
    new_blockers: list[dict],
) -> list[dict]:
    """根据新旧障碍词差异同步单词本：
    - 新增的词 → 插入 VocabularyWord（若同词已存在则复用 id）
    - 移除的词 → 删除对应 VocabularyWord（仅限来源为本会话的）

    返回 new_blockers 的增强版本（每项附上 vocab_word_id）。
    """
    source_id = f"{VOCAB_SOURCE_PREFIX}{session_id}"
    old_words_set = {_normalize_word(b["word"]) for b in old_blockers}
    new_words_set = {_normalize_word(b["word"]) for b in new_blockers}

    # 新增的词
    added = new_words_set - old_words_set
    # 被删除的词
    removed = old_words_set - new_words_set

    # 处理删除：仅删除来源精确匹配的条目
    if removed:
        q = await db.execute(
            select(VocabularyWord).where(
                and_(
                    VocabularyWord.source_conversation_id == source_id,
                    VocabularyWord.category == "listening",
                )
            )
        )
        for vw in q.scalars().all():
            if _normalize_word(vw.word) in removed:
                await db.delete(vw)

    # 处理新增：插入或复用
    word_id_map: dict[str, str] = {}  # normalized_word -> vocab_word_id
    if added:
        for w in added:
            # 检查同词是否已存在（任何 category）
            existing_q = await db.execute(
                select(VocabularyWord).where(
                    VocabularyWord.word.ilike(w)
                )
            )
            existing = existing_q.scalars().first()
            if existing:
                word_id_map[w] = existing.id
            else:
                new_id = str(uuid.uuid4())
                db.add(VocabularyWord(
                    id=new_id,
                    word=w,
                    meaning="（精听标记，待补充释义）",
                    category="listening",
                    source_conversation_id=source_id,
                    next_review_at=datetime.utcnow(),
                ))
                word_id_map[w] = new_id

    # 构建增强后的 new_blockers
    # 先保留旧条目上已有的 vocab_word_id
    old_map = {_normalize_word(b["word"]): b.get("vocab_word_id") for b in old_blockers}
    enriched: list[dict] = []
    for b in new_blockers:
        norm = _normalize_word(b["word"])
        vocab_id = b.get("vocab_word_id") or word_id_map.get(norm) or old_map.get(norm)
        enriched.append({
            "word": b["word"],
            "start": b["start"],
            "end": b["end"],
            "vocab_word_id": vocab_id,
        })

    return enriched


# ==================== AI 生成 ====================

async def generate_for_sentence(
    db: AsyncSession,
    sentence: ListeningPracticeSentence,
    words: list[str],
    force_refresh: bool = False,
) -> list[ListeningPracticeGenerated]:
    """为指定句子的障碍词批量生成/返回缓存练习块。"""
    if not words:
        return []

    # 归一化 + 去重，保留原大小写作为展示
    seen: set[str] = set()
    unique_words: list[str] = []
    for w in words:
        n = _normalize_word(w)
        if n and n not in seen:
            seen.add(n)
            unique_words.append(n)

    # 读取已缓存
    cached_q = await db.execute(
        select(ListeningPracticeGenerated).where(
            ListeningPracticeGenerated.sentence_id == sentence.id
        )
    )
    cached_list = list(cached_q.scalars().all())
    cached_map = {g.blocker_word: g for g in cached_list}

    if force_refresh:
        # 全部删掉重来
        for g in cached_list:
            await db.delete(g)
        await db.flush()
        cached_map = {}

    # 需要调 LLM 的词
    missing = [w for w in unique_words if w not in cached_map]

    if missing:
        model_name, api_key, api_base = await get_llm_config(db)
        if not api_key:
            raise HTTPException(status_code=400, detail="未配置 API Key，请前往设置页面配置")

        user_payload = json.dumps({
            "original_sentence": sentence.original_text,
            "blocker_words": missing,
        }, ensure_ascii=False)

        messages = [
            {"role": "system", "content": LISTENING_PRACTICE_GENERATE_PROMPT},
            {"role": "user", "content": user_payload},
        ]

        try:
            raw = await complete_chat(
                model=model_name,
                api_key=api_key,
                api_base=api_base,
                messages=messages,
                temperature=0.6,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"AI 调用失败: {e}")

        cleaned = _clean_json_response(raw)
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail="AI 返回格式异常，请重试")

        if not isinstance(parsed, list):
            raise HTTPException(status_code=500, detail="AI 返回非数组格式")

        # 落库
        for item in parsed:
            try:
                _validate_generated_item(item)
            except ValueError as e:
                # 单条失败跳过，不中断全部
                print(f"[listening_practice] 跳过非法项: {e}")
                continue

            norm = _normalize_word(item["blocker_word"])
            if norm not in seen:
                continue
            if norm in cached_map:
                continue

            block = ListeningPracticeGenerated(
                id=str(uuid.uuid4()),
                sentence_id=sentence.id,
                blocker_word=norm,
                difficulty_type=item["difficulty_type"],
                explanation=item["explanation"],
                examples=json.dumps(item["examples"], ensure_ascii=False),
            )
            db.add(block)
            cached_map[norm] = block

        await db.flush()

    # 按 unique_words 顺序返回最终结果
    return [cached_map[w] for w in unique_words if w in cached_map]
