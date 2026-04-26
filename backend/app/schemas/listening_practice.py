from __future__ import annotations

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


# ========== 障碍词 / 生成句结构 ==========

class BlockerWord(BaseModel):
    """一个障碍词标记"""
    word: str
    start: int  # 在 original_text 中的字符起始位置
    end: int  # 结束位置（不含）
    vocab_word_id: str | None = None  # 关联的单词本条目 id


class GeneratedExample(BaseModel):
    text: str
    translation: str
    difficulty_level: Literal[1, 2, 3]
    hint: str  # 中文，指出难点出现的位置


DifficultyType = Literal["连读", "弱读", "不熟词", "吞音", "相近发音", "其他"]


class GeneratedBlockOut(BaseModel):
    id: str
    sentence_id: str
    blocker_word: str
    difficulty_type: str
    explanation: str
    examples: list[GeneratedExample]
    created_at: datetime


# ========== Session ==========

class SessionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    note: str | None = None
    # 可选：一次性创建会话并带入答案句
    sentences: list[str] | None = None


class SessionUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    note: str | None = None


class SessionSummaryOut(BaseModel):
    """列表页用 — 含聚合统计"""
    id: str
    title: str
    note: str | None = None
    sentence_count: int
    blocker_count: int
    created_at: datetime
    updated_at: datetime


class SentenceOut(BaseModel):
    id: str
    session_id: str
    original_text: str
    order_index: int
    blocker_words: list[BlockerWord] = []
    generated_blocks: list[GeneratedBlockOut] = []
    created_at: datetime
    updated_at: datetime


class SessionDetailOut(BaseModel):
    id: str
    title: str
    note: str | None = None
    created_at: datetime
    updated_at: datetime
    sentences: list[SentenceOut]


# ========== 句子操作 ==========

class SentenceBatchAdd(BaseModel):
    """向某会话批量追加答案句"""
    sentences: list[str] = Field(..., min_length=1)


class BlockerWordsUpdate(BaseModel):
    """更新某句的障碍词数组（全量替换）"""
    blocker_words: list[BlockerWord]


# ========== 生成接口 ==========

class GenerateForSentenceRequest(BaseModel):
    """为某句生成/刷新练习句（传入障碍词列表，默认取句内已保存的）"""
    words: list[str] | None = None  # 若不传，使用 sentence.blocker_words 中的词
    force_refresh: bool = False  # 为 True 时忽略缓存重新生成


class GenerateResultItem(BaseModel):
    blocker_word: str
    difficulty_type: str
    explanation: str
    examples: list[GeneratedExample]


class GenerateForSentenceResponse(BaseModel):
    sentence_id: str
    blocks: list[GeneratedBlockOut]
