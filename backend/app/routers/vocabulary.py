from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_

from app.database import get_db
from app.models.vocabulary import VocabularyWord, FavoriteSentence
from app.models.setting import Setting
from app.schemas.vocabulary import (
    WordCreate, WordUpdate, WordOut, ReviewAction,
    SentenceCreate, SentenceUpdate, SentenceOut,
    TranslateRequest, VocabularyStats,
)
from app.services.llm_service import complete_chat
from app.prompts.translate_prompt import TRANSLATE_SYSTEM_PROMPT

router = APIRouter(prefix="/api/vocabulary", tags=["vocabulary"])


# ==================== 工具函数 ====================

async def _get_llm_config(db: AsyncSession) -> tuple[str, str | None, str | None]:
    """从设置中获取 LLM 配置，返回 (model_name, api_key, api_base)"""
    result = await db.execute(select(Setting))
    settings = {s.key: s.value for s in result.scalars().all()}

    default_model = settings.get("default_model", "openai/qwen-turbo-2024-11-01")
    providers = json.loads(settings.get("llm_providers", "{}"))

    provider_key = default_model.split("/")[0] if "/" in default_model else default_model
    api_key = None
    api_base = None

    if provider_key in providers:
        api_key = providers[provider_key].get("api_key")
        api_base = providers[provider_key].get("api_base")

    if not api_key:
        for prov_config in providers.values():
            if prov_config.get("api_key"):
                api_key = prov_config["api_key"]
                api_base = prov_config.get("api_base")
                break

    return default_model, api_key, api_base


def _calculate_next_review(quality: int, review_count: int, ease_factor: float, interval_days: int):
    """
    基于 SM-2 算法（艾宾浩斯遗忘曲线）计算下次复习时间。
    quality: 0=不认识, 1=模糊, 2=认识, 3=熟练
    """
    # 映射到 SM-2 的 0-5 评分
    sm2_quality = {0: 0, 1: 2, 2: 4, 3: 5}[quality]

    if sm2_quality < 3:
        # 回答不好，重置间隔
        new_interval = 1
        new_ease = max(1.3, ease_factor - 0.2)
    else:
        if review_count == 0:
            new_interval = 1
        elif review_count == 1:
            new_interval = 3
        else:
            new_interval = max(1, round(interval_days * ease_factor))

        new_ease = ease_factor + (0.1 - (5 - sm2_quality) * (0.08 + (5 - sm2_quality) * 0.02))
        new_ease = max(1.3, new_ease)

    # 掌握等级
    if quality == 0:
        mastery = 0
    elif quality == 1:
        mastery = 1
    elif quality == 2:
        mastery = 2
    else:
        mastery = 3

    next_review = datetime.utcnow() + timedelta(days=new_interval)

    return mastery, new_interval, new_ease, next_review


# ==================== 翻译 API ====================

@router.post("/translate")
async def translate_text(data: TranslateRequest, db: AsyncSession = Depends(get_db)):
    """调用 LLM 翻译/查词，返回结构化结果"""
    model_name, api_key, api_base = await _get_llm_config(db)

    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 API Key，请前往设置页面配置")

    messages = [
        {"role": "system", "content": TRANSLATE_SYSTEM_PROMPT},
        {"role": "user", "content": data.text.strip()},
    ]

    try:
        raw_response = await complete_chat(
            model=model_name,
            api_key=api_key,
            api_base=api_base,
            messages=messages,
        )

        # 清理可能的 markdown 包裹
        cleaned = raw_response.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            # 去掉第一行和最后一行的 ```
            lines = [l for l in lines if not l.strip().startswith("```")]
            cleaned = "\n".join(lines).strip()

        result = json.loads(cleaned)
        return result

    except json.JSONDecodeError:
        # LLM 返回了非 JSON，做 fallback
        return {
            "type": "sentence",
            "word": data.text.strip(),
            "meaning": raw_response.strip()[:200],
            "note": None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"翻译失败: {e}")


# ==================== 单词 CRUD ====================

@router.get("/words", response_model=list[WordOut])
async def list_words(
    category: str | None = None,
    search: str | None = None,
    mastery_level: int | None = None,
    due_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    query = select(VocabularyWord)

    if category:
        query = query.where(VocabularyWord.category == category)
    if search:
        query = query.where(
            or_(
                VocabularyWord.word.contains(search),
                VocabularyWord.meaning.contains(search),
            )
        )
    if mastery_level is not None:
        query = query.where(VocabularyWord.mastery_level == mastery_level)
    if due_only:
        now = datetime.utcnow()
        query = query.where(
            or_(
                VocabularyWord.next_review_at.is_(None),
                VocabularyWord.next_review_at <= now,
            )
        )

    query = query.order_by(desc(VocabularyWord.created_at))
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/words", response_model=WordOut, status_code=201)
async def create_word(data: WordCreate, db: AsyncSession = Depends(get_db)):
    # 检查是否已存在相同单词
    existing = await db.execute(
        select(VocabularyWord).where(
            func.lower(VocabularyWord.word) == data.word.lower().strip()
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="该单词已存在于单词本中")

    word = VocabularyWord(
        id=str(uuid.uuid4()),
        word=data.word.strip(),
        phonetic=data.phonetic,
        pos=data.pos,
        meaning=data.meaning,
        example=data.example,
        example_cn=data.example_cn,
        synonyms=json.dumps(data.synonyms, ensure_ascii=False) if data.synonyms else None,
        note=data.note,
        category=data.category,
        tags=json.dumps(data.tags, ensure_ascii=False) if data.tags else None,
        source_conversation_id=data.source_conversation_id,
        source_message_id=data.source_message_id,
        next_review_at=datetime.utcnow(),  # 新词立刻可以复习
    )
    db.add(word)
    await db.commit()
    await db.refresh(word)
    return word


# ==================== 单词复习（放在 {word_id} 路由之前，避免路由冲突） ====================

@router.get("/words/review/due", response_model=list[WordOut])
async def get_due_words(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """获取今天需要复习的单词"""
    now = datetime.utcnow()
    query = (
        select(VocabularyWord)
        .where(
            or_(
                VocabularyWord.next_review_at.is_(None),
                VocabularyWord.next_review_at <= now,
            )
        )
        .order_by(VocabularyWord.next_review_at.asc().nullsfirst())
        .limit(limit)
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/words/{word_id}", response_model=WordOut)
async def get_word(word_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VocabularyWord).where(VocabularyWord.id == word_id))
    word = result.scalar_one_or_none()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")
    return word


@router.put("/words/{word_id}", response_model=WordOut)
async def update_word(word_id: str, data: WordUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VocabularyWord).where(VocabularyWord.id == word_id))
    word = result.scalar_one_or_none()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")

    if data.word is not None:
        word.word = data.word.strip()
    if data.phonetic is not None:
        word.phonetic = data.phonetic
    if data.pos is not None:
        word.pos = data.pos
    if data.meaning is not None:
        word.meaning = data.meaning
    if data.example is not None:
        word.example = data.example
    if data.example_cn is not None:
        word.example_cn = data.example_cn
    if data.synonyms is not None:
        word.synonyms = json.dumps(data.synonyms, ensure_ascii=False)
    if data.note is not None:
        word.note = data.note
    if data.category is not None:
        word.category = data.category
    if data.tags is not None:
        word.tags = json.dumps(data.tags, ensure_ascii=False)

    word.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(word)
    return word


@router.delete("/words/{word_id}")
async def delete_word(word_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(VocabularyWord).where(VocabularyWord.id == word_id))
    word = result.scalar_one_or_none()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")

    await db.delete(word)
    await db.commit()
    return {"detail": "Word deleted"}


@router.post("/words/{word_id}/review", response_model=WordOut)
async def review_word(word_id: str, data: ReviewAction, db: AsyncSession = Depends(get_db)):
    """提交单词复习结果，更新记忆曲线"""
    result = await db.execute(select(VocabularyWord).where(VocabularyWord.id == word_id))
    word = result.scalar_one_or_none()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")

    if data.quality < 0 or data.quality > 3:
        raise HTTPException(status_code=400, detail="quality must be 0-3")

    mastery, new_interval, new_ease, next_review = _calculate_next_review(
        quality=data.quality,
        review_count=word.review_count,
        ease_factor=word.ease_factor,
        interval_days=word.interval_days,
    )

    word.mastery_level = mastery
    word.review_count += 1
    if data.quality >= 2:
        word.correct_count += 1
    word.ease_factor = new_ease
    word.interval_days = new_interval
    word.next_review_at = next_review
    word.last_reviewed_at = datetime.utcnow()
    word.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(word)
    return word


# ==================== 佳句 CRUD ====================

@router.get("/sentences", response_model=list[SentenceOut])
async def list_sentences(
    category: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    query = select(FavoriteSentence)

    if category:
        query = query.where(FavoriteSentence.category == category)
    if search:
        query = query.where(
            or_(
                FavoriteSentence.content.contains(search),
                FavoriteSentence.translation.contains(search),
            )
        )

    query = query.order_by(desc(FavoriteSentence.created_at))
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/sentences", response_model=SentenceOut, status_code=201)
async def create_sentence(data: SentenceCreate, db: AsyncSession = Depends(get_db)):
    sentence = FavoriteSentence(
        id=str(uuid.uuid4()),
        content=data.content.strip(),
        translation=data.translation,
        note=data.note,
        category=data.category,
        tags=json.dumps(data.tags, ensure_ascii=False) if data.tags else None,
        source_conversation_id=data.source_conversation_id,
        source_message_id=data.source_message_id,
        next_review_at=datetime.utcnow(),
    )
    db.add(sentence)
    await db.commit()
    await db.refresh(sentence)
    return sentence


@router.put("/sentences/{sentence_id}", response_model=SentenceOut)
async def update_sentence(sentence_id: str, data: SentenceUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FavoriteSentence).where(FavoriteSentence.id == sentence_id))
    sentence = result.scalar_one_or_none()
    if not sentence:
        raise HTTPException(status_code=404, detail="Sentence not found")

    if data.content is not None:
        sentence.content = data.content.strip()
    if data.translation is not None:
        sentence.translation = data.translation
    if data.note is not None:
        sentence.note = data.note
    if data.category is not None:
        sentence.category = data.category
    if data.tags is not None:
        sentence.tags = json.dumps(data.tags, ensure_ascii=False)

    sentence.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(sentence)
    return sentence


@router.delete("/sentences/{sentence_id}")
async def delete_sentence(sentence_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FavoriteSentence).where(FavoriteSentence.id == sentence_id))
    sentence = result.scalar_one_or_none()
    if not sentence:
        raise HTTPException(status_code=404, detail="Sentence not found")

    await db.delete(sentence)
    await db.commit()
    return {"detail": "Sentence deleted"}


# ==================== 统计 ====================

@router.get("/stats", response_model=VocabularyStats)
async def get_stats(db: AsyncSession = Depends(get_db)):
    """获取单词本统计信息"""
    now = datetime.utcnow()

    # 单词统计
    total_words_result = await db.execute(select(func.count(VocabularyWord.id)))
    total_words = total_words_result.scalar() or 0

    mastered_result = await db.execute(
        select(func.count(VocabularyWord.id)).where(VocabularyWord.mastery_level >= 3)
    )
    mastered = mastered_result.scalar() or 0

    learning_result = await db.execute(
        select(func.count(VocabularyWord.id)).where(
            VocabularyWord.mastery_level.in_([1, 2])
        )
    )
    learning = learning_result.scalar() or 0

    new_result = await db.execute(
        select(func.count(VocabularyWord.id)).where(VocabularyWord.mastery_level == 0)
    )
    new_words = new_result.scalar() or 0

    # 佳句统计
    total_sentences_result = await db.execute(select(func.count(FavoriteSentence.id)))
    total_sentences = total_sentences_result.scalar() or 0

    # 待复习统计
    due_result = await db.execute(
        select(func.count(VocabularyWord.id)).where(
            or_(
                VocabularyWord.next_review_at.is_(None),
                VocabularyWord.next_review_at <= now,
            )
        )
    )
    due_count = due_result.scalar() or 0

    # 各类别单词数
    category_counts = {}
    for cat in ["writing", "speaking", "reading", "listening", "general"]:
        cat_result = await db.execute(
            select(func.count(VocabularyWord.id)).where(VocabularyWord.category == cat)
        )
        category_counts[cat] = cat_result.scalar() or 0

    return VocabularyStats(
        total_words=total_words,
        total_sentences=total_sentences,
        mastered_words=mastered,
        learning_words=learning,
        new_words=new_words,
        due_review_count=due_count,
        category_counts=category_counts,
    )
