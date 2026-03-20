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
    from app.models import Agent, Conversation, Message, File, Note, Setting, Homework, HomeworkFile, HomeworkFeedback, VocabularyWord, FavoriteSentence, ContextMaterial, StudyPlan, StudyPlanDay, DailyReportCache  # noqa
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add new columns if they don't exist (SQLite doesn't support IF NOT EXISTS for columns)
        await _migrate_add_columns(conn)


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
        ("study_plan_days", "listening_image_id", "VARCHAR"),
        ("study_plan_days", "speaking_image_id", "VARCHAR"),
        ("study_plan_days", "reading_image_id", "VARCHAR"),
        ("study_plan_days", "writing_image_id", "VARCHAR"),
        ("daily_report_cache", "include_notes", "BOOLEAN DEFAULT 0"),
    ]
    for table, column, col_type in new_columns:
        try:
            await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
        except Exception:
            # Column already exists
            pass
