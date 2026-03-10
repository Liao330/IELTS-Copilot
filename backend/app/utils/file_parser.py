from __future__ import annotations

import os
from pathlib import Path

from docx import Document
from PyPDF2 import PdfReader


def extract_text_from_file(filepath: str, mime_type: str) -> str | None:
    if mime_type == "text/plain":
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        doc = Document(filepath)
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    elif mime_type == "application/pdf":
        reader = PdfReader(filepath)
        texts = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                texts.append(text)
        return "\n".join(texts)
    elif mime_type.startswith("image/"):
        return None  # Images don't get text extracted; used as vision input
    return None
