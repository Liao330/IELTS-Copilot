from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ListeningPracticeSession(Base):
    """精听练习会话 — 对应一次套题复盘"""
    __tablename__ = "listening_practice_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text)
    cleanup_summary: Mapped[Optional[str]] = mapped_column(Text)  # AI 复盘总结
    study_duration_seconds: Mapped[int] = mapped_column(Integer, default=0)  # 累计学习时长（秒）

    homework_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("homeworks.id", ondelete="SET NULL"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sentences = relationship(
        "ListeningPracticeSentence",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ListeningPracticeSentence.order_index",
    )
    discovered_words = relationship(
        "ListeningDiscoveredWord",
        back_populates="session",
        cascade="all, delete-orphan",
    )


class ListeningPracticeSentence(Base):
    """答案句 — 一个会话下多句"""
    __tablename__ = "listening_practice_sentences"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(
        String, ForeignKey("listening_practice_sessions.id", ondelete="CASCADE"), nullable=False
    )
    original_text: Mapped[str] = mapped_column(Text, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # 用户笔记原文中对这条答案句的额外说明（例如：听成了 camb、拼写错误等）。
    # 会作为上下文输入到"梯度例句生成"prompt，帮助 AI 更有针对性地出题。
    note: Mapped[Optional[str]] = mapped_column(Text)

    # JSON: [{"word":"...", "start":N, "end":N, "vocab_word_id":"..."|null}]
    blocker_words: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    session = relationship("ListeningPracticeSession", back_populates="sentences")
    generated_blocks = relationship(
        "ListeningPracticeGenerated",
        back_populates="sentence",
        cascade="all, delete-orphan",
    )


class ListeningPracticeGenerated(Base):
    """AI 生成的梯度练习句（缓存）— 一句下多个障碍词各一条"""
    __tablename__ = "listening_practice_generated"
    __table_args__ = (
        UniqueConstraint("sentence_id", "blocker_word", name="uq_generated_sentence_word"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    sentence_id: Mapped[str] = mapped_column(
        String, ForeignKey("listening_practice_sentences.id", ondelete="CASCADE"), nullable=False
    )

    blocker_word: Mapped[str] = mapped_column(String, nullable=False)  # 归一化小写
    difficulty_type: Mapped[str] = mapped_column(String, nullable=False)  # 连读/弱读/不熟词/吞音/相近发音/其他
    explanation: Mapped[str] = mapped_column(Text, nullable=False)  # 中文发音难点说明

    # JSON: [{"text":"...", "translation":"...", "difficulty_level":1|2|3, "hint":"..."}]
    examples: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sentence = relationship("ListeningPracticeSentence", back_populates="generated_blocks")
    dictation_attempts = relationship(
        "ListeningDictationAttempt",
        back_populates="generated_block",
        cascade="all, delete-orphan",
    )


class ListeningDictationAttempt(Base):
    """听写尝试记录 — 每次用户提交听写对比时保存一条"""
    __tablename__ = "listening_dictation_attempts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    generated_block_id: Mapped[str] = mapped_column(
        String, ForeignKey("listening_practice_generated.id", ondelete="CASCADE"), nullable=False
    )
    example_index: Mapped[int] = mapped_column(Integer, nullable=False)  # 该 block 中第几个例句 (0-based)
    play_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False)
    total_count: Mapped[int] = mapped_column(Integer, nullable=False)
    accuracy_pct: Mapped[int] = mapped_column(Integer, nullable=False)
    # JSON: ["word1", "word2"]
    missed_words: Mapped[Optional[str]] = mapped_column(Text)
    # JSON: ["answer1", "answer2", ...] — 用户填写的每个词位答案（用于回显）
    user_answers: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    generated_block = relationship("ListeningPracticeGenerated", back_populates="dictation_attempts")


class ListeningDiscoveredWord(Base):
    """精听练习中发现的延伸障碍词"""
    __tablename__ = "listening_discovered_words"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(
        String, ForeignKey("listening_practice_sessions.id", ondelete="CASCADE"), nullable=False
    )
    word: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text)  # AI生成的备注说明
    source: Mapped[str] = mapped_column(String, nullable=False, default="click")  # "click" | "missed" | "ai_analyzed"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session = relationship("ListeningPracticeSession", back_populates="discovered_words")
