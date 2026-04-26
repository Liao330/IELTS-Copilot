"""Listening Practice 示例会话管理。

目标：为「听力精听复盘」列表页提供一个**固定存在**的示例会话，让新用户
不用动手就能看到 AI 真实生成的梯度练习结果长什么样。

设计要点：
- 固定 session id = ``DEMO_SESSION_ID``（非 UUID 格式，便于区分）
- 启动时幂等地创建/补齐示例句子（不存在才插入；已存在则完全不改，避免覆盖已缓存的生成结果）
- 生成结果**懒加载**：首次访问详情时触发 LLM 生成，成功后持久化，之后所有访问都走缓存
- 防并发：生成触发前用 `asyncio.Lock` 按 session_id 串行
- 只读：通过 `is_demo_session(id)` 判断，在关键写接口拒绝修改（删除/加句子/改障碍词）

一旦某句的障碍词被预填好、再对该句调 `generate_for_sentence()`，已有的 listening_practice_service
会自动跑 LLM 并落库，后续所有用户共享同一份缓存。
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import async_session
from app.models.listening_practice import (
    ListeningPracticeSession,
    ListeningPracticeSentence,
)
from app.services.listening_practice_service import generate_for_sentence

logger = logging.getLogger(__name__)


# ========== 常量 ==========

DEMO_SESSION_ID = "demo-listening-practice"
DEMO_TITLE = "🎁 示例 · AI 精听演示"
DEMO_NOTE = (
    "这是一个内置示例会话，演示 AI 根据你标记的障碍词生成梯度练习的效果。"
    "里面的答案句、标记和生成结果都是真实的，但不可编辑或删除。"
    "请通过右上「新建练习」创建你自己的会话。"
)


# 每项：(原文, [障碍词字面量列表])
# 位置由 _find_word_offsets 自动从原文中按出现顺序定位，避免手数字符出错
DEMO_SENTENCES: list[tuple[str, list[str]]] = [
    (
        "The hotel room was really comfortable and a lot of guests gave positive feedback.",
        ["comfortable", "a lot of"],
    ),
    (
        "What time does the next train to Oxford actually leave from platform nine?",
        ["What time", "actually"],
    ),
    (
        "I'd rather wait until Thursday because the weather forecast looks much better then.",
        ["rather", "Thursday"],
    ),
]


def _find_word_offsets(text: str, words: list[str]) -> list[tuple[str, int, int]]:
    """根据原文按出现顺序定位每个词的字符 start/end，多个相同词支持依次匹配。

    返回 [(word, start, end), ...]
    """
    out: list[tuple[str, int, int]] = []
    cursor = 0
    used: list[tuple[int, int]] = []  # 已占用的区间，避免覆盖
    for w in words:
        # 默认从上次结束位置往后找；找不到则从头找空闲位置
        idx = text.find(w, cursor)
        if idx < 0:
            idx = text.find(w)
        if idx < 0:
            continue
        # 避开已用区间：往后找
        end = idx + len(w)
        while any(not (end <= s or idx >= e) for s, e in used):
            search_from = end
            idx = text.find(w, search_from)
            if idx < 0:
                break
            end = idx + len(w)
        if idx < 0:
            continue
        out.append((w, idx, end))
        used.append((idx, end))
        cursor = end
    return out


# ========== 防并发 ==========

_SESSION_LOCK = asyncio.Lock()


def is_demo_session(session_id: str | None) -> bool:
    return session_id == DEMO_SESSION_ID


# ========== 初始化 ==========

async def ensure_demo_session_exists() -> None:
    """启动时调用：幂等创建示例会话及其预填答案句。

    - 会话/句子不存在 → 创建
    - 已存在 → 完全不动（避免覆盖已生成的 AI 结果缓存或用户查看时的状态）
    """
    async with async_session() as db:  # type: AsyncSession
        existing = await db.get(ListeningPracticeSession, DEMO_SESSION_ID)
        if existing:
            # 已有会话：只确认句子齐全（极端情况下 DB 被手动清过）
            q = await db.execute(
                select(ListeningPracticeSentence).where(
                    ListeningPracticeSentence.session_id == DEMO_SESSION_ID
                )
            )
            existing_sentences = {s.original_text: s for s in q.scalars().all()}
            # 如果已有任意句子，就认为是已初始化 → 不动
            if existing_sentences:
                return

        now = datetime.utcnow()
        if not existing:
            session = ListeningPracticeSession(
                id=DEMO_SESSION_ID,
                title=DEMO_TITLE,
                note=DEMO_NOTE,
                created_at=now,
                updated_at=now,
            )
            db.add(session)
            await db.flush()

        for idx, (text, words) in enumerate(DEMO_SENTENCES):
            offsets = _find_word_offsets(text, words)
            blockers_json = json.dumps(
                [
                    {
                        "word": w,
                        "start": s,
                        "end": e,
                        "vocab_word_id": None,
                    }
                    for (w, s, e) in offsets
                ],
                ensure_ascii=False,
            )
            db.add(
                ListeningPracticeSentence(
                    id=str(uuid.uuid4()),
                    session_id=DEMO_SESSION_ID,
                    original_text=text,
                    order_index=idx,
                    blocker_words=blockers_json,
                    created_at=now,
                    updated_at=now,
                )
            )

        await db.commit()
        logger.info("Listening Practice Demo session initialized")


# ========== 懒生成 ==========

async def ensure_demo_generated(db: AsyncSession) -> None:
    """访问示例会话详情时触发，幂等地跑 AI 生成并落库。

    - 没配 LLM Key → 静默跳过（列表/详情依然可看，只是没有生成结果区块）
    - 每句若尚无生成结果 → 按障碍词跑一次；已有缓存则跳过
    - 全局 asyncio.Lock 防并发触发多次 LLM 调用
    """
    # 快速路径：先查所有句子是否都有 generated_blocks
    q = await db.execute(
        select(ListeningPracticeSentence)
        .where(ListeningPracticeSentence.session_id == DEMO_SESSION_ID)
        .options(selectinload(ListeningPracticeSentence.generated_blocks))
    )
    sentences = list(q.scalars().all())
    if not sentences:
        return

    def sentence_needs_gen(s: ListeningPracticeSentence) -> bool:
        try:
            blockers = json.loads(s.blocker_words or "[]")
        except Exception:
            blockers = []
        if not blockers:
            return False
        existing_words = {g.blocker_word for g in (s.generated_blocks or [])}
        needed_words = {b["word"].strip().lower() for b in blockers if b.get("word")}
        return bool(needed_words - existing_words)

    pending = [s for s in sentences if sentence_needs_gen(s)]
    if not pending:
        return

    # 加锁串行，避免冷启动时多个请求同时打 LLM
    async with _SESSION_LOCK:
        # 重新读一次（锁内），避免在等锁期间已经被别的协程补齐
        q2 = await db.execute(
            select(ListeningPracticeSentence)
            .where(ListeningPracticeSentence.session_id == DEMO_SESSION_ID)
            .options(selectinload(ListeningPracticeSentence.generated_blocks))
        )
        sentences = list(q2.scalars().all())

        for sentence in sentences:
            if not sentence_needs_gen(sentence):
                continue
            try:
                blockers = json.loads(sentence.blocker_words or "[]")
                words = [b["word"] for b in blockers if b.get("word")]
                if not words:
                    continue
                await generate_for_sentence(
                    db, sentence=sentence, words=words, force_refresh=False
                )
            except Exception as e:
                # 失败静默记录，不影响用户查看已有句子
                logger.warning(
                    "Demo session 生成失败 sentence_id=%s: %s",
                    sentence.id,
                    e,
                )
                # 回滚本句的生成尝试，继续下一句
                await db.rollback()
                continue

        await db.commit()
