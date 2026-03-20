"""Service to parse a study plan PDF into structured day-by-day tasks using AI."""

from __future__ import annotations

import json
import logging
import os
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.study_plan import StudyPlan, StudyPlanDay
from app.models.file import File
from app.config import UPLOAD_DIR
from app.utils.file_parser import extract_text_from_file
from app.utils.pdf_images import extract_pdf_images
from app.services.report_service import _resolve_llm_config
from app.services.llm_service import complete_chat

logger = logging.getLogger(__name__)


PARSE_SYSTEM_PROMPT = """你是一个学习计划解析器。你的任务是将雅思学习打卡计划的文本内容**严格按照原文**解析为结构化的 JSON 数据。

计划通常是按天（1, 2, 3, ...）组织的。注意：并不是每天都包含四个科目，有些天只有听力+口语，有些天只有阅读+写作，请严格按照原文来判断。

请严格按以下 JSON 格式输出（纯 JSON，不要 markdown 代码块）：
{
  "title": "计划标题",
  "total_days": 40,
  "days": [
    {
      "day": 1,
      "listening": "听力任务描述 或 null",
      "speaking": "口语任务描述 或 null",
      "reading": "阅读任务描述 或 null",
      "writing": "写作任务描述 或 null"
    },
    ...
  ]
}

规则：
1. 每天必须包含 day（数字）、listening、speaking、reading、writing 四个字段
2. **极其重要：如果原文中某天没有某科目的任务，该字段必须设为 null。绝对不要自行编造、补充、推测任何原文中不存在的任务内容！**
3. 只提取原文中明确写出的任务，不要根据"模式"或"规律"自行推断某天应该有什么任务
4. 保留任务的核心内容和要求，包括具体题目、注意事项、达标标准
5. 口语题目如果是 Part 2，保留完整的 topic 和 cue card 内容
6. 写作题目保留完整的 task 描述
7. 如果某天是「考前建议」或总结性内容，也包含在对应天数中
8. 不要遗漏任何一天
9. 每天的文本内容不用过长，保留核心即可，注意事项如果是"相同版块不再赘述"则不需要重复
10. 再次强调：宁可设为 null 也不要编造！原文没有就是 null！
"""


async def parse_plan_pdf(db: AsyncSession, file_id: str) -> StudyPlan:
    """Parse an uploaded PDF file into a StudyPlan with structured days.

    Steps:
    1. Read file text_content from DB (already extracted on upload)
    2. If empty, extract from disk
    3. Send to LLM for structured parsing
    4. Create StudyPlan + StudyPlanDay records
    """
    f = await db.get(File, file_id)
    if not f:
        raise ValueError("文件不存在")

    # Get text content
    text_content = f.text_content
    if not text_content:
        import os
        if os.path.exists(f.filepath):
            text_content = extract_text_from_file(f.filepath, f.mime_type)

    if not text_content or len(text_content.strip()) < 100:
        raise ValueError("无法从文件中提取足够的文本内容，请确保上传的是可读的 PDF 文件")

    # Truncate if very long (keep within token limits)
    if len(text_content) > 30000:
        text_content = text_content[:30000] + "\n...(内容已截断)"

    # Call LLM to parse
    model, api_key, api_base = await _resolve_llm_config(db)

    messages = [
        {"role": "system", "content": PARSE_SYSTEM_PROMPT},
        {"role": "user", "content": f"请解析以下学习计划内容：\n\n{text_content}"},
    ]

    raw = await complete_chat(
        model=model, api_key=api_key, api_base=api_base,
        messages=messages, temperature=0.1,
    )

    # Parse JSON response
    parsed = _parse_json(raw)

    title = parsed.get("title", "学习计划")
    total_days = parsed.get("total_days", len(parsed.get("days", [])))
    days_data = parsed.get("days", [])

    if not days_data:
        raise ValueError("AI 未能解析出任何天数数据，请检查 PDF 内容格式")

    # Deactivate any existing active plan
    from sqlalchemy import select, update
    await db.execute(
        update(StudyPlan).where(StudyPlan.is_active == True).values(is_active=False)  # noqa: E712
    )

    # Create plan
    plan = StudyPlan(
        id=str(uuid.uuid4()),
        title=title,
        file_id=file_id,
        total_days=total_days,
        current_day=1,
        is_active=True,
    )
    db.add(plan)

    # Create days
    day_records: list[StudyPlanDay] = []
    for d in days_data:
        day_num = d.get("day")
        if day_num is None:
            continue
        day = StudyPlanDay(
            id=str(uuid.uuid4()),
            plan_id=plan.id,
            day_number=int(day_num),
            listening=d.get("listening"),
            speaking=d.get("speaking"),
            reading=d.get("reading"),
            writing=d.get("writing"),
        )
        db.add(day)
        day_records.append(day)

    # Extract chart images from PDF and assign to writing-task days
    if f.filepath and os.path.exists(f.filepath) and f.mime_type == "application/pdf":
        await _assign_pdf_images(db, f.filepath, day_records)

    await db.commit()
    await db.refresh(plan)
    return plan


async def _assign_pdf_images(
    db: AsyncSession, filepath: str, day_records: list[StudyPlanDay]
) -> None:
    """Extract chart images from the PDF and assign them to writing-task days in order."""
    try:
        images = extract_pdf_images(filepath, min_size=200)
    except Exception as exc:
        logger.warning("Failed to extract images from PDF: %s", exc)
        return

    if not images:
        return

    # Identify days that have a writing task, in day_number order
    writing_days = sorted(
        [d for d in day_records if d.writing],
        key=lambda d: d.day_number,
    )

    # Assign images to writing days in order (1:1 mapping)
    for idx, img_bytes in enumerate(images):
        if idx >= len(writing_days):
            logger.info("More images (%d) than writing days (%d); ignoring extras", len(images), len(writing_days))
            break

        # Save image as a File record
        file_id = str(uuid.uuid4())
        filename = f"chart_day{writing_days[idx].day_number}_{file_id[:8]}.png"
        dest_path = str(UPLOAD_DIR / filename)

        with open(dest_path, "wb") as fp:
            fp.write(img_bytes)

        file_record = File(
            id=file_id,
            filename=filename,
            filepath=dest_path,
            mime_type="image/png",
            size=len(img_bytes),
            text_content=None,
        )
        db.add(file_record)

        writing_days[idx].writing_image_id = file_id
        logger.info("Assigned image to Day %d (file_id=%s)", writing_days[idx].day_number, file_id)


def _parse_json(raw: str) -> dict:
    """Best-effort JSON parsing from LLM output."""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass
        raise ValueError(f"AI 返回内容无法解析为 JSON：{text[:200]}...")
