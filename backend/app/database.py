from __future__ import annotations

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

from app.config import DATABASE_URL

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session


async def init_db():
    from app.models import Agent, Conversation, Message, File, Note, Setting, Homework, HomeworkFile, HomeworkFeedback, VocabularyWord, FavoriteSentence, ContextMaterial, DailyReportCache  # noqa
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add new columns if they don't exist (SQLite doesn't support IF NOT EXISTS for columns)
        await _migrate_add_columns(conn)
    # Backfill scores for existing AI report feedbacks that haven't been parsed yet
    await _backfill_feedback_scores()
    # Backfill scores for listening/reading homeworks from PDF attachments
    await _backfill_listening_reading_scores()


async def _migrate_add_columns(conn):
    """Add new columns to existing tables if they don't exist yet."""
    # Recreate daily_report_cache if it has the old unique constraint on report_date
    # (it's just a cache table, so dropping it is safe)
    try:
        await conn.execute(text(
            "SELECT include_notes FROM daily_report_cache LIMIT 1"
        ))
    except Exception:
        # Column doesn't exist — old schema. Drop and let create_all rebuild it.
        try:
            await conn.execute(text("DROP TABLE IF EXISTS daily_report_cache"))
            # Re-run create_all for just this table
            from app.models.daily_report_cache import DailyReportCache
            await conn.run_sync(DailyReportCache.__table__.create, checkfirst=True)
        except Exception:
            pass

    new_columns = [
        ("daily_report_cache", "include_notes", "BOOLEAN DEFAULT 0"),
        ("homework_feedbacks", "scores", "TEXT"),
        ("listening_practice_sentences", "note", "TEXT"),
    ]
    for table, column, col_type in new_columns:
        try:
            await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
        except Exception:
            # Column already exists
            pass


async def _backfill_feedback_scores():
    """One-time backfill: parse scores for existing ai_report feedbacks that have no scores yet."""
    import json
    from sqlalchemy import select
    from app.models.homework import HomeworkFeedback, Homework
    from app.models.file import File
    from app.utils.score_parser import parse_scores

    async with async_session() as db:
        # Find all ai_report feedbacks where scores is NULL and content is not empty
        stmt = select(HomeworkFeedback).where(
            HomeworkFeedback.feedback_type == "ai_report",
            HomeworkFeedback.scores.is_(None),
        )
        result = await db.execute(stmt)
        feedbacks = result.scalars().all()

        if not feedbacks:
            return

        updated = 0
        for fb in feedbacks:
            # Get homework category
            hw = await db.get(Homework, fb.homework_id)
            category = hw.category if hw else ""

            # Try content first, then file text_content
            parse_text = fb.content or ""
            if not parse_text and fb.file_id:
                f = await db.get(File, fb.file_id)
                if f and hasattr(f, "text_content") and f.text_content:
                    parse_text = f.text_content

            if not parse_text:
                continue

            scores = parse_scores(parse_text, category)
            if scores:
                fb.scores = json.dumps(scores, ensure_ascii=False)
                updated += 1

        if updated:
            await db.commit()
            print(f"[backfill] Parsed scores for {updated}/{len(feedbacks)} existing AI report feedbacks.")


async def _backfill_listening_reading_scores():
    """一次性回填：从听力/阅读作业附件 PDF 中提取分数，自动创建 auto_scores feedback。"""
    import json
    import uuid
    from sqlalchemy import select, and_
    from app.models.homework import Homework, HomeworkFile, HomeworkFeedback
    from app.models.file import File
    from app.utils.score_parser import parse_scores

    async with async_session() as db:
        # 找所有听力/阅读作业
        stmt = select(Homework).where(Homework.category.in_(["listening", "reading"]))
        result = await db.execute(stmt)
        homeworks = result.scalars().all()
        if not homeworks:
            return

        updated = 0
        for hw in homeworks:
            # 检查是否已有 auto_scores
            fb_q = await db.execute(
                select(HomeworkFeedback).where(
                    and_(
                        HomeworkFeedback.homework_id == hw.id,
                        HomeworkFeedback.feedback_type == "auto_scores",
                    )
                )
            )
            if fb_q.scalar_one_or_none():
                continue

            # 查附件
            hf_q = await db.execute(
                select(HomeworkFile).where(HomeworkFile.homework_id == hw.id)
            )
            for hf in hf_q.scalars().all():
                f = await db.get(File, hf.file_id)
                if not f or not f.text_content:
                    continue
                scores = parse_scores(f.text_content, hw.category)
                if scores:
                    db.add(HomeworkFeedback(
                        id=str(uuid.uuid4()),
                        homework_id=hw.id,
                        feedback_type="auto_scores",
                        content=f"从附件 {f.filename} 中自动提取的分数",
                        scores=json.dumps(scores, ensure_ascii=False),
                    ))
                    updated += 1
                    break  # 一个作业只需一条

        if updated:
            await db.commit()
            print(f"[backfill] Auto-extracted scores for {updated} listening/reading homeworks.")
