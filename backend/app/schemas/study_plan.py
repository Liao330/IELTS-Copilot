"""Pydantic schemas for study plan API."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class StudyPlanDayTask(BaseModel):
    """One subject's task info for a plan day."""
    subject: str  # listening/speaking/reading/writing
    task: str | None = None
    homework_id: str | None = None
    completed: bool = False


class StudyPlanDayOut(BaseModel):
    id: str
    plan_id: str
    day_number: int
    listening: str | None = None
    speaking: str | None = None
    reading: str | None = None
    writing: str | None = None
    listening_image_id: str | None = None
    speaking_image_id: str | None = None
    reading_image_id: str | None = None
    writing_image_id: str | None = None
    listening_homework_id: str | None = None
    speaking_homework_id: str | None = None
    reading_homework_id: str | None = None
    writing_homework_id: str | None = None

    model_config = {"from_attributes": True}

    @property
    def tasks(self) -> list[StudyPlanDayTask]:
        result = []
        for subj in ("listening", "speaking", "reading", "writing"):
            task_text = getattr(self, subj)
            hw_id = getattr(self, f"{subj}_homework_id")
            if task_text:
                result.append(StudyPlanDayTask(
                    subject=subj, task=task_text, homework_id=hw_id, completed=hw_id is not None,
                ))
        return result


class StudyPlanOut(BaseModel):
    id: str
    title: str
    file_id: str | None = None
    total_days: int
    current_day: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    days: list[StudyPlanDayOut] = []

    model_config = {"from_attributes": True}


class StudyPlanCurrentDayOut(BaseModel):
    """Lightweight response for homepage: just today's tasks."""
    plan_id: str
    plan_title: str
    current_day: int
    total_days: int
    day: StudyPlanDayOut | None = None


class LinkHomeworkRequest(BaseModel):
    """Link a homework to a plan day's subject task."""
    homework_id: str
    subject: str  # listening/speaking/reading/writing
