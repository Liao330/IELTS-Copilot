from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
DATABASE_URL = f"sqlite+aiosqlite:///{DATA_DIR / 'ielts_copilot.db'}"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB (音视频文件可能较大)
ALLOWED_MIME_TYPES = {
    # 图片
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp",
    # 文档
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/msword",  # .doc
    "text/plain",
    "text/markdown",  # .md
    # 音频
    "audio/mpeg", "audio/mp3", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm",
    "audio/x-m4a", "audio/aac", "audio/x-wav", "audio/flac", "audio/x-flac",
    "audio/m4a", "audio/x-aac",
    # 视频
    "video/mp4", "video/quicktime", "video/webm", "video/ogg", "video/x-msvideo",
    "video/x-matroska", "video/avi",
}
