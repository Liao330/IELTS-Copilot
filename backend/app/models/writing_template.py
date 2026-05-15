from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WritingTemplate(Base):
    """雅思写作句型/模板 — 用于背诵和检验"""
    __tablename__ = "writing_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    category: Mapped[str] = mapped_column(String, nullable=False)  # map/process/data/essay
    sub_category: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "overview", "trend_rise"
    scene_cn: Mapped[str] = mapped_column(Text, nullable=False)  # 中文场景/触发条件
    scene_detail: Mapped[Optional[str]] = mapped_column(Text)  # 具体场景描述（闪卡用）
    template_en: Mapped[str] = mapped_column(Text, nullable=False)  # 英文句型模板
    template_cn: Mapped[Optional[str]] = mapped_column(Text)  # 中文翻译
    example_en: Mapped[Optional[str]] = mapped_column(Text)  # 完整示例句
    note: Mapped[Optional[str]] = mapped_column(Text)  # 备注
    difficulty: Mapped[int] = mapped_column(Integer, default=1)  # 1=简单 2=中等 3=较难
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # 间隔重复 (SM-2)
    mastery_level: Mapped[int] = mapped_column(Integer, default=0)  # 0=新 1=模糊 2=认识 3=熟练
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=1)
    next_review_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    first_learned_at: Mapped[Optional[datetime]] = mapped_column(DateTime)  # 首次标记"已看"的时间

    # 填空默写相关
    blank_slots: Mapped[Optional[str]] = mapped_column(Text)    # JSON: AI拆分的可考核片段
    slots_passed: Mapped[Optional[str]] = mapped_column(Text)   # JSON: 已通过的 slot index 列表

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TemplateVocab(Base):
    """句型关键词汇 — 单独闪卡复习（streak-based，3天连续passed）"""
    __tablename__ = "template_vocab"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    word_en: Mapped[str] = mapped_column(String, nullable=False)       # 英文单词/短语
    meaning_cn: Mapped[str] = mapped_column(String, nullable=False)    # 中文释义
    example_sentence: Mapped[Optional[str]] = mapped_column(Text)      # 例句
    category: Mapped[str] = mapped_column(String, default="data")      # data/map/process/essay
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # Streak-based mastery (同 SpeakingPhrase)
    status: Mapped[str] = mapped_column(String, default="active")      # active / passed
    streak_days: Mapped[int] = mapped_column(Integer, default=0)
    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_result: Mapped[Optional[str]] = mapped_column(String)         # fluent / hesitant
    passed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
