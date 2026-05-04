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
    template_en: Mapped[str] = mapped_column(Text, nullable=False)  # 英文句型模板
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

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
