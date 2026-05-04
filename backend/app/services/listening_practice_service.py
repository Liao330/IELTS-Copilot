from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from typing import NamedTuple

from fastapi import HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listening_practice import (
    ListeningPracticeSession,
    ListeningPracticeSentence,
    ListeningPracticeGenerated,
    ListeningDictationAttempt,
)
from app.models.vocabulary import VocabularyWord
from app.prompts.listening_practice_prompt import LISTENING_PRACTICE_GENERATE_PROMPT
from app.services.llm_service import complete_chat
from app.utils.llm_config import get_llm_config


# ==================== 常量 ====================

VOCAB_SOURCE_PREFIX = "listening-practice:"  # 写入 source_conversation_id 的前缀，用于反查


# ==================== 类型定义 ====================

class GenerationResult(NamedTuple):
    """生成结果容器，包含成功块、失败词列表及原始请求词列表"""
    blocks: list  # ListeningPracticeGenerated instances
    failed_words: list[dict]  # [{"word": "foo", "reason": "validation_error"}, ...]
    requested_words: list[str]  # 原始请求的词


# ==================== 工具 ====================

def _normalize_word(word: str) -> str:
    return word.strip().lower()


async def _get_recent_accuracy(db: AsyncSession, session_id: str) -> float | None:
    """获取该 session 近期听写的平均准确率。返回 None 表示无数据。"""
    # 查该 session 下所有句子的 generated blocks 的 attempts
    stmt = (
        select(ListeningDictationAttempt.accuracy_pct)
        .join(ListeningPracticeGenerated, ListeningDictationAttempt.generated_block_id == ListeningPracticeGenerated.id)
        .join(ListeningPracticeSentence, ListeningPracticeGenerated.sentence_id == ListeningPracticeSentence.id)
        .where(ListeningPracticeSentence.session_id == session_id)
        .order_by(ListeningDictationAttempt.created_at.desc())
        .limit(30)  # 最近 30 次听写
    )
    result = await db.execute(stmt)
    pcts = [row[0] for row in result.all()]
    if not pcts:
        return None
    return sum(pcts) / len(pcts)


async def _auto_translate_word(db: AsyncSession, word: str) -> str | None:
    """快速翻译单词获取中文释义，失败返回 None"""
    try:
        model_name, api_key, api_base = await get_llm_config(db)
        if not api_key:
            return None
        messages = [
            {"role": "system", "content": "你是英中翻译助手。只输出简短中文释义（不超过10字），不要任何解释。"},
            {"role": "user", "content": word},
        ]
        result = await complete_chat(
            model=model_name, api_key=api_key, api_base=api_base,
            messages=messages, temperature=0.1,
        )
        return result.strip()[:30] if result else None
    except Exception:
        return None


async def _full_translate_word(db: AsyncSession, word: str) -> dict | None:
    """调用 AI 查词获取完整单词信息（音标、词性、释义、例句、同义词），失败返回 None"""
    import json as _json
    from app.prompts.translate_prompt import TRANSLATE_SYSTEM_PROMPT
    try:
        model_name, api_key, api_base = await get_llm_config(db)
        if not api_key:
            return None
        messages = [
            {"role": "system", "content": TRANSLATE_SYSTEM_PROMPT},
            {"role": "user", "content": word},
        ]
        raw = await complete_chat(
            model=model_name, api_key=api_key, api_base=api_base,
            messages=messages, temperature=0.1,
        )
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            cleaned = "\n".join(lines).strip()
        return _json.loads(cleaned)
    except Exception:
        return None


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
                # 如果已有但 meaning 是占位符，尝试更新
                if existing.meaning and "待补充" in existing.meaning:
                    meaning = await _auto_translate_word(db, w)
                    if meaning:
                        existing.meaning = meaning
                word_id_map[w] = existing.id
            else:
                # AI 查词获取完整信息
                full_info = await _full_translate_word(db, w)
                if full_info and full_info.get("type") == "word":
                    import json as _json
                    meaning = full_info.get("meaning") or f"({w})"
                    syns = full_info.get("synonyms")
                    new_id = str(uuid.uuid4())
                    db.add(VocabularyWord(
                        id=new_id,
                        word=full_info.get("word") or w,
                        phonetic=full_info.get("phonetic"),
                        pos=full_info.get("pos"),
                        meaning=meaning,
                        example=full_info.get("example"),
                        example_cn=full_info.get("example_cn"),
                        synonyms=_json.dumps(syns, ensure_ascii=False) if syns else None,
                        category="listening",
                        source_conversation_id=source_id,
                        next_review_at=datetime.utcnow(),
                    ))
                else:
                    # Fallback to simple translation
                    meaning = await _auto_translate_word(db, w) or f"({w})"
                    new_id = str(uuid.uuid4())
                    db.add(VocabularyWord(
                        id=new_id,
                        word=w,
                        meaning=meaning,
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
    max_examples: int | None = None,
) -> GenerationResult:
    """为指定句子的障碍词批量生成/返回缓存练习块。
    
    返回：
      - blocks: 成功生成的 ListeningPracticeGenerated 对象列表
      - failed_words: 失败的词及失败原因 [{"word": "...", "reason": "..."}, ...]
      - requested_words: 原始请求的词列表
    
    失败原因类型：
      - "validation_error": LLM 返回的数据验证失败
      - "llm_error": AI 调用失败或返回格式异常
      - "config_error": 未配置 API key
      - "unexpected_word": LLM 返回了不在请求列表中的词
      - "unknown_error": 其他不可预期的错误
    """
    if not words:
        return GenerationResult(blocks=[], failed_words=[], requested_words=[])

    # 保留原始请求词用于最后的返回
    requested_words_original = words.copy()

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

    # 跟踪失败的词和生成成功的词
    failed_words: list[dict] = []
    generated_words: set[str] = set()

    if force_refresh:
        # 只删除没有听写记录的 block（保留有练习历史的）
        for g in cached_list:
            # 检查是否有听写记录
            attempt_q = await db.execute(
                select(ListeningDictationAttempt.id).where(
                    ListeningDictationAttempt.generated_block_id == g.id
                ).limit(1)
            )
            has_attempts = attempt_q.scalar_one_or_none() is not None
            if not has_attempts:
                await db.delete(g)
                del cached_map[g.blocker_word]
        await db.flush()

    # 需要调 LLM 的词
    missing = [w for w in unique_words if w not in cached_map]

    if missing:
        model_name, api_key, api_base = await get_llm_config(db)
        if not api_key:
            # API Key 未配置，标记所有 missing 词为配置错误
            for w in missing:
                failed_words.append({"word": w, "reason": "config_error"})
            # 返回缓存的结果
            for w in unique_words:
                if w in cached_map:
                    generated_words.add(w)
            result_blocks = [cached_map[w] for w in unique_words if w in cached_map]
            return GenerationResult(
                blocks=result_blocks,
                failed_words=failed_words,
                requested_words=requested_words_original,
            )

        payload: dict = {
            "original_sentence": sentence.original_text,
            "blocker_words": missing,
        }
        # 若该句带有用户上下文笔记（例如"听成了 camb"、"拼写错误"），作为额外提示给 LLM
        # 让梯度例句更贴合用户真实错题
        user_note = (sentence.note or "").strip() if sentence.note else ""
        if user_note:
            payload["user_context"] = user_note

        user_payload = json.dumps(payload, ensure_ascii=False)

        # 延伸模式：如果该句所在 session 的 note 含"延伸"标记，只生成1句简单句
        session_q = await db.execute(
            select(ListeningPracticeSession).where(
                ListeningPracticeSession.id == sentence.session_id
            )
        )
        sess = session_q.scalar_one_or_none()
        is_extension = bool(sess and sess.note and "延伸" in sess.note)

        # 确定生成数量：max_examples 参数 > 延伸模式 > 默认3句
        effective_max = max_examples
        if effective_max is None and is_extension:
            effective_max = 1

        system_prompt = LISTENING_PRACTICE_GENERATE_PROMPT
        if effective_max == 1:
            system_prompt += """

## 精简模式（特殊规则，覆盖上方规则1）
当前为精简练习模式，请遵循以下特殊规则：
- **examples 只需要 1 条**，difficulty_level 为 1（Easy，5-8 词短句）
- 练习句必须简单直白，除障碍词外全用最常见的词
- 让学生快速巩固障碍词
- 其余规则不变
"""
        elif effective_max == 2:
            system_prompt += """

## 精简模式（特殊规则，覆盖上方规则1）
当前为精简练习模式，请遵循以下特殊规则：
- **examples 只需要 2 条**：1 条 difficulty_level 1（Easy，5-8 词）+ 1 条 difficulty_level 2（Medium，8-12 词）
- 不需要生成 difficulty_level 3（Hard）的句子
- 除障碍词外，其余用词必须极其简单常见
- 其余规则不变
"""

        messages = [
            {"role": "system", "content": system_prompt},
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
            # LLM 调用失败，标记所有 missing 词为 llm_error
            import logging
            logging.getLogger(__name__).error(f"LLM 调用失败: {e}")
            for w in missing:
                failed_words.append({"word": w, "reason": "llm_error"})
            # 返回缓存的结果
            for w in unique_words:
                if w in cached_map:
                    generated_words.add(w)
            result_blocks = [cached_map[w] for w in unique_words if w in cached_map]
            return GenerationResult(
                blocks=result_blocks,
                failed_words=failed_words,
                requested_words=requested_words_original,
            )

        cleaned = _clean_json_response(raw)
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as e:
            # JSON 格式错误，标记所有 missing 词为 llm_error
            import logging
            logging.getLogger(__name__).error(f"AI 返回格式异常: {e}")
            for w in missing:
                failed_words.append({"word": w, "reason": "llm_error"})
            # 返回缓存的结果
            for w in unique_words:
                if w in cached_map:
                    generated_words.add(w)
            result_blocks = [cached_map[w] for w in unique_words if w in cached_map]
            return GenerationResult(
                blocks=result_blocks,
                failed_words=failed_words,
                requested_words=requested_words_original,
            )

        if not isinstance(parsed, list):
            # 返回非数组，标记所有 missing 词为 llm_error
            import logging
            logging.getLogger(__name__).error("AI 返回非数组格式")
            for w in missing:
                failed_words.append({"word": w, "reason": "llm_error"})
            # 返回缓存的结果
            for w in unique_words:
                if w in cached_map:
                    generated_words.add(w)
            result_blocks = [cached_map[w] for w in unique_words if w in cached_map]
            return GenerationResult(
                blocks=result_blocks,
                failed_words=failed_words,
                requested_words=requested_words_original,
            )

        # 第一阶段：验证和收集要插入的项（不落库）
        items_to_insert = []
        for item in parsed:
            try:
                _validate_generated_item(item)
            except ValueError as e:
                # 验证失败，记录失败原因
                norm = _normalize_word(item.get("blocker_word", ""))
                if norm in seen and norm not in cached_map:
                    failed_words.append({
                        "word": norm,
                        "reason": "validation_error",
                    })
                import logging
                logging.getLogger(__name__).warning(f"LLM 生成项验证失败: {e}, item={item}")
                continue

            norm = _normalize_word(item["blocker_word"])
            
            # 检查该词是否在请求列表中
            if norm not in seen:
                # LLM 返回了不在请求列表中的词，记录为 unexpected_word
                failed_words.append({
                    "word": norm,
                    "reason": "unexpected_word",
                })
                continue
            
            # 检查缓存冲突
            if norm in cached_map:
                # 该词已在缓存中，不需要重新生成（但不算失败）
                generated_words.add(norm)
                continue

            # 该项有效，加入待插入列表
            items_to_insert.append((norm, item))

        # 第二阶段：批量插入所有有效项
        if items_to_insert:
            for norm, item in items_to_insert:
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
                generated_words.add(norm)

            await db.flush()

    # 收集最终生成的词
    for w in unique_words:
        if w in cached_map:
            generated_words.add(w)

    # 找出没有生成的词（不是配置/LLM 错误）
    for w in unique_words:
        if w not in generated_words and not any(f["word"] == w for f in failed_words):
            # 这个词既不在生成集合中，也不在已记录的失败词中
            # 这不应该发生（调试用）
            failed_words.append({
                "word": w,
                "reason": "unknown_error",
            })

    # 按 unique_words 顺序返回最终结果
    result_blocks = [cached_map[w] for w in unique_words if w in cached_map]

    return GenerationResult(
        blocks=result_blocks,
        failed_words=failed_words,
        requested_words=requested_words_original,
    )
