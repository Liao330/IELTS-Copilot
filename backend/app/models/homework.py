from __future__ import annotations

from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey, Date
from sqlalchemy.orm import relationship
from app.database import Base


class Homework(Base):
    __tablename__ = "homeworks"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    category = Column(String, nullable=False)  # writing / speaking / reading / listening
    homework_date = Column(Date, nullable=False)  # 作业日期
    description = Column(Text, nullable=True)  # 备注说明
    file_id = Column(String, ForeignKey("files.id"), nullable=True)  # 兼容旧数据（单文件）
    summary = Column(Text, nullable=True)  # AI 生成的结构化摘要
    summary_updated_at = Column(DateTime, nullable=True)  # 摘要最后更新时间
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    feedbacks = relationship("HomeworkFeedback", back_populates="homework", cascade="all, delete-orphan")
    homework_files = relationship("HomeworkFile", back_populates="homework", cascade="all, delete-orphan", order_by="HomeworkFile.created_at")


class HomeworkFile(Base):
    __tablename__ = "homework_files"

    id = Column(String, primary_key=True)
    homework_id = Column(String, ForeignKey("homeworks.id", ondelete="CASCADE"), nullable=False)
    file_id = Column(String, ForeignKey("files.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    homework = relationship("Homework", back_populates="homework_files")


class HomeworkFeedback(Base):
    __tablename__ = "homework_feedbacks"

    id = Column(String, primary_key=True)
    homework_id = Column(String, ForeignKey("homeworks.id", ondelete="CASCADE"), nullable=False)
    feedback_type = Column(String, nullable=False)  # ai_report / teacher_text / teacher_audio / teacher_image
    content = Column(Text, nullable=True)  # 文字内容
    file_id = Column(String, ForeignKey("files.id"), nullable=True)  # 关联文件（pdf/word/audio/image）
    scores = Column(Text, nullable=True)  # JSON: 从 AI 报告中提取的评分数据
    created_at = Column(DateTime, default=datetime.utcnow)

    homework = relationship("Homework", back_populates="feedbacks")
