from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SpeakingCorrection(Base):
    """口语纠错条目 — 累积复习，连续3天脱口而出自动过关"""
    __tablename__ = "speaking_corrections"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    correct_text: Mapped[str] = mapped_column(Text, nullable=False)  # 正确版本
    error_type: Mapped[str] = mapped_column(String, nullable=False)  # grammar/vocabulary/pronunciation/expression

    # 累积复习状态
    status: Mapped[str] = mapped_column(String, default="active")  # active / passed
    streak_days: Mapped[int] = mapped_column(Integer, default=0)  # 连续脱口而出天数
    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_result: Mapped[Optional[str]] = mapped_column(String)  # fluent / hesitant

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    passed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)  # 过关时间
