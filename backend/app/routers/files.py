from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.file import File as FileModel
from app.services.file_service import upload_file
from app.services.speech_service import transcribe_audio

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("/upload", status_code=201)
async def upload(file: UploadFile = FastAPIFile(...), db: AsyncSession = Depends(get_db)):
    try:
        db_file = await upload_file(db, file)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "id": db_file.id,
        "filename": db_file.filename,
        "mime_type": db_file.mime_type,
        "size": db_file.size,
        "text_content": db_file.text_content,
    }


@router.post("/{file_id}/transcribe")
async def transcribe_existing_file(file_id: str, db: AsyncSession = Depends(get_db)):
    """对一个已存在的音视频文件重新调用 ASR，写回 text_content。

    用于以下场景：
    - 用户首次上传时未配置 ASR key，后来配置了要回补
    - 转写失败想重试
    """
    f = await db.get(FileModel, file_id)
    if not f:
        raise HTTPException(status_code=404, detail="文件不存在")
    mt = (f.mime_type or "").lower()
    if not (mt.startswith("audio/") or mt.startswith("video/")):
        raise HTTPException(status_code=400, detail="该文件不是音频或视频，无需转写")

    transcript = await transcribe_audio(db, f.filepath, f.mime_type)
    if not transcript:
        raise HTTPException(
            status_code=400,
            detail="转写失败，请确认已在设置页面填写 OpenAI Whisper 的 API Key",
        )

    f.text_content = transcript
    await db.commit()
    return {"id": f.id, "text_content": transcript}
