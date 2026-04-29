from __future__ import annotations

from datetime import date, datetime
from typing import Optional, Any
from pydantic import BaseModel


class FileInfo(BaseModel):
    id: str
    name: str
    mime_type: str


class HomeworkFeedbackOut(BaseModel):
    id: str
    homework_id: str
    feedback_type: str
    content: Optional[str] = None
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    file_mime_type: Optional[str] = None
    scores: Optional[dict[str, Any]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class HomeworkOut(BaseModel):
    id: str
    title: str
    category: str
    homework_date: date
    description: Optional[str] = None
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    file_mime_type: Optional[str] = None
    files: list[FileInfo] = []
    feedbacks: list[HomeworkFeedbackOut] = []
    summary: Optional[str] = None
    summary_updated_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class HomeworkCreate(BaseModel):
    title: str
    category: str
    homework_date: date
    description: Optional[str] = None
    file_id: Optional[str] = None
    file_ids: Optional[list[str]] = None


class HomeworkUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    homework_date: Optional[date] = None
    description: Optional[str] = None
    file_id: Optional[str] = None
    file_ids: Optional[list[str]] = None


class FeedbackCreate(BaseModel):
    feedback_type: str
    content: Optional[str] = None
    file_id: Optional[str] = None


class FeedbackUpdate(BaseModel):
    content: Optional[str] = None
    file_id: Optional[str] = None


class HomeworkDateGroup(BaseModel):
    date: date
    categories: dict[str, int]  # e.g. {"writing": 2, "speaking": 1}
    total: int


# ========== 作业搜索 ==========

class HomeworkSearchRequest(BaseModel):
    query: str
    category: Optional[str] = None  # 可选按类别过滤


class HomeworkSearchResult(BaseModel):
    homework_id: str
    title: str
    category: str
    homework_date: date
    relevance_reason: str  # AI 给出的匹配理由


class HomeworkSearchResponse(BaseModel):
    results: list[HomeworkSearchResult]
    total_searched: int  # 搜索范围内的作业总数
