from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WritingMaterial(Base):
    """雅思大作文素材 — 理由链+例子，5级mastery"""
    __tablename__ = "writing_materials"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    topic: Mapped[str] = mapped_column(String, nullable=False)          # education/technology/...
    topic_cn: Mapped[str] = mapped_column(String, nullable=False)       # 教育/科技/...
    direction: Mapped[str] = mapped_column(Text, nullable=False)        # 方向标题
    direction_index: Mapped[int] = mapped_column(Integer, nullable=False)  # 1/2/3
    stance: Mapped[str] = mapped_column(String, nullable=False)         # pro/con
    stance_label: Mapped[str] = mapped_column(String, nullable=False)   # 正方/反方
    angle: Mapped[str] = mapped_column(String, nullable=False)          # 角度名
    angle_index: Mapped[int] = mapped_column(Integer, nullable=False)   # 1/2

    topic_sentence: Mapped[Optional[str]] = mapped_column(Text)         # 观点句（中）— TEE结构中的T
    topic_sentence_en: Mapped[Optional[str]] = mapped_column(Text)     # 观点句（英）
    reasoning_chain: Mapped[str] = mapped_column(Text, nullable=False)  # 理由链（→分隔）— TEE结构中的E(xplanation)
    reasoning_chain_en: Mapped[Optional[str]] = mapped_column(Text)     # 理由链降级英文
    example: Mapped[str] = mapped_column(Text, nullable=False)          # 例子 — TEE结构中的E(xample)
    example_en: Mapped[Optional[str]] = mapped_column(Text)             # 例子关键词英文

    memory_anchor: Mapped[Optional[str]] = mapped_column(Text)   # 记忆锚点（按direction共享）

    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # SM-2 (5级 mastery)
    mastery_level: Mapped[int] = mapped_column(Integer, default=0)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=1)
    next_review_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    first_learned_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class WritingMaterialKeyword(Base):
    """大作文素材关键词中英对照"""
    __tablename__ = "writing_material_keywords"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    topic: Mapped[str] = mapped_column(String, nullable=False)
    direction_index: Mapped[int] = mapped_column(Integer, nullable=False)
    cn: Mapped[str] = mapped_column(String, nullable=False)
    en: Mapped[str] = mapped_column(Text, nullable=False)
    level: Mapped[str] = mapped_column(String, default="basic")  # basic / advanced
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # SM-2 (3级)
    mastery_level: Mapped[int] = mapped_column(Integer, default=0)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    interval_days: Mapped[int] = mapped_column(Integer, default=1)
    next_review_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    first_learned_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DowngradeAttempt(Base):
    """降级练习记录"""
    __tablename__ = "downgrade_attempts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    chinese: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    correct: Mapped[int] = mapped_column(Integer, default=0)
    reference_answer: Mapped[Optional[str]] = mapped_column(Text)
    feedback: Mapped[Optional[str]] = mapped_column(Text)
    source_material_id: Mapped[Optional[str]] = mapped_column(String)
    needs_retry: Mapped[int] = mapped_column(Integer, default=0)
    retried: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
