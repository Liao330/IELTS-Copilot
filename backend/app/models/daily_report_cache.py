"""Cache model for daily reports — avoids regenerating on every homepage visit."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Date, Boolean
from app.database import Base


class DailyReportCache(Base):
    __tablename__ = "daily_report_cache"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    report_date = Column(Date, nullable=False, index=True)
    include_notes = Column(Boolean, nullable=False, default=False)
    report_json = Column(Text, nullable=False)  # full JSON response stored as text
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
