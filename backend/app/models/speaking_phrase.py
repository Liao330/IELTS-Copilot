from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SpeakingPhrase(Base):
    """口语降级表达 — 中文→简单英文，闪卡复习"""
    __tablename__ = "speaking_phrases"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    category: Mapped[str] = mapped_column(String, nullable=False)  # feelings/reasons/people/places/changes/opinions/frequency/habits/difficulties/filler
    cn: Mapped[str] = mapped_column(String, nullable=False)
    en: Mapped[str] = mapped_column(Text, nullable=False)

    # SM-2 style review (same as SpeakingCorrection: streak-based)
    status: Mapped[str] = mapped_column(String, default="active")  # active / passed
    streak_days: Mapped[int] = mapped_column(Integer, default=0)
    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_result: Mapped[Optional[str]] = mapped_column(String)  # fluent / hesitant

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    passed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
