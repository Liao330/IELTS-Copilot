"""听写模块路由。

- 月份基础：GET /months/due, POST /months/{id}/check
- 月份进阶（日期+月份）：GET /dates/random, POST /dates/check（无状态）
- 数字/时间/百分比/分数/测量：GET /numbers/random, POST /numbers/check（无状态）
- 听力单词：GET /listening-words/due, POST /listening-words/{id}/check
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.vocabulary import VocabularyWord
from app.schemas.vocabulary import WordOut
from app.services.dictation_service import (
    DICTATION_SOURCE,
    check_date_answer,
    check_number_answer,
    generate_date_question,
    generate_number_string,
    get_due_listening_words,
    get_due_months,
)


router = APIRouter(prefix="/api/dictation", tags=["dictation"])


# ==================== SM-2 通用 ====================

def _sm2_update(word: VocabularyWord, quality: int) -> None:
    """简化版 SM-2，与 vocabulary.py 保持口径一致。"""
    if quality < 2:
        new_interval = 1
        new_ease = max(1.3, word.ease_factor - 0.2)
    else:
        if word.review_count == 0:
            new_interval = 1
        elif word.review_count == 1:
            new_interval = 3
        else:
            new_interval = int(round(word.interval_days * word.ease_factor))
        new_ease = word.ease_factor + (0.1 - (3 - quality) * (0.08 + (3 - quality) * 0.02))
        new_ease = max(1.3, new_ease)

    word.mastery_level = max(0, min(3, quality))
    word.review_count += 1
    if quality >= 2:
        word.correct_count += 1
    word.ease_factor = new_ease
    word.interval_days = new_interval
    word.next_review_at = datetime.utcnow() + timedelta(days=new_interval)
    word.last_reviewed_at = datetime.utcnow()
    word.updated_at = datetime.utcnow()


# ==================== 月份基础 ====================

@router.get("/months/due", response_model=list[WordOut])
async def list_due_months(
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await get_due_months(db, limit=limit)


class WordCheckRequest(BaseModel):
    answer: str


class WordCheckResponse(BaseModel):
    correct: bool
    expected: str
    mastery_level: int
    next_review_at: Optional[datetime]
    interval_days: int


@router.post("/months/{word_id}/check", response_model=WordCheckResponse)
async def check_month(
    word_id: str,
    data: WordCheckRequest,
    db: AsyncSession = Depends(get_db),
):
    q = await db.execute(
        select(VocabularyWord).where(VocabularyWord.id == word_id)
    )
    word = q.scalar_one_or_none()
    if not word:
        raise HTTPException(status_code=404, detail="月份词条不存在")
    if word.source_conversation_id != DICTATION_SOURCE:
        raise HTTPException(status_code=400, detail="非听写月份词条")

    user_answer = (data.answer or "").strip()
    correct = user_answer == word.word
    _sm2_update(word, 3 if correct else 0)
    await db.commit()

    return WordCheckResponse(
        correct=correct,
        expected=word.word,
        mastery_level=word.mastery_level,
        next_review_at=word.next_review_at,
        interval_days=word.interval_days,
    )


# ==================== 月份进阶（日期+月份） ====================

class DateQuestion(BaseModel):
    kind: str
    text: str
    read_text: str
    hint: str


@router.get("/dates/random", response_model=DateQuestion)
async def random_date_question():
    q = generate_date_question()
    # 剔除 _meta 内部字段
    return DateQuestion(kind=q["kind"], text=q["text"], read_text=q["read_text"], hint=q["hint"])


class DateCheckRequest(BaseModel):
    expected: str
    answer: str


class DateCheckResponse(BaseModel):
    correct: bool
    expected: str


@router.post("/dates/check", response_model=DateCheckResponse)
async def check_date(data: DateCheckRequest):
    correct = check_date_answer(data.expected, data.answer)
    return DateCheckResponse(correct=correct, expected=data.expected)


# ==================== 数字/时间/百分比/分数/测量（运行时随机） ====================

class NumberQuestion(BaseModel):
    kind: str
    text: str
    read_text: str
    hint: str


@router.get("/numbers/random", response_model=NumberQuestion)
async def random_number_question(
    kind: Optional[str] = Query(
        None,
        description="可选 kind: phone/postcode/flight_no/card_no/room_no/price/year/time/percent/fraction/measurement",
    ),
):
    item = generate_number_string(kind)  # type: ignore[arg-type]
    return NumberQuestion(
        kind=item["kind"],
        text=item["text"],
        read_text=item["read_text"],
        hint=item["hint"],
    )


class NumberCheckRequest(BaseModel):
    expected: str
    answer: str
    kind: Optional[str] = None


class NumberCheckResponse(BaseModel):
    correct: bool
    expected: str


@router.post("/numbers/check", response_model=NumberCheckResponse)
async def check_number(data: NumberCheckRequest):
    correct = check_number_answer(data.expected, data.answer, kind=data.kind)
    return NumberCheckResponse(correct=correct, expected=data.expected)


# ==================== 听力单词听写（从用户 category=listening 抽题） ====================

@router.get("/listening-words/due", response_model=list[WordOut])
async def list_due_listening_words(
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await get_due_listening_words(db, limit=limit)


@router.post("/listening-words/{word_id}/check", response_model=WordCheckResponse)
async def check_listening_word(
    word_id: str,
    data: WordCheckRequest,
    db: AsyncSession = Depends(get_db),
):
    q = await db.execute(
        select(VocabularyWord).where(VocabularyWord.id == word_id)
    )
    word = q.scalar_one_or_none()
    if not word:
        raise HTTPException(status_code=404, detail="单词不存在")
    if word.category != "listening":
        raise HTTPException(status_code=400, detail="该单词不在「听力单词」分类")

    user_answer = (data.answer or "").strip()
    # 听力单词：大小写不敏感（精听障碍词可能是全小写保存的）
    correct = user_answer.lower() == word.word.lower()
    _sm2_update(word, 3 if correct else 0)
    await db.commit()

    return WordCheckResponse(
        correct=correct,
        expected=word.word,
        mastery_level=word.mastery_level,
        next_review_at=word.next_review_at,
        interval_days=word.interval_days,
    )
