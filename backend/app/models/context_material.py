import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ContextMaterial(Base):
    """对话级关键材料存储。

    当主 Agent 识别到用户发送了关键学习材料（作文原文、口语答案、阅读文章等），
    自动提取并保存到此表。后续追问时，摘要中会引用材料编号，
    子 Agent 按需读取完整内容，避免每轮都把原文塞进 context。
    """
    __tablename__ = "context_materials"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    conversation_id: Mapped[str] = mapped_column(
        String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    # 材料类型：essay(作文), speaking_answer(口语答案), reading_passage(阅读文章),
    #          listening_script(听力原文), feedback(老师反馈), other(其他)
    material_type: Mapped[str] = mapped_column(String, nullable=False, default="other")
    # 简短标题，用于摘要中引用（如"环境保护大作文"、"Part2 描述一个地方"）
    title: Mapped[str] = mapped_column(String, nullable=False)
    # 完整内容（md/txt 格式）
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # 来源消息 ID（哪条用户消息产生的这份材料）
    source_message_id: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="context_materials")
