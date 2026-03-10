from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class VocabularyWord(Base):
    """单词本 - 单词条目"""
    __tablename__ = "vocabulary_words"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    word: Mapped[str] = mapped_column(String, nullable=False, index=True)  # 单词或短语
    phonetic: Mapped[Optional[str]] = mapped_column(String)  # 音标
    pos: Mapped[Optional[str]] = mapped_column(String)  # 词性 (noun, verb, adj, etc.)
    meaning: Mapped[str] = mapped_column(Text, nullable=False)  # 中文释义
    example: Mapped[Optional[str]] = mapped_column(Text)  # 英文例句
    example_cn: Mapped[Optional[str]] = mapped_column(Text)  # 例句中文翻译
    synonyms: Mapped[Optional[str]] = mapped_column(Text)  # 同义词 JSON: ["word1", "word2"]
    note: Mapped[Optional[str]] = mapped_column(Text)  # 用户自定义备注
    category: Mapped[str] = mapped_column(String, nullable=False, default="general")  # writing/speaking/reading/listening/general
    tags: Mapped[Optional[str]] = mapped_column(Text)  # JSON: ["tag1", "tag2"]

    # 来源追溯
    source_conversation_id: Mapped[Optional[str]] = mapped_column(String)
    source_message_id: Mapped[Optional[str]] = mapped_column(String)

    # 记忆/复习相关
    mastery_level: Mapped[int] = mapped_column(Integer, default=0)  # 掌握等级: 0=新词, 1=模糊, 2=认识, 3=熟练
    review_count: Mapped[int] = mapped_column(Integer, default=0)  # 复习次数
    correct_count: Mapped[int] = mapped_column(Integer, default=0)  # 正确次数
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)  # 艾宾浩斯难度系数
    interval_days: Mapped[int] = mapped_column(Integer, default=0)  # 当前间隔天数
    next_review_at: Mapped[Optional[datetime]] = mapped_column(DateTime)  # 下次复习时间
    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)  # 上次复习时间

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class FavoriteSentence(Base):
    """单词本 - 好词佳句"""
    __tablename__ = "favorite_sentences"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    content: Mapped[str] = mapped_column(Text, nullable=False)  # 英文原句
    translation: Mapped[Optional[str]] = mapped_column(Text)  # 中文翻译
    note: Mapped[Optional[str]] = mapped_column(Text)  # 用户备注（用法说明等）
    category: Mapped[str] = mapped_column(String, nullable=False, default="general")  # writing/speaking/reading/listening/general
    tags: Mapped[Optional[str]] = mapped_column(Text)  # JSON: ["tag1", "tag2"]

    # 来源追溯
    source_conversation_id: Mapped[Optional[str]] = mapped_column(String)
    source_message_id: Mapped[Optional[str]] = mapped_column(String)

    # 记忆相关
    mastery_level: Mapped[int] = mapped_column(Integer, default=0)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    next_review_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
