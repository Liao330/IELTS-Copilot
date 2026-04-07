from __future__ import annotations

import json
import os
import uuid
from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.homework import Homework, HomeworkFile, HomeworkFeedback
from app.models.file import File
from app.schemas.homework import (
    HomeworkOut, HomeworkCreate, HomeworkUpdate,
    HomeworkFeedbackOut, FeedbackCreate, FeedbackUpdate, HomeworkDateGroup, FileInfo,
)

router = APIRouter(prefix="/api/homeworks", tags=["homeworks"])


async def _file_has_references(db: AsyncSession, file_id: str, exclude_homework_file: bool = False) -> bool:
    """Check whether a File record is still referenced by other tables.

    Checks: HomeworkFile (other rows), Homework.file_id, HomeworkFeedback.file_id,
    StudyPlanDay image columns, StudyPlan.file_id.
    """
    from app.models.study_plan import StudyPlanDay, StudyPlan

    if not exclude_homework_file:
        r = await db.execute(select(func.count()).select_from(HomeworkFile).where(HomeworkFile.file_id == file_id))
        if r.scalar() > 0:
            return True
    else:
        # Check if other HomeworkFile rows reference it (the one being deleted is already gone)
        r = await db.execute(select(func.count()).select_from(HomeworkFile).where(HomeworkFile.file_id == file_id))
        if r.scalar() > 0:
            return True

    # Homework.file_id (legacy single-file)
    r = await db.execute(select(func.count()).select_from(Homework).where(Homework.file_id == file_id))
    if r.scalar() > 0:
        return True

    # HomeworkFeedback.file_id
    r = await db.execute(select(func.count()).select_from(HomeworkFeedback).where(HomeworkFeedback.file_id == file_id))
    if r.scalar() > 0:
        return True

    # StudyPlan.file_id
    r = await db.execute(select(func.count()).select_from(StudyPlan).where(StudyPlan.file_id == file_id))
    if r.scalar() > 0:
        return True

    # StudyPlanDay image columns
    r = await db.execute(select(func.count()).select_from(StudyPlanDay).where(
        (StudyPlanDay.listening_image_id == file_id) |
        (StudyPlanDay.speaking_image_id == file_id) |
        (StudyPlanDay.reading_image_id == file_id) |
        (StudyPlanDay.writing_image_id == file_id)
    ))
    if r.scalar() > 0:
        return True

    return False


# ---- File serving (MUST be defined BEFORE /{homework_id} to avoid route shadowing) ----

@router.get("/files/{file_id}/download")
async def download_file(file_id: str, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import FileResponse
    f = await db.get(File, file_id)
    if not f:
        raise HTTPException(status_code=404, detail="文件不存在")
    if not os.path.exists(f.filepath):
        raise HTTPException(status_code=404, detail="文件已丢失，请重新上传")
    return FileResponse(f.filepath, filename=f.filename, media_type=f.mime_type)


@router.get("/files/{file_id}/preview")
async def preview_file(file_id: str, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import FileResponse
    f = await db.get(File, file_id)
    if not f:
        raise HTTPException(status_code=404, detail="文件不存在")
    if not os.path.exists(f.filepath):
        raise HTTPException(status_code=404, detail="文件已丢失，请重新上传")
    return FileResponse(
        f.filepath,
        filename=f.filename,
        media_type=f.mime_type,
        content_disposition_type="inline",
    )


async def _resolve_homework_out(hw: Homework, db: AsyncSession) -> HomeworkOut:
    """Convert a Homework ORM object (with feedbacks & homework_files loaded) to HomeworkOut."""
    # Build files list from homework_files relation
    files: list[FileInfo] = []
    for hf in (hw.homework_files or []):
        f = await db.get(File, hf.file_id)
        if f:
            files.append(FileInfo(id=f.id, name=f.filename, mime_type=f.mime_type))

    # Legacy single file_id compat
    file_name = None
    file_mime_type = None
    if hw.file_id:
        f = await db.get(File, hw.file_id)
        if f:
            file_name = f.filename
            file_mime_type = f.mime_type

    feedbacks = []
    for fb in (hw.feedbacks or []):
        # Deserialize scores JSON string
        scores_data = None
        if fb.scores:
            try:
                scores_data = json.loads(fb.scores)
            except (json.JSONDecodeError, TypeError):
                pass

        fb_dict = {
            "id": fb.id, "homework_id": fb.homework_id, "feedback_type": fb.feedback_type,
            "content": fb.content, "file_id": fb.file_id,
            "file_name": None, "file_mime_type": None, "scores": scores_data, "created_at": fb.created_at,
        }
        if fb.file_id:
            f = await db.get(File, fb.file_id)
            if f:
                fb_dict["file_name"] = f.filename
                fb_dict["file_mime_type"] = f.mime_type
        feedbacks.append(fb_dict)

    return HomeworkOut(
        id=hw.id, title=hw.title, category=hw.category,
        homework_date=hw.homework_date, description=hw.description,
        file_id=hw.file_id, file_name=file_name, file_mime_type=file_mime_type,
        files=files, feedbacks=feedbacks,
        created_at=hw.created_at, updated_at=hw.updated_at,
    )


def _load_options():
    return [selectinload(Homework.feedbacks), selectinload(Homework.homework_files)]


@router.get("", response_model=list[HomeworkOut])
async def list_homeworks(
    category: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Homework).options(*_load_options()).order_by(desc(Homework.homework_date), desc(Homework.created_at))
    if category:
        stmt = stmt.where(Homework.category == category)
    if start_date:
        stmt = stmt.where(Homework.homework_date >= start_date)
    if end_date:
        stmt = stmt.where(Homework.homework_date <= end_date)

    result = await db.execute(stmt)
    homeworks = result.scalars().all()
    return [await _resolve_homework_out(hw, db) for hw in homeworks]


@router.get("/calendar", response_model=list[HomeworkDateGroup])
async def homework_calendar(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020),
    db: AsyncSession = Depends(get_db),
):
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)

    stmt = select(Homework.homework_date, Homework.category).where(
        Homework.homework_date >= start,
        Homework.homework_date < end,
    )
    result = await db.execute(stmt)
    rows = result.all()

    groups: dict[date, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for hw_date, cat in rows:
        groups[hw_date][cat] += 1

    return [
        HomeworkDateGroup(date=d, categories=dict(cats), total=sum(cats.values()))
        for d, cats in sorted(groups.items())
    ]


@router.get("/{homework_id}", response_model=HomeworkOut)
async def get_homework(homework_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Homework).options(*_load_options()).where(Homework.id == homework_id)
    result = await db.execute(stmt)
    hw = result.scalar_one_or_none()
    if not hw:
        raise HTTPException(status_code=404, detail="作业不存在")
    return await _resolve_homework_out(hw, db)


@router.post("", response_model=HomeworkOut, status_code=201)
async def create_homework(data: HomeworkCreate, db: AsyncSession = Depends(get_db)):
    hw = Homework(
        id=str(uuid.uuid4()),
        title=data.title,
        category=data.category,
        homework_date=data.homework_date,
        description=data.description,
        file_id=data.file_id,
    )
    db.add(hw)

    # Handle multi-file: file_ids takes priority, fallback to legacy file_id
    file_ids = data.file_ids or ([data.file_id] if data.file_id else [])
    for fid in file_ids:
        if fid:
            db.add(HomeworkFile(id=str(uuid.uuid4()), homework_id=hw.id, file_id=fid))

    await db.commit()

    stmt = select(Homework).options(*_load_options()).where(Homework.id == hw.id)
    result = await db.execute(stmt)
    hw = result.scalar_one()
    return await _resolve_homework_out(hw, db)


@router.put("/{homework_id}", response_model=HomeworkOut)
async def update_homework(homework_id: str, data: HomeworkUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(Homework).options(*_load_options()).where(Homework.id == homework_id)
    result = await db.execute(stmt)
    hw = result.scalar_one_or_none()
    if not hw:
        raise HTTPException(status_code=404, detail="作业不存在")

    update_data = data.model_dump(exclude_unset=True)
    file_ids = update_data.pop("file_ids", None)

    for field, value in update_data.items():
        setattr(hw, field, value)

    # If file_ids is explicitly provided, sync the homework_files relation
    if file_ids is not None:
        # Remove existing homework_files
        for hf in list(hw.homework_files):
            await db.delete(hf)
        # Add new ones
        for fid in file_ids:
            if fid:
                db.add(HomeworkFile(id=str(uuid.uuid4()), homework_id=hw.id, file_id=fid))
        # Also set legacy file_id to first file for backward compat
        hw.file_id = file_ids[0] if file_ids else None

    await db.commit()

    stmt = select(Homework).options(*_load_options()).where(Homework.id == homework_id)
    result = await db.execute(stmt)
    hw = result.scalar_one()
    return await _resolve_homework_out(hw, db)


@router.delete("/{homework_id}", status_code=204)
async def delete_homework(homework_id: str, db: AsyncSession = Depends(get_db)):
    hw = await db.get(Homework, homework_id)
    if not hw:
        raise HTTPException(status_code=404, detail="作业不存在")
    await db.delete(hw)
    await db.commit()


# ---- Homework file management ----

@router.post("/{homework_id}/files", response_model=HomeworkOut, status_code=201)
async def add_homework_file(homework_id: str, file_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    """Add a file to a homework."""
    hw = await db.get(Homework, homework_id)
    if not hw:
        raise HTTPException(status_code=404, detail="作业不存在")
    f = await db.get(File, file_id)
    if not f:
        raise HTTPException(status_code=404, detail="文件不存在")

    db.add(HomeworkFile(id=str(uuid.uuid4()), homework_id=homework_id, file_id=file_id))
    await db.commit()

    stmt = select(Homework).options(*_load_options()).where(Homework.id == homework_id)
    result = await db.execute(stmt)
    hw = result.scalar_one()
    return await _resolve_homework_out(hw, db)


@router.delete("/{homework_id}/files/{file_id}", status_code=200, response_model=HomeworkOut)
async def remove_homework_file(homework_id: str, file_id: str, db: AsyncSession = Depends(get_db)):
    """Remove a file from a homework. Only deletes the physical file if no other references exist."""
    stmt = select(HomeworkFile).where(
        HomeworkFile.homework_id == homework_id,
        HomeworkFile.file_id == file_id,
    )
    result = await db.execute(stmt)
    hf = result.scalar_one_or_none()
    if not hf:
        raise HTTPException(status_code=404, detail="文件关联不存在")

    await db.delete(hf)

    # Update legacy file_id if it pointed to this file
    hw = await db.get(Homework, homework_id)
    if hw and hw.file_id == file_id:
        hw.file_id = None

    # Only delete the File record & disk file if nothing else references it
    f = await db.get(File, file_id)
    if f:
        has_refs = await _file_has_references(db, file_id, exclude_homework_file=True)
        if not has_refs:
            try:
                if os.path.exists(f.filepath):
                    os.remove(f.filepath)
            except OSError:
                pass
            await db.delete(f)

    await db.commit()

    stmt = select(Homework).options(*_load_options()).where(Homework.id == homework_id)
    result = await db.execute(stmt)
    hw = result.scalar_one()
    return await _resolve_homework_out(hw, db)


# ---- Feedbacks ----

@router.post("/{homework_id}/feedbacks", response_model=HomeworkFeedbackOut, status_code=201)
async def add_feedback(homework_id: str, data: FeedbackCreate, db: AsyncSession = Depends(get_db)):
    hw = await db.get(Homework, homework_id)
    if not hw:
        raise HTTPException(status_code=404, detail="作业不存在")

    # Auto-parse scores from AI report text
    scores_json = None
    if data.feedback_type == "ai_report":
        from app.utils.score_parser import parse_scores
        parse_text = data.content or ""
        # If a file is attached and has text_content, also try that
        if data.file_id and not parse_text:
            f = await db.get(File, data.file_id)
            if f and hasattr(f, "text_content") and f.text_content:
                parse_text = f.text_content
        scores = parse_scores(parse_text, hw.category)
        if scores:
            scores_json = json.dumps(scores, ensure_ascii=False)

    fb = HomeworkFeedback(
        id=str(uuid.uuid4()),
        homework_id=homework_id,
        feedback_type=data.feedback_type,
        content=data.content,
        file_id=data.file_id,
        scores=scores_json,
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)

    scores_data = None
    if fb.scores:
        try:
            scores_data = json.loads(fb.scores)
        except (json.JSONDecodeError, TypeError):
            pass

    out = {
        "id": fb.id, "homework_id": fb.homework_id, "feedback_type": fb.feedback_type,
        "content": fb.content, "file_id": fb.file_id, "created_at": fb.created_at,
        "scores": scores_data,
    }
    if fb.file_id:
        f = await db.get(File, fb.file_id)
        if f:
            out["file_name"] = f.filename
            out["file_mime_type"] = f.mime_type
    return HomeworkFeedbackOut(**out)


@router.put("/{homework_id}/feedbacks/{feedback_id}", response_model=HomeworkFeedbackOut)
async def update_feedback(
    homework_id: str, feedback_id: str, data: FeedbackUpdate, db: AsyncSession = Depends(get_db),
):
    fb = await db.get(HomeworkFeedback, feedback_id)
    if not fb or fb.homework_id != homework_id:
        raise HTTPException(status_code=404, detail="反馈不存在")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(fb, field, value)

    # Re-parse scores if this is an AI report and content changed
    if fb.feedback_type == "ai_report":
        from app.utils.score_parser import parse_scores
        hw = await db.get(Homework, homework_id)
        parse_text = fb.content or ""
        if fb.file_id and not parse_text:
            f = await db.get(File, fb.file_id)
            if f and hasattr(f, "text_content") and f.text_content:
                parse_text = f.text_content
        scores = parse_scores(parse_text, hw.category if hw else "")
        fb.scores = json.dumps(scores, ensure_ascii=False) if scores else None

    await db.commit()
    await db.refresh(fb)

    scores_data = None
    if fb.scores:
        try:
            scores_data = json.loads(fb.scores)
        except (json.JSONDecodeError, TypeError):
            pass

    out = {
        "id": fb.id, "homework_id": fb.homework_id, "feedback_type": fb.feedback_type,
        "content": fb.content, "file_id": fb.file_id, "created_at": fb.created_at,
        "scores": scores_data,
    }
    if fb.file_id:
        f = await db.get(File, fb.file_id)
        if f:
            out["file_name"] = f.filename
            out["file_mime_type"] = f.mime_type
    return HomeworkFeedbackOut(**out)


@router.delete("/{homework_id}/feedbacks/{feedback_id}", status_code=204)
async def delete_feedback(homework_id: str, feedback_id: str, db: AsyncSession = Depends(get_db)):
    fb = await db.get(HomeworkFeedback, feedback_id)
    if not fb or fb.homework_id != homework_id:
        raise HTTPException(status_code=404, detail="反馈不存在")
    await db.delete(fb)
    await db.commit()
