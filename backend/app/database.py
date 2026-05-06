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
    from app.models.feedback import FeedbackItem  # noqa
    from app.models.schedule import ScheduleTask  # noqa
    from app.models.writing_template import WritingTemplate  # noqa
    from app.models.writing_material import WritingMaterial, WritingMaterialKeyword, DowngradeAttempt  # noqa
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add new columns if they don't exist (SQLite doesn't support IF NOT EXISTS for columns)
        await _migrate_add_columns(conn)
    # Backfill scores for existing AI report feedbacks that haven't been parsed yet
    await _backfill_feedback_scores()
    # Backfill scores for listening/reading homeworks from PDF attachments
    await _backfill_listening_reading_scores()
    # Backfill AI summaries for homeworks that don't have one yet
    await _backfill_homework_summaries()
    # Import writing template seed data if table is empty
    await _seed_writing_templates()


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
        ("homeworks", "summary", "TEXT"),
        ("homeworks", "summary_updated_at", "TEXT"),
        ("listening_practice_sessions", "cleanup_summary", "TEXT"),
        ("listening_practice_sessions", "study_duration_seconds", "INTEGER DEFAULT 0"),
        ("vocabulary_words", "encounter_count", "INTEGER DEFAULT 1"),
        ("schedule_tasks", "source", "TEXT"),
        ("schedule_tasks", "plan_tag", "TEXT"),
        ("writing_templates", "blank_slots", "TEXT"),
        ("writing_templates", "slots_passed", "TEXT"),
        ("writing_templates", "first_learned_at", "DATETIME"),
        ("listening_practice_sentences", "translation", "TEXT"),
        ("writing_materials", "reasoning_chain_en", "TEXT"),
        ("writing_materials", "example_en", "TEXT"),
    ]
    for table, column, col_type in new_columns:
        try:
            await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
        except Exception:
            # Column already exists
            pass

    # 回填 first_learned_at：已学过但没有该字段的记录
    # review_count <= 3 的近期新学句型用 last_reviewed_at
    # review_count > 3 的老句型用 created_at（首次学习时间已无从追溯，用创建时间近似）
    try:
        await conn.execute(text(
            "UPDATE writing_templates SET first_learned_at = last_reviewed_at "
            "WHERE review_count > 0 AND review_count <= 3 AND first_learned_at IS NULL AND last_reviewed_at IS NOT NULL"
        ))
        await conn.execute(text(
            "UPDATE writing_templates SET first_learned_at = created_at "
            "WHERE review_count > 3 AND first_learned_at IS NULL AND created_at IS NOT NULL"
        ))
    except Exception:
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


async def _backfill_homework_summaries():
    """Background: generate AI summaries for homeworks that don't have one yet."""
    import asyncio
    from sqlalchemy import select
    from app.models.homework import Homework

    async with async_session() as db:
        result = await db.execute(
            select(Homework.id).where(Homework.summary.is_(None))
        )
        missing_ids = [r[0] for r in result.all()]

    if not missing_ids:
        return

    print(f"[backfill] {len(missing_ids)} homeworks need AI summary, generating in background...")

    async def _generate_one(hw_id: str):
        try:
            from app.services.homework_summary_service import generate_summary_for_homework
            async with async_session() as db:
                await generate_summary_for_homework(db, hw_id)
                await db.commit()
        except Exception:
            pass

    # Fire-and-forget: don't block startup
    async def _run_all():
        for hw_id in missing_ids:
            await _generate_one(hw_id)
        print(f"[backfill] Finished generating summaries for {len(missing_ids)} homeworks.")

    asyncio.create_task(_run_all())


async def _seed_writing_templates():
    """Import writing template seed data if the table is empty."""
    import json as _json
    import os
    from sqlalchemy import select, func
    from app.models.writing_template import WritingTemplate

    async with async_session() as db:
        count = (await db.execute(select(func.count()).select_from(WritingTemplate))).scalar() or 0
        if count > 0:
            return  # Already has data

        seed_path = os.path.join(os.path.dirname(__file__), "data", "writing_templates_seed.json")
        if not os.path.exists(seed_path):
            return

        with open(seed_path, "r", encoding="utf-8") as f:
            items = _json.load(f)

        import uuid as _uuid
        for i, item in enumerate(items):
            db.add(WritingTemplate(
                id=str(_uuid.uuid4()),
                category=item["category"],
                sub_category=item["sub_category"],
                scene_cn=item["scene_cn"],
                template_en=item["template_en"],
                example_en=item.get("example_en"),
                note=item.get("note"),
                difficulty=item.get("difficulty", 1),
                sort_order=i,
            ))

        await db.commit()
        print(f"[seed] Imported {len(items)} writing templates.")
