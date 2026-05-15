from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SpeakingMaterial(Base):
    """口语高分素材 — 整篇背诵，连续5天脱口而出过关"""
    __tablename__ = "speaking_materials"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String, nullable=False)  # 作业标题
    topic: Mapped[str] = mapped_column(String, nullable=False)  # 话题分类: advice/technology/nature/job/hobby...
    part: Mapped[str] = mapped_column(String, nullable=False)  # P1 / P2 / P3
    content: Mapped[str] = mapped_column(Text, nullable=False)  # 纠错后的背诵版本
    keywords_cn: Mapped[str] = mapped_column(Text, nullable=False)  # 中文关键词 JSON数组，复习时作为回忆提示
    score: Mapped[float] = mapped_column(Float, nullable=False)  # 原始总分
    homework_id: Mapped[Optional[str]] = mapped_column(String)  # 关联原作业ID

    # 复习状态
    status: Mapped[str] = mapped_column(String, default="active")  # active / passed
    streak_days: Mapped[int] = mapped_column(Integer, default=0)  # 连续fluent天数，5天过关
    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_result: Mapped[Optional[str]] = mapped_column(String)  # fluent / hesitant

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    passed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)  # 学习顺序
