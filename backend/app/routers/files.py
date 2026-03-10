from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.file_service import upload_file

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
