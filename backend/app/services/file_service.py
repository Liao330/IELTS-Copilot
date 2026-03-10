from __future__ import annotations

import uuid
import os
import json

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.file import File
from app.config import UPLOAD_DIR, MAX_FILE_SIZE, ALLOWED_MIME_TYPES
from app.utils.file_parser import extract_text_from_file


async def upload_file(db: AsyncSession, file: UploadFile) -> File:
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise ValueError(f"不支持的文件类型: {file.content_type}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise ValueError(f"文件大小超过限制 (最大 10MB)")

    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "file")[1]
    stored_filename = f"{file_id}{ext}"
    filepath = str(UPLOAD_DIR / stored_filename)

    with open(filepath, "wb") as f:
        f.write(content)

    text_content = extract_text_from_file(filepath, file.content_type or "")

    db_file = File(
        id=file_id,
        filename=file.filename or "unknown",
        filepath=filepath,
        mime_type=file.content_type or "application/octet-stream",
        size=len(content),
        text_content=text_content,
    )
    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)
    return db_file
