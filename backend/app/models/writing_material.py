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

    reasoning_chain: Mapped[str] = mapped_column(Text, nullable=False)  # 理由链（→分隔）
    example: Mapped[str] = mapped_column(Text, nullable=False)          # 例子

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
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # SM-2 (3级)
    mastery_level: Mapped[int] = mapped_column(Integer, default=0)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    interval_days: Mapped[int] = mapped_column(Integer, default=1)
    next_review_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    first_learned_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
