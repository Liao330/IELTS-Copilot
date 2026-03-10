from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel


# ========== 单词 ==========

class WordCreate(BaseModel):
    word: str
    phonetic: str | None = None
    pos: str | None = None
    meaning: str
    example: str | None = None
    example_cn: str | None = None
    synonyms: list[str] | None = None
    note: str | None = None
    category: str = "general"
    tags: list[str] | None = None
    source_conversation_id: str | None = None
    source_message_id: str | None = None


class WordUpdate(BaseModel):
    word: str | None = None
    phonetic: str | None = None
    pos: str | None = None
    meaning: str | None = None
    example: str | None = None
    example_cn: str | None = None
    synonyms: list[str] | None = None
    note: str | None = None
    category: str | None = None
    tags: list[str] | None = None


class WordOut(BaseModel):
    id: str
    word: str
    phonetic: str | None = None
    pos: str | None = None
    meaning: str
    example: str | None = None
    example_cn: str | None = None
    synonyms: str | None = None  # JSON string
    note: str | None = None
    category: str
    tags: str | None = None  # JSON string
    source_conversation_id: str | None = None
    source_message_id: str | None = None
    mastery_level: int
    review_count: int
    correct_count: int
    ease_factor: float
    interval_days: int
    next_review_at: datetime | None = None
    last_reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReviewAction(BaseModel):
    """复习动作: 用户对单词的掌握程度反馈"""
    quality: int  # 0=不认识, 1=模糊, 2=认识, 3=熟练


# ========== 佳句 ==========

class SentenceCreate(BaseModel):
    content: str
    translation: str | None = None
    note: str | None = None
    category: str = "general"
    tags: list[str] | None = None
    source_conversation_id: str | None = None
    source_message_id: str | None = None


class SentenceUpdate(BaseModel):
    content: str | None = None
    translation: str | None = None
    note: str | None = None
    category: str | None = None
    tags: list[str] | None = None


class SentenceOut(BaseModel):
    id: str
    content: str
    translation: str | None = None
    note: str | None = None
    category: str
    tags: str | None = None
    source_conversation_id: str | None = None
    source_message_id: str | None = None
    mastery_level: int
    review_count: int
    next_review_at: datetime | None = None
    last_reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ========== 翻译 ==========

class TranslateRequest(BaseModel):
    text: str  # 要翻译/查询的文本


class TranslateWordResult(BaseModel):
    word: str
    phonetic: str | None = None
    pos: str | None = None
    meaning: str
    example: str | None = None
    example_cn: str | None = None
    synonyms: list[str] | None = None


class TranslateSentenceResult(BaseModel):
    word: str  # 原文
    meaning: str
    note: str | None = None


# ========== 统计 ==========

class VocabularyStats(BaseModel):
    total_words: int
    total_sentences: int
    mastered_words: int  # mastery_level >= 3
    learning_words: int  # mastery_level 1-2
    new_words: int  # mastery_level == 0
    due_review_count: int  # 今日待复习
