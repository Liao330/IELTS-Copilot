"""Study plan models: a plan parsed from teacher's PDF, broken into per-day tasks."""

from __future__ import annotations

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.database import Base


class StudyPlan(Base):
    """A study plan (e.g. 40-day IELTS plan) uploaded and parsed from PDF."""
    __tablename__ = "study_plans"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False)             # e.g. "40天雅思打卡（精细版）"
    file_id = Column(String, ForeignKey("files.id"), nullable=True)  # source PDF
    total_days = Column(Integer, nullable=False)        # e.g. 40
    current_day = Column(Integer, nullable=False, default=1)  # user's current progress
    is_active = Column(Boolean, nullable=False, default=True)  # only one plan active at a time
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    days = relationship("StudyPlanDay", back_populates="plan", cascade="all, delete-orphan",
                        order_by="StudyPlanDay.day_number")


class StudyPlanDay(Base):
    """One day's tasks within a study plan, per subject."""
    __tablename__ = "study_plan_days"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    plan_id = Column(String, ForeignKey("study_plans.id", ondelete="CASCADE"), nullable=False)
    day_number = Column(Integer, nullable=False)  # 1-based

    # Task descriptions per subject (plain text, from AI parsing)
    listening = Column(Text, nullable=True)
    speaking = Column(Text, nullable=True)
    reading = Column(Text, nullable=True)
    writing = Column(Text, nullable=True)

    # Associated images (e.g. Writing Task 1 chart images extracted from PDF)
    listening_image_id = Column(String, ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
    speaking_image_id = Column(String, ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
    reading_image_id = Column(String, ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
    writing_image_id = Column(String, ForeignKey("files.id", ondelete="SET NULL"), nullable=True)

    # Completion: linked homework IDs (when user submits homework for this task)
    listening_homework_id = Column(String, ForeignKey("homeworks.id", ondelete="SET NULL"), nullable=True)
    speaking_homework_id = Column(String, ForeignKey("homeworks.id", ondelete="SET NULL"), nullable=True)
    reading_homework_id = Column(String, ForeignKey("homeworks.id", ondelete="SET NULL"), nullable=True)
    writing_homework_id = Column(String, ForeignKey("homeworks.id", ondelete="SET NULL"), nullable=True)

    plan = relationship("StudyPlan", back_populates="days")
