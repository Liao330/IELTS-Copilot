from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import String, Text, DateTime, Boolean, Date, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ScheduleTask(Base):
    """学习日程/计划任务"""
    __tablename__ = "schedule_tasks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # writing/speaking/reading/listening/other
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # HH:MM format
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
