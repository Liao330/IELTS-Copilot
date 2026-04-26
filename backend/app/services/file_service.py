from __future__ import annotations

import uuid
import os
import json
import logging

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.file import File
from app.config import UPLOAD_DIR, MAX_FILE_SIZE, ALLOWED_MIME_TYPES
from app.utils.file_parser import extract_text_from_file
from app.services.speech_service import transcribe_audio

logger = logging.getLogger(__name__)


def _is_audio_or_video(mime_type: str) -> bool:
    mt = (mime_type or "").lower()
    return mt.startswith("audio/") or mt.startswith("video/")


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

    mime_type = file.content_type or "application/octet-stream"
    text_content = extract_text_from_file(filepath, mime_type)

    # 音视频文件：尝试 Whisper 转写写入 text_content，便于后续 AI 分析
    if text_content is None and _is_audio_or_video(mime_type):
        try:
            transcript = await transcribe_audio(db, filepath, mime_type)
            if transcript:
                text_content = transcript
                logger.info(
                    "音频转写成功 %s (%d chars)", file.filename, len(transcript)
                )
            else:
                logger.info("音频转写未产生文本（可能未配置 ASR key）：%s", file.filename)
        except Exception:
            logger.exception("音频转写异常，将跳过：%s", file.filename)

    db_file = File(
        id=file_id,
        filename=file.filename or "unknown",
        filepath=filepath,
        mime_type=mime_type,
        size=len(content),
        text_content=text_content,
    )
    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)
    return db_file
