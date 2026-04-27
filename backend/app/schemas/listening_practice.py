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

class SentenceInput(BaseModel):
    """创建会话时的单条答案句输入（带可选 note 和预标障碍词）"""
    text: str = Field(..., min_length=1)
    note: str | None = None
    blocker_words: list[BlockerWord] | None = None


class SessionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    note: str | None = None
    # 两种传法二选一，优先使用 sentences_with_context
    sentences: list[str] | None = None
    sentences_with_context: list[SentenceInput] | None = None


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
    is_demo: bool = False  # 内置示例会话标记（只读、置顶、样式差异化）


class SentenceOut(BaseModel):
    id: str
    session_id: str
    original_text: str
    order_index: int
    note: str | None = None
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
    is_demo: bool = False


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


# ========== AI 笔记整理 ==========

class CleanupRequest(BaseModel):
    raw_text: str = Field(..., min_length=1)


class CleanupSentenceItem(BaseModel):
    text: str
    note: str | None = None
    target_words: list[str] = []
    # Python 端已定位好的位置，前端可直接落库
    prefilled_blockers: list[BlockerWord] = []


class CleanupResponse(BaseModel):
    sentences: list[CleanupSentenceItem]


class SentenceNoteUpdate(BaseModel):
    note: str | None = None


class SentenceTextUpdate(BaseModel):
    original_text: str = Field(..., min_length=1)
