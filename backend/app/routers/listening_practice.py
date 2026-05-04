from __future__ import annotations

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.listening_practice import (
    ListeningPracticeSession,
    ListeningPracticeSentence,
    ListeningPracticeGenerated,
    ListeningDictationAttempt,
    ListeningDiscoveredWord,
)
from app.models.vocabulary import VocabularyWord
from app.schemas.listening_practice import (
    SessionCreate,
    SessionUpdate,
    SessionSummaryOut,
    SessionDetailOut,
    SentenceOut,
    SentenceBatchAdd,
    BlockerWordsUpdate,
    BlockerWord,
    GeneratedBlockOut,
    GeneratedExample,
    GenerateForSentenceRequest,
    GenerateForSentenceResponse,
    GenerationFailureInfo,
    CleanupRequest,
    CleanupResponse,
    SentenceNoteUpdate,
    SentenceTextUpdate,
    DictationAttemptCreate,
    DictationAttemptOut,
    DictationAttemptsResponse,
    DiscoveredWordCreate,
    DiscoveredWordOut,
    DiscoveredWordsResponse,
    AnalyzeMissedWordsRequest,
    AnalyzedBlockerWord,
    AnalyzeMissedWordsResponse,
    PrioritizeRequest,
    PrioritizedWord,
    PrioritizeResponse,
)
from app.services.listening_practice_service import (
    sync_blockers_to_vocabulary,
    generate_for_sentence,
    GenerationResult,
    VOCAB_SOURCE_PREFIX,
    _normalize_word,
)
from app.services.listening_demo_service import (
    DEMO_SESSION_ID,
    ensure_demo_generated,
    is_demo_session,
)
from app.services.listening_cleanup_service import (
    cleanup_listening_note,
    _locate_words_in_text,
)


router = APIRouter(prefix="/api/listening-practice", tags=["listening-practice"])


# ==================== 序列化辅助 ====================

def _parse_blockers(raw: str | None) -> list[BlockerWord]:
    if not raw:
        return []
    try:
        items = json.loads(raw)
        return [BlockerWord(**it) for it in items]
    except Exception:
        return []


def _serialize_generated(g: ListeningPracticeGenerated) -> GeneratedBlockOut:
    try:
        ex_list = json.loads(g.examples)
    except Exception:
        ex_list = []
    examples = [GeneratedExample(**ex) for ex in ex_list]

    # 包含每个 example_index 的最新听写记录
    latest_attempts_map = None
    # 只在关系已被 eager load 时才访问（避免 async lazy load 报错）
    from sqlalchemy.orm import object_session
    from sqlalchemy import inspect as sa_inspect
    try:
        state = sa_inspect(g)
        if "dictation_attempts" in state.dict and g.dictation_attempts:
            latest_attempts_map = {}
            # 按 example_index 分组，取最新的
            by_index: dict[int, ListeningDictationAttempt] = {}
            for a in g.dictation_attempts:
                if a.example_index not in by_index or a.created_at > by_index[a.example_index].created_at:
                    by_index[a.example_index] = a
            for idx, a in by_index.items():
                latest_attempts_map[str(idx)] = _serialize_attempt(a)
    except Exception:
        pass

    return GeneratedBlockOut(
        id=g.id,
        sentence_id=g.sentence_id,
        blocker_word=g.blocker_word,
        difficulty_type=g.difficulty_type,
        explanation=g.explanation,
        examples=examples,
        created_at=g.created_at,
        latest_attempts=latest_attempts_map,
    )


def _serialize_sentence(s: ListeningPracticeSentence) -> SentenceOut:
    generated = [_serialize_generated(g) for g in (s.generated_blocks or [])]
    return SentenceOut(
        id=s.id,
        session_id=s.session_id,
        original_text=s.original_text,
        order_index=s.order_index,
        note=s.note,
        blocker_words=_parse_blockers(s.blocker_words),
        generated_blocks=generated,
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


async def _count_blockers_for_session(db: AsyncSession, session_id: str) -> int:
    """汇总一个 session 下所有句子的障碍词总数"""
    q = await db.execute(
        select(ListeningPracticeSentence).where(ListeningPracticeSentence.session_id == session_id)
    )
    total = 0
    for s in q.scalars().all():
        total += len(_parse_blockers(s.blocker_words))
    return total


def _reject_if_demo(session_id: str, action: str = "修改") -> None:
    """对 demo 会话的写操作统一拒绝。"""
    if is_demo_session(session_id):
        raise HTTPException(
            status_code=400,
            detail=f"这是内置示例会话，不可{action}。请点击右上「新建练习」创建你自己的会话。",
        )


# ==================== Session CRUD ====================

@router.get("/sessions", response_model=list[SessionSummaryOut])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    q = await db.execute(
        select(ListeningPracticeSession).order_by(desc(ListeningPracticeSession.created_at))
    )
    sessions = list(q.scalars().all())

    # 保证 demo 置顶
    demo_sess: ListeningPracticeSession | None = None
    rest: list[ListeningPracticeSession] = []
    for s in sessions:
        if s.id == DEMO_SESSION_ID:
            demo_sess = s
        else:
            rest.append(s)
    ordered = ([demo_sess] if demo_sess else []) + rest

    results: list[SessionSummaryOut] = []
    for s in ordered:
        # 句子数
        cnt_q = await db.execute(
            select(func.count(ListeningPracticeSentence.id)).where(
                ListeningPracticeSentence.session_id == s.id
            )
        )
        sentence_count = cnt_q.scalar() or 0
        blocker_count = await _count_blockers_for_session(db, s.id)
        results.append(SessionSummaryOut(
            id=s.id,
            title=s.title,
            note=s.note,
            sentence_count=sentence_count,
            blocker_count=blocker_count,
            homework_id=s.homework_id,
            study_duration_seconds=s.study_duration_seconds or 0,
            created_at=s.created_at,
            updated_at=s.updated_at,
            is_demo=is_demo_session(s.id),
        ))
    return results


@router.get("/sessions/by-homework/{homework_id}", response_model=list[SessionSummaryOut])
async def get_sessions_by_homework(homework_id: str, db: AsyncSession = Depends(get_db)):
    """获取关联到某个作业的精听练习列表"""
    stmt = select(ListeningPracticeSession).where(
        ListeningPracticeSession.homework_id == homework_id
    ).order_by(desc(ListeningPracticeSession.updated_at))
    result = await db.execute(stmt)
    sessions = result.scalars().all()

    results = []
    for s in sessions:
        sent_q = await db.execute(
            select(func.count()).where(ListeningPracticeSentence.session_id == s.id)
        )
        sentence_count = sent_q.scalar() or 0
        results.append(SessionSummaryOut(
            id=s.id,
            title=s.title,
            note=s.note,
            sentence_count=sentence_count,
            blocker_count=0,
            homework_id=s.homework_id,
            created_at=s.created_at,
            updated_at=s.updated_at,
            is_demo=False,
        ))
    return results


@router.post("/sessions", response_model=SessionDetailOut, status_code=201)
async def create_session(data: SessionCreate, db: AsyncSession = Depends(get_db)):
    session = ListeningPracticeSession(
        id=str(uuid.uuid4()),
        title=data.title.strip(),
        note=data.note,
        homework_id=data.homework_id,
        cleanup_summary=data.cleanup_summary,
    )
    db.add(session)
    await db.flush()

    # 优先使用 sentences_with_context（AI 整理后或前端编辑过的结构化数据）
    if data.sentences_with_context:
        for idx, item in enumerate(data.sentences_with_context):
            text = item.text.strip()
            if not text:
                continue
            sentence_id = str(uuid.uuid4())
            # 预标障碍词：校验 + 同步单词本
            blockers_raw = [b.model_dump() for b in (item.blocker_words or [])]
            # 基础校验
            text_len = len(text)
            valid_blockers = [
                b for b in blockers_raw
                if 0 <= b["start"] < b["end"] <= text_len
            ]
            enriched = await sync_blockers_to_vocabulary(
                db,
                session_id=session.id,
                old_blockers=[],
                new_blockers=valid_blockers,
            )
            db.add(ListeningPracticeSentence(
                id=sentence_id,
                session_id=session.id,
                original_text=text,
                order_index=idx,
                note=item.note,
                blocker_words=json.dumps(enriched, ensure_ascii=False) if enriched else None,
            ))
    elif data.sentences:
        cleaned = [t.strip() for t in data.sentences if t and t.strip()]
        for idx, text in enumerate(cleaned):
            db.add(ListeningPracticeSentence(
                id=str(uuid.uuid4()),
                session_id=session.id,
                original_text=text,
                order_index=idx,
            ))

    await db.commit()

    # 重新 fetch 带 sentences + generated 的 detail
    return await _load_session_detail(db, session.id)


@router.get("/sessions/{session_id}", response_model=SessionDetailOut)
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    # 示例会话：首次访问时懒加载 AI 生成结果（幂等、防并发）
    if is_demo_session(session_id):
        try:
            await ensure_demo_generated(db)
        except Exception as e:
            # 失败静默：详情依然可返回，只是生成区块为空
            import logging
            logging.getLogger(__name__).warning("Demo 懒生成失败：%s", e)
    return await _load_session_detail(db, session_id)


async def _load_session_detail(db: AsyncSession, session_id: str) -> SessionDetailOut:
    q = await db.execute(
        select(ListeningPracticeSession)
        .where(ListeningPracticeSession.id == session_id)
        .options(
            selectinload(ListeningPracticeSession.sentences).selectinload(
                ListeningPracticeSentence.generated_blocks
            ).selectinload(
                ListeningPracticeGenerated.dictation_attempts
            )
        )
    )
    session = q.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    sentences = sorted(session.sentences or [], key=lambda x: x.order_index)
    return SessionDetailOut(
        id=session.id,
        title=session.title,
        note=session.note,
        homework_id=session.homework_id,
        cleanup_summary=session.cleanup_summary,
        created_at=session.created_at,
        updated_at=session.updated_at,
        sentences=[_serialize_sentence(s) for s in sentences],
        is_demo=is_demo_session(session.id),
    )


@router.put("/sessions/{session_id}", response_model=SessionDetailOut)
async def update_session(session_id: str, data: SessionUpdate, db: AsyncSession = Depends(get_db)):
    _reject_if_demo(session_id, action="重命名或修改备注")
    q = await db.execute(
        select(ListeningPracticeSession).where(ListeningPracticeSession.id == session_id)
    )
    session = q.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if data.title is not None:
        session.title = data.title.strip()
    if data.note is not None:
        session.note = data.note
    if data.homework_id is not None:
        session.homework_id = data.homework_id or None
    if data.cleanup_summary is not None:
        session.cleanup_summary = data.cleanup_summary
    if data.created_at is not None:
        from datetime import datetime as dt
        try:
            session.created_at = dt.fromisoformat(data.created_at.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            pass
    session.updated_at = datetime.utcnow()

    await db.commit()
    return await _load_session_detail(db, session_id)


@router.post("/sessions/{session_id}/study-time")
async def add_study_time(session_id: str, body: dict, db: AsyncSession = Depends(get_db)):
    """累加学习时长（秒）。前端定期调用上报活跃时间。"""
    seconds = body.get("seconds", 0)
    if not isinstance(seconds, int) or seconds <= 0 or seconds > 600:
        return {"ok": True}  # ignore invalid
    q = await db.execute(
        select(ListeningPracticeSession).where(ListeningPracticeSession.id == session_id)
    )
    session = q.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.study_duration_seconds = (session.study_duration_seconds or 0) + seconds
    await db.commit()
    return {"ok": True, "total_seconds": session.study_duration_seconds}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, db: AsyncSession = Depends(get_db)):
    _reject_if_demo(session_id, action="删除")
    q = await db.execute(
        select(ListeningPracticeSession).where(ListeningPracticeSession.id == session_id)
    )
    session = q.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # 级联清理来源于本会话的单词本条目
    source_id = f"{VOCAB_SOURCE_PREFIX}{session_id}"
    vq = await db.execute(
        select(VocabularyWord).where(
            and_(
                VocabularyWord.source_conversation_id == source_id,
                VocabularyWord.category == "listening",
            )
        )
    )
    for vw in vq.scalars().all():
        await db.delete(vw)

    await db.delete(session)
    await db.commit()
    return {"detail": "Session deleted"}


# ==================== Sentence 操作 ====================

@router.post("/sessions/{session_id}/sentences", response_model=SessionDetailOut)
async def add_sentences(
    session_id: str, data: SentenceBatchAdd, db: AsyncSession = Depends(get_db)
):
    _reject_if_demo(session_id, action="追加答案句")
    q = await db.execute(
        select(ListeningPracticeSession).where(ListeningPracticeSession.id == session_id)
    )
    session = q.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # 当前最大 order_index
    idx_q = await db.execute(
        select(func.coalesce(func.max(ListeningPracticeSentence.order_index), -1)).where(
            ListeningPracticeSentence.session_id == session_id
        )
    )
    current_max = idx_q.scalar() or -1

    cleaned = [t.strip() for t in data.sentences if t and t.strip()]
    for i, text in enumerate(cleaned):
        db.add(ListeningPracticeSentence(
            id=str(uuid.uuid4()),
            session_id=session_id,
            original_text=text,
            order_index=current_max + 1 + i,
        ))

    session.updated_at = datetime.utcnow()
    await db.commit()
    return await _load_session_detail(db, session_id)


@router.delete("/sentences/{sentence_id}")
async def delete_sentence(sentence_id: str, db: AsyncSession = Depends(get_db)):
    q = await db.execute(
        select(ListeningPracticeSentence).where(ListeningPracticeSentence.id == sentence_id)
    )
    sentence = q.scalar_one_or_none()
    if not sentence:
        raise HTTPException(status_code=404, detail="Sentence not found")

    _reject_if_demo(sentence.session_id, action="删除句子")

    session_id = sentence.session_id
    # 同步清理障碍词对应的单词本条目
    old_blockers = _parse_blockers(sentence.blocker_words)
    if old_blockers:
        await sync_blockers_to_vocabulary(
            db,
            session_id=session_id,
            old_blockers=[b.model_dump() for b in old_blockers],
            new_blockers=[],
        )

    await db.delete(sentence)
    await db.commit()
    return {"detail": "Sentence deleted"}


@router.put("/sentences/{sentence_id}/blockers", response_model=SentenceOut)
async def update_sentence_blockers(
    sentence_id: str, data: BlockerWordsUpdate, db: AsyncSession = Depends(get_db)
):
    q = await db.execute(
        select(ListeningPracticeSentence)
        .where(ListeningPracticeSentence.id == sentence_id)
        .options(selectinload(ListeningPracticeSentence.generated_blocks))
    )
    sentence = q.scalar_one_or_none()
    if not sentence:
        raise HTTPException(status_code=404, detail="Sentence not found")

    _reject_if_demo(sentence.session_id, action="修改障碍词")

    old_blockers_raw = _parse_blockers(sentence.blocker_words)
    old_blockers = [b.model_dump() for b in old_blockers_raw]
    new_blockers = [b.model_dump() for b in data.blocker_words]

    # 基础校验：位置不能超出原文
    text_len = len(sentence.original_text)
    for nb in new_blockers:
        if nb["start"] < 0 or nb["end"] > text_len or nb["start"] >= nb["end"]:
            raise HTTPException(
                status_code=400,
                detail=f"障碍词位置非法: word={nb['word']} start={nb['start']} end={nb['end']}",
            )

    # 双向同步单词本
    enriched = await sync_blockers_to_vocabulary(
        db,
        session_id=sentence.session_id,
        old_blockers=old_blockers,
        new_blockers=new_blockers,
    )

    # 清理已不再是障碍词的生成缓存
    new_words_set = {_normalize_word(b["word"]) for b in new_blockers}
    removed_norms = {_normalize_word(b["word"]) for b in old_blockers} - new_words_set
    if removed_norms:
        gq = await db.execute(
            select(ListeningPracticeGenerated).where(
                ListeningPracticeGenerated.sentence_id == sentence_id
            )
        )
        for g in gq.scalars().all():
            if g.blocker_word in removed_norms:
                await db.delete(g)

    sentence.blocker_words = json.dumps(enriched, ensure_ascii=False) if enriched else None
    sentence.updated_at = datetime.utcnow()

    # 更新 session 的 updated_at
    sq = await db.execute(
        select(ListeningPracticeSession).where(
            ListeningPracticeSession.id == sentence.session_id
        )
    )
    sess = sq.scalar_one_or_none()
    if sess:
        sess.updated_at = datetime.utcnow()

    await db.commit()

    # 重新加载
    q2 = await db.execute(
        select(ListeningPracticeSentence)
        .where(ListeningPracticeSentence.id == sentence_id)
        .options(selectinload(ListeningPracticeSentence.generated_blocks))
    )
    refreshed = q2.scalar_one()
    return _serialize_sentence(refreshed)


# ==================== AI 生成 ====================

@router.post("/sentences/{sentence_id}/generate", response_model=GenerateForSentenceResponse)
@router.post("/sentences/{sentence_id}/generate", response_model=GenerateForSentenceResponse)
async def generate_practice(
    sentence_id: str,
    data: GenerateForSentenceRequest,
    db: AsyncSession = Depends(get_db),
):
    q = await db.execute(
        select(ListeningPracticeSentence)
        .where(ListeningPracticeSentence.id == sentence_id)
        .options(selectinload(ListeningPracticeSentence.generated_blocks))
    )
    sentence = q.scalar_one_or_none()
    if not sentence:
        raise HTTPException(status_code=404, detail="Sentence not found")

    # 示例会话的生成结果是全局共享缓存，不允许强制刷新（避免一人点击影响所有人）
    if is_demo_session(sentence.session_id) and data.force_refresh:
        raise HTTPException(
            status_code=400,
            detail="示例会话的生成结果为全局共享，不支持重新生成。请通过「新建练习」创建你自己的会话。",
        )

    # 默认使用已保存的障碍词
    if data.words:
        words = data.words
    else:
        words = [b.word for b in _parse_blockers(sentence.blocker_words)]

    if not words:
        raise HTTPException(status_code=400, detail="请先标记障碍词再生成练习")

    # 调用生成服务，现在返回 GenerationResult
    generation_result = await generate_for_sentence(
        db,
        sentence=sentence,
        words=words,
        force_refresh=data.force_refresh,
        max_examples=data.max_examples,
    )
    await db.commit()

    # 构建 failed_words 列表
    failed_words_out = [
        {"word": f["word"], "reason": f["reason"]}
        for f in generation_result.failed_words
    ]

    # 确定生成完整性和消息
    is_complete = len(generation_result.failed_words) == 0
    message = ""
    if generation_result.failed_words:
        failed_count = len(generation_result.failed_words)
        total_count = len(generation_result.requested_words)
        failed_list = ", ".join(f["word"] for f in generation_result.failed_words[:3])
        if failed_count > 3:
            failed_list += f" 等 {failed_count - 3} 个词"
        message = f"已生成 {total_count - failed_count}/{total_count} 个词。{failed_list}生成失败，请检查设置或重试。"

    return GenerateForSentenceResponse(
        sentence_id=sentence.id,
        blocks=[_serialize_generated(g) for g in generation_result.blocks],
        requested_words=generation_result.requested_words,
        generated_words=[g.blocker_word for g in generation_result.blocks],
        failed_words=failed_words_out,
        is_complete=is_complete,
        message=message,
    )



# ==================== AI 笔记整理 ====================

@router.post("/cleanup", response_model=CleanupResponse)
async def cleanup_raw_note(data: CleanupRequest, db: AsyncSession = Depends(get_db)):
    """把用户粘贴的原始笔记用 AI 整理为结构化的答案句列表。
    不落库，由前端预览/编辑后调 create_session 接口保存。
    """
    result = await cleanup_listening_note(db, data.raw_text)
    return CleanupResponse(sentences=result["sentences"], summary=result.get("summary", ""))


# ==================== 句子 note 编辑 ====================

@router.put("/sentences/{sentence_id}/note", response_model=SentenceOut)
async def update_sentence_note(
    sentence_id: str, data: SentenceNoteUpdate, db: AsyncSession = Depends(get_db)
):
    q = await db.execute(
        select(ListeningPracticeSentence)
        .where(ListeningPracticeSentence.id == sentence_id)
        .options(selectinload(ListeningPracticeSentence.generated_blocks))
    )
    sentence = q.scalar_one_or_none()
    if not sentence:
        raise HTTPException(status_code=404, detail="Sentence not found")

    _reject_if_demo(sentence.session_id, action="编辑备注")

    sentence.note = (data.note or "").strip() or None
    sentence.updated_at = datetime.utcnow()
    await db.commit()

    q2 = await db.execute(
        select(ListeningPracticeSentence)
        .where(ListeningPracticeSentence.id == sentence_id)
        .options(selectinload(ListeningPracticeSentence.generated_blocks))
    )
    refreshed = q2.scalar_one()
    return _serialize_sentence(refreshed)


@router.put("/sentences/{sentence_id}/text", response_model=SentenceOut)
async def update_sentence_text(
    sentence_id: str, data: SentenceTextUpdate, db: AsyncSession = Depends(get_db)
):
    """修改答案原句。旧障碍词会按"词形"在新原句中重新定位，
    - 能定位的保留（更新 start/end）
    - 定位不到的剔除（同时清掉对应的 AI 生成缓存和单词本条目）
    - 无论是否重定位成功，整句的 AI 生成梯度例句缓存都会清空（例句基于旧原句，新原句下不再适用）
    """
    q = await db.execute(
        select(ListeningPracticeSentence)
        .where(ListeningPracticeSentence.id == sentence_id)
        .options(selectinload(ListeningPracticeSentence.generated_blocks))
    )
    sentence = q.scalar_one_or_none()
    if not sentence:
        raise HTTPException(status_code=404, detail="Sentence not found")

    _reject_if_demo(sentence.session_id, action="编辑原文")

    new_text = data.original_text.strip()
    if not new_text:
        raise HTTPException(status_code=400, detail="答案原句不能为空")

    if new_text == sentence.original_text:
        return _serialize_sentence(sentence)

    # 重新定位旧障碍词
    old_blockers = _parse_blockers(sentence.blocker_words)
    old_words = [b.word for b in old_blockers]
    relocated = _locate_words_in_text(new_text, old_words) if old_words else []
    relocated_norms = {_normalize_word(b["word"]) for b in relocated}

    # 同步单词本：定位不到的词从本会话来源的 vocab 里删
    old_dump = [b.model_dump() for b in old_blockers]
    enriched = await sync_blockers_to_vocabulary(
        db,
        session_id=sentence.session_id,
        old_blockers=old_dump,
        new_blockers=[
            {"word": r["word"], "start": r["start"], "end": r["end"]}
            for r in relocated
        ],
    )

    # 清空该句所有 AI 生成例句缓存（原文变了，旧例句不再贴合新语境）
    gq_all = await db.execute(
        select(ListeningPracticeGenerated).where(
            ListeningPracticeGenerated.sentence_id == sentence_id
        )
    )
    for g in gq_all.scalars().all():
        await db.delete(g)

    sentence.original_text = new_text
    sentence.blocker_words = (
        json.dumps(enriched, ensure_ascii=False) if enriched else None
    )
    sentence.updated_at = datetime.utcnow()

    # 更新 session updated_at
    sq = await db.execute(
        select(ListeningPracticeSession).where(
            ListeningPracticeSession.id == sentence.session_id
        )
    )
    sess = sq.scalar_one_or_none()
    if sess:
        sess.updated_at = datetime.utcnow()

    await db.commit()

    q2 = await db.execute(
        select(ListeningPracticeSentence)
        .where(ListeningPracticeSentence.id == sentence_id)
        .options(selectinload(ListeningPracticeSentence.generated_blocks))
    )
    refreshed = q2.scalar_one()
    # relocated_norms 仅用于推断哪些 vocab 被剔除（由 sync_blockers_to_vocabulary 统一处理）
    _ = relocated_norms
    return _serialize_sentence(refreshed)


# ==================== 听写记录 ====================

@router.post("/dictation-attempts", response_model=DictationAttemptOut)
async def save_dictation_attempt(
    body: DictationAttemptCreate,
    db: AsyncSession = Depends(get_db),
):
    """保存一次听写提交记录"""
    # 验证 generated_block 存在
    q = await db.execute(
        select(ListeningPracticeGenerated).where(
            ListeningPracticeGenerated.id == body.generated_block_id
        )
    )
    block = q.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Generated block not found")

    attempt = ListeningDictationAttempt(
        id=str(uuid.uuid4()),
        generated_block_id=body.generated_block_id,
        example_index=body.example_index,
        play_count=body.play_count,
        correct_count=body.correct_count,
        total_count=body.total_count,
        accuracy_pct=body.accuracy_pct,
        missed_words=json.dumps(body.missed_words) if body.missed_words else None,
        user_answers=json.dumps(body.user_answers) if body.user_answers else None,
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    return _serialize_attempt(attempt)


@router.get("/generated/{block_id}/attempts", response_model=DictationAttemptsResponse)
async def get_dictation_attempts(
    block_id: str,
    example_index: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """获取某 block（可选按 example_index 过滤）的听写历史"""
    stmt = (
        select(ListeningDictationAttempt)
        .where(ListeningDictationAttempt.generated_block_id == block_id)
    )
    if example_index is not None:
        stmt = stmt.where(ListeningDictationAttempt.example_index == example_index)
    stmt = stmt.order_by(desc(ListeningDictationAttempt.created_at))
    result = await db.execute(stmt)
    attempts = result.scalars().all()
    return DictationAttemptsResponse(attempts=[_serialize_attempt(a) for a in attempts])


# ==================== 延伸障碍词 ====================

@router.get("/sessions/{session_id}/discovered-words", response_model=DiscoveredWordsResponse)
async def get_discovered_words(session_id: str, db: AsyncSession = Depends(get_db)):
    """获取某 session 的延伸障碍词列表"""
    stmt = (
        select(ListeningDiscoveredWord)
        .where(ListeningDiscoveredWord.session_id == session_id)
        .order_by(ListeningDiscoveredWord.created_at)
    )
    result = await db.execute(stmt)
    words = result.scalars().all()
    return DiscoveredWordsResponse(words=[
        DiscoveredWordOut(
            id=w.id, session_id=w.session_id, word=w.word,
            note=w.note, source=w.source, created_at=w.created_at,
        ) for w in words
    ])


@router.post("/sessions/{session_id}/discovered-words", response_model=DiscoveredWordOut)
async def add_discovered_word(
    session_id: str,
    body: DiscoveredWordCreate,
    db: AsyncSession = Depends(get_db),
):
    """添加一个延伸障碍词（同时自动同步到单词本作为听力单词）"""
    from app.services.listening_practice_service import _auto_translate_word

    # 去重
    existing = await db.execute(
        select(ListeningDiscoveredWord).where(
            ListeningDiscoveredWord.session_id == session_id,
            func.lower(ListeningDiscoveredWord.word) == body.word.lower(),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="该词已存在")

    word = ListeningDiscoveredWord(
        session_id=session_id,
        word=body.word,
        note=body.note,
        source=body.source,
    )
    db.add(word)

    # 自动同步到单词本（如果还没有）
    from app.models.vocabulary import VocabularyWord
    vocab_q = await db.execute(
        select(VocabularyWord).where(VocabularyWord.word.ilike(body.word))
    )
    vocab_existing = vocab_q.scalars().first()
    if not vocab_existing:
        meaning = await _auto_translate_word(db, body.word) or f"({body.word})"
        db.add(VocabularyWord(
            id=str(uuid.uuid4()),
            word=body.word,
            meaning=meaning,
            category="listening",
            source_conversation_id=f"listening-practice:{session_id}",
            next_review_at=datetime.utcnow(),
        ))

    await db.commit()
    await db.refresh(word)
    return DiscoveredWordOut(
        id=word.id, session_id=word.session_id, word=word.word,
        note=word.note, source=word.source, created_at=word.created_at,
    )


@router.delete("/discovered-words/{word_id}")
async def delete_discovered_word(word_id: str, db: AsyncSession = Depends(get_db)):
    """删除一个延伸障碍词"""
    word = await db.get(ListeningDiscoveredWord, word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(word)
    await db.commit()
    return {"ok": True}


# ==================== 创建延伸练习（后端自动匹配来源句） ====================

async def _match_extension_words(db: AsyncSession, session_id: str):
    """匹配延伸障碍词到来源句子，返回 (orig_session, matched_sentences, orphan_words)"""
    import re as _re

    q = await db.execute(
        select(ListeningPracticeSession).where(ListeningPracticeSession.id == session_id)
    )
    orig_session = q.scalar_one_or_none()
    if not orig_session:
        raise HTTPException(status_code=404, detail="Session not found")

    dw_q = await db.execute(
        select(ListeningDiscoveredWord).where(ListeningDiscoveredWord.session_id == session_id)
    )
    discovered_words = dw_q.scalars().all()
    if not discovered_words:
        raise HTTPException(status_code=400, detail="没有延伸障碍词")

    dw_list = [w.word for w in discovered_words]

    sent_q = await db.execute(
        select(ListeningPracticeSentence).where(
            ListeningPracticeSentence.session_id == session_id
        )
    )
    sentences = sent_q.scalars().all()
    sentence_ids = [s.id for s in sentences]

    gen_q = await db.execute(
        select(ListeningPracticeGenerated).where(
            ListeningPracticeGenerated.sentence_id.in_(sentence_ids)
        )
    )
    generated_blocks = gen_q.scalars().all()

    word_to_sentence: dict[str, str] = {}

    for g in generated_blocks:
        try:
            examples = json.loads(g.examples)
        except Exception:
            continue
        for ex in examples:
            text = ex.get("text", "")
            for w in dw_list:
                if w in word_to_sentence:
                    continue
                pattern = _re.compile(r"\b" + _re.escape(w) + r"\b", _re.IGNORECASE)
                if pattern.search(text):
                    word_to_sentence[w] = text

    for s in sentences:
        for w in dw_list:
            if w in word_to_sentence:
                continue
            pattern = _re.compile(r"\b" + _re.escape(w) + r"\b", _re.IGNORECASE)
            if pattern.search(s.original_text):
                word_to_sentence[w] = s.original_text

    sentence_to_words: dict[str, list[str]] = {}
    for w, sent in word_to_sentence.items():
        if sent not in sentence_to_words:
            sentence_to_words[sent] = []
        sentence_to_words[sent].append(w)

    orphan_words = [w for w in dw_list if w not in word_to_sentence]

    return orig_session, sentence_to_words, orphan_words, dw_list


@router.get("/sessions/{session_id}/preview-extension")
async def preview_extension_session(session_id: str, db: AsyncSession = Depends(get_db)):
    """预览延伸 session：返回匹配结果但不创建"""
    import re as _re

    orig_session, sentence_to_words, orphan_words, dw_list = await _match_extension_words(db, session_id)

    preview_sentences = []
    for sent, words in sentence_to_words.items():
        blockers = []
        for w in words:
            pattern = _re.compile(r"\b" + _re.escape(w) + r"\b", _re.IGNORECASE)
            match = pattern.search(sent)
            if match:
                blockers.append({"word": w, "start": match.start(), "end": match.end()})
        preview_sentences.append({
            "text": sent,
            "blocker_words": blockers,
            "note": "；".join([f"{w}: 听写时漏听/误写" for w in words]),
        })

    return {
        "title": f"从「{orig_session.title}」延伸的障碍词",
        "total_words": len(dw_list),
        "matched_sentences": len(preview_sentences),
        "orphan_words": orphan_words,
        "sentences": preview_sentences,
    }


@router.post("/sessions/{session_id}/create-extension", response_model=SessionDetailOut)
async def create_extension_session(session_id: str, db: AsyncSession = Depends(get_db)):
    """从已有 session 的延伸障碍词创建新 session，自动匹配来源练习句并预标障碍词"""
    import re as _re

    orig_session, sentence_to_words, orphan_words, dw_list = await _match_extension_words(db, session_id)

    # 创建新 session
    new_session = ListeningPracticeSession(
        id=str(uuid.uuid4()),
        title=f"从「{orig_session.title}」延伸的障碍词",
        note=f"延伸 · 包含 {len(dw_list)} 个障碍词，对应 {len(sentence_to_words)} 个来源练习句",
    )
    db.add(new_session)
    await db.flush()

    order_idx = 0
    for sent, words in sentence_to_words.items():
        blockers = []
        for w in words:
            pattern = _re.compile(r"\b" + _re.escape(w) + r"\b", _re.IGNORECASE)
            match = pattern.search(sent)
            if match:
                blockers.append({"word": w, "start": match.start(), "end": match.end(), "vocab_word_id": None})

        note = "；".join([f"{w}: 听写时漏听/误写" for w in words])

        sentence = ListeningPracticeSentence(
            id=str(uuid.uuid4()),
            session_id=new_session.id,
            original_text=sent,
            order_index=order_idx,
            note=note,
            blocker_words=json.dumps(blockers, ensure_ascii=False) if blockers else None,
        )
        db.add(sentence)
        order_idx += 1

    if orphan_words:
        sentence = ListeningPracticeSentence(
            id=str(uuid.uuid4()),
            session_id=new_session.id,
            original_text=", ".join(orphan_words),
            order_index=order_idx,
            note=f"独立障碍词（未匹配到来源句）：{', '.join(orphan_words)}",
        )
        db.add(sentence)

    await db.commit()
    return await _load_session_detail(db, new_session.id)

# ==================== 生成/重新生成复盘总结 ====================

@router.post("/sessions/{session_id}/generate-summary")
async def generate_session_summary(session_id: str, db: AsyncSession = Depends(get_db)):
    """为已有 session 生成 AI 复盘总结（基于句子和笔记内容）"""
    from app.services.llm_service import complete_chat
    from app.utils.llm_config import get_llm_config

    q = await db.execute(
        select(ListeningPracticeSession).where(ListeningPracticeSession.id == session_id)
    )
    session = q.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # 收集所有句子和笔记
    sent_q = await db.execute(
        select(ListeningPracticeSentence).where(
            ListeningPracticeSentence.session_id == session_id
        ).order_by(ListeningPracticeSentence.order_index)
    )
    sentences = sent_q.scalars().all()

    if not sentences:
        raise HTTPException(status_code=400, detail="没有答案句，无法生成总结")

    # 构建上下文
    context_lines = []
    for i, s in enumerate(sentences):
        blockers_text = ""
        if s.blocker_words:
            try:
                blockers = json.loads(s.blocker_words)
                blockers_text = "、".join([b["word"] for b in blockers])
            except Exception:
                pass
        line = f"{i+1}. 答案句：{s.original_text}"
        if blockers_text:
            line += f"\n   障碍词：{blockers_text}"
        if s.note:
            line += f"\n   备注：{s.note}"
        context_lines.append(line)

    context = "\n".join(context_lines)

    model_name, api_key, api_base = await get_llm_config(db)
    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 API Key")

    messages = [
        {"role": "system", "content": """你是雅思听力教练，请分析以下精听复盘记录，生成总结。

要求：
1. 错误类型分布：如"拼写错误 X 题、连读漏听 X 题"等
2. 共性问题：具体的发音/辨音薄弱点
3. 改进建议：1-2 条针对性建议

用中文，100-200 字，实事求是。"""},
        {"role": "user", "content": f"精听记录标题：{session.title}\n\n{context}"},
    ]

    try:
        raw = await complete_chat(
            model=model_name, api_key=api_key, api_base=api_base,
            messages=messages, temperature=0.3,
        )
        summary = raw.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成失败: {e}")

    session.cleanup_summary = summary
    session.updated_at = datetime.utcnow()
    await db.commit()

    return {"session_id": session_id, "cleanup_summary": summary}


# ==================== AI 分析错词 ====================

@router.post("/analyze-missed-words", response_model=AnalyzeMissedWordsResponse)
async def analyze_missed_words(
    body: AnalyzeMissedWordsRequest,
    db: AsyncSession = Depends(get_db),
):
    """AI分析听写错词，组合连续错词为短语并生成备注"""
    import json as json_mod
    from app.prompts.listening_analyze_prompt import LISTENING_ANALYZE_MISSED_PROMPT
    from app.services.listening_practice_service import complete_chat

    user_msg = json_mod.dumps({
        "original_text": body.original_text,
        "user_answers": body.user_answers,
        "missed_words": body.missed_words,
        "missed_indices": body.missed_indices,
    }, ensure_ascii=False)

    try:
        raw = await complete_chat(
            system=LISTENING_ANALYZE_MISSED_PROMPT,
            user=user_msg,
            db=db,
        )
        items = json_mod.loads(raw)
        analyzed = [AnalyzedBlockerWord(word=it["word"], note=it["note"]) for it in items]
    except Exception as e:
        # Fallback: just return individual words without AI analysis
        analyzed = [AnalyzedBlockerWord(word=w, note="") for w in body.missed_words]

    return AnalyzeMissedWordsResponse(analyzed_words=analyzed)


# ==================== 智能分级 ====================

@router.post("/prioritize-blockers", response_model=PrioritizeResponse)
async def prioritize_blockers(
    body: PrioritizeRequest,
    db: AsyncSession = Depends(get_db),
):
    """AI 对障碍词进行优先级分级：must/recommended/skip"""
    import json as json_mod
    from app.prompts.listening_prioritize_prompt import LISTENING_PRIORITIZE_PROMPT
    from app.services.llm_service import complete_chat
    from app.utils.llm_config import get_llm_config
    from app.services.listening_practice_service import _clean_json_response

    # 收集所有障碍词
    all_words: list[str] = []
    for s in body.sentences:
        all_words.extend(s.blocker_words)

    if not all_words:
        return PrioritizeResponse(
            priorities=[],
            stats={"must": 0, "recommended": 0, "skip": 0},
            estimated_minutes=0,
        )

    # 构建 AI 输入
    payload = {
        "sentences": [
            {"text": s.text, "blocker_words": s.blocker_words, "note": s.note}
            for s in body.sentences
        ]
    }

    model_name, api_key, api_base = await get_llm_config(db)
    if not api_key:
        # Fallback: all words as "must"
        priorities = [PrioritizedWord(word=w, priority="must", reason="未配置 API Key，默认必练") for w in all_words]
        stats = {"must": len(all_words), "recommended": 0, "skip": 0}
        estimated = len(all_words) * 2
        return PrioritizeResponse(priorities=priorities, stats=stats, estimated_minutes=estimated)

    messages = [
        {"role": "system", "content": LISTENING_PRIORITIZE_PROMPT},
        {"role": "user", "content": json_mod.dumps(payload, ensure_ascii=False)},
    ]

    try:
        raw = await complete_chat(
            model=model_name,
            api_key=api_key,
            api_base=api_base,
            messages=messages,
            temperature=0.3,
        )
        cleaned = _clean_json_response(raw)
        parsed = json_mod.loads(cleaned)

        if not isinstance(parsed, list):
            raise ValueError("Non-array response")

        priorities: list[PrioritizedWord] = []
        seen_words: set[str] = set()
        for item in parsed:
            word = item.get("word", "")
            priority = item.get("priority", "must")
            reason = item.get("reason", "")
            if priority not in ("must", "recommended", "skip"):
                priority = "must"
            if word.lower() not in seen_words:
                priorities.append(PrioritizedWord(word=word, priority=priority, reason=reason))
                seen_words.add(word.lower())

        # 补全 AI 漏掉的词
        for w in all_words:
            if w.lower() not in seen_words:
                priorities.append(PrioritizedWord(word=w, priority="must", reason="未被 AI 分级，默认必练"))
                seen_words.add(w.lower())

    except Exception:
        # Fallback: all words as "must"
        priorities = [PrioritizedWord(word=w, priority="must", reason="分级失败，默认必练") for w in all_words]

    # 统计
    stats = {"must": 0, "recommended": 0, "skip": 0}
    for p in priorities:
        stats[p.priority] = stats.get(p.priority, 0) + 1

    # 预估时间：must = 2min/词, recommended = 1min/词, skip = 0
    estimated = stats["must"] * 2 + stats["recommended"] * 1

    return PrioritizeResponse(priorities=priorities, stats=stats, estimated_minutes=estimated)


def _serialize_attempt(a: ListeningDictationAttempt) -> DictationAttemptOut:
    missed = []
    if a.missed_words:
        try:
            missed = json.loads(a.missed_words)
        except Exception:
            pass
    user_answers = []
    if a.user_answers:
        try:
            user_answers = json.loads(a.user_answers)
        except Exception:
            pass
    return DictationAttemptOut(
        id=a.id,
        generated_block_id=a.generated_block_id,
        example_index=a.example_index,
        play_count=a.play_count,
        correct_count=a.correct_count,
        total_count=a.total_count,
        accuracy_pct=a.accuracy_pct,
        missed_words=missed,
        user_answers=user_answers,
        created_at=a.created_at,
    )
