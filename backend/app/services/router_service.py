"""主 Agent 路由服务：意图识别、材料缓存、上下文构建。"""

from __future__ import annotations

import json
import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.models.agent import Agent
from app.models.message import Message
from app.models.context_material import ContextMaterial
from app.prompts.copilot_router import COPILOT_ROUTER_PROMPT
from app.services.llm_service import complete_chat


# ---------- 数据结构 ----------

class RouteResult:
    """路由结果"""
    def __init__(
        self,
        agent_id: str,
        reason: str,
        is_followup: bool,
        context_summary: str,
        has_key_material: bool,
        material_title: str,
        material_type: str,
    ):
        self.agent_id = agent_id
        self.reason = reason
        self.is_followup = is_followup
        self.context_summary = context_summary
        self.has_key_material = has_key_material
        self.material_title = material_title
        self.material_type = material_type


# ---------- 路由识别 ----------

async def identify_route(
    model: str,
    api_key: str,
    api_base: str | None,
    user_content: str,
    recent_messages: list[dict],
    material_titles: list[str],
) -> RouteResult:
    """用 LLM 判断用户消息应路由到哪个子助手。

    Args:
        model: LLM 模型名
        api_key: API key
        api_base: API base URL
        user_content: 用户当前消息内容
        recent_messages: 最近 3~5 轮对话（含 role + content）
        material_titles: 当前对话已有的关键材料标题列表
    """
    # 构建系统消息，附加已有材料信息
    system_content = COPILOT_ROUTER_PROMPT
    if material_titles:
        system_content += f"\n\n## 当前对话已有的关键材料\n{chr(10).join(f'- {t}' for t in material_titles)}\n\n如果用户在追问与这些材料相关的内容，请在 context_summary 中提及材料标题。"

    messages = [
        {"role": "system", "content": system_content},
        *recent_messages,
        {"role": "user", "content": user_content},
    ]

    raw = await complete_chat(
        model=model,
        api_key=api_key,
        api_base=api_base,
        messages=messages,
        temperature=0.1,  # 极低温度，确保确定性
    )

    return _parse_route_result(raw)


def _parse_route_result(raw: str) -> RouteResult:
    """解析 LLM 返回的 JSON 路由结果。"""
    # 尝试提取 JSON（LLM 可能包裹在 ```json ``` 中）
    text = raw.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()

    # 可能直接就是 JSON
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # fallback：无法解析时默认路由到写作辅导
        return RouteResult(
            agent_id="writing-coach",
            reason="无法解析路由结果，默认使用写作辅导",
            is_followup=False,
            context_summary="",
            has_key_material=False,
            material_title="",
            material_type="",
        )

    # 校验 agent_id 合法性
    valid_agents = {
        "writing-assistant", "writing-coach",
        "speaking-assistant", "speaking-feedback",
        "reading-assistant", "listening-assistant",
    }
    agent_id = data.get("agent_id", "writing-coach")
    if agent_id not in valid_agents:
        agent_id = "writing-coach"

    return RouteResult(
        agent_id=agent_id,
        reason=data.get("reason", ""),
        is_followup=data.get("is_followup", False),
        context_summary=data.get("context_summary", ""),
        has_key_material=data.get("has_key_material", False),
        material_title=data.get("material_title", ""),
        material_type=data.get("material_type", ""),
    )


# ---------- 关键材料管理 ----------

async def save_material(
    db: AsyncSession,
    conversation_id: str,
    title: str,
    content: str,
    material_type: str,
    source_message_id: str | None = None,
) -> ContextMaterial:
    """保存关键材料到数据库。"""
    material = ContextMaterial(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        material_type=material_type,
        title=title,
        content=content,
        source_message_id=source_message_id,
    )
    db.add(material)
    await db.flush()  # 获取 ID 但不提交（由调用方统一 commit）
    return material


async def get_materials(
    db: AsyncSession,
    conversation_id: str,
) -> list[ContextMaterial]:
    """获取对话下所有关键材料。"""
    result = await db.execute(
        select(ContextMaterial)
        .where(ContextMaterial.conversation_id == conversation_id)
        .order_by(ContextMaterial.created_at)
    )
    return list(result.scalars().all())


async def get_material_by_id(
    db: AsyncSession,
    material_id: str,
) -> Optional[ContextMaterial]:
    """按 ID 获取单个材料。"""
    result = await db.execute(
        select(ContextMaterial).where(ContextMaterial.id == material_id)
    )
    return result.scalar_one_or_none()


# ---------- 上下文构建 ----------

async def build_routed_messages(
    db: AsyncSession,
    conversation_id: str,
    sub_agent: Agent,
    route_result: RouteResult,
    user_content: str,
    recent_count: int = 6,
) -> list[dict]:
    """构建发给子 Agent 的 messages 列表。

    结构：
    1. 子 Agent 的 System Prompt
    2. [对话背景]（追问时注入上下文摘要 + 材料索引）
    3. 最近 N 条同类 Agent 的对话历史（有限制）
    4. 用户当前消息

    Args:
        db: 数据库会话
        conversation_id: 对话 ID
        sub_agent: 被路由到的子 Agent 对象
        route_result: 路由识别结果
        user_content: 用户当前消息（含附件文本）
        recent_count: 取最近几条历史消息
    """
    llm_messages: list[dict] = []

    # 1. 子 Agent System Prompt
    llm_messages.append({"role": "system", "content": sub_agent.system_prompt})

    # 2. 上下文摘要（追问时注入）
    context_parts: list[str] = []
    if route_result.is_followup and route_result.context_summary:
        context_parts.append(f"对话背景：{route_result.context_summary}")

    # 材料索引
    materials = await get_materials(db, conversation_id)
    if materials:
        material_lines = []
        for m in materials:
            # 给子 Agent 提供材料概要（前200字）和材料 ID
            preview = m.content[:200] + ("..." if len(m.content) > 200 else "")
            material_lines.append(
                f"- 【{m.title}】(类型: {m.material_type}, ID: {m.id})\n  预览: {preview}"
            )
        context_parts.append(
            "当前对话中的关键材料：\n" + "\n".join(material_lines)
            + "\n\n如果你需要查看某份材料的完整内容来更准确地回答，请在回复中说明"
            "「我需要查看【材料标题】的完整内容」，系统会自动注入。"
            "大多数情况下预览信息已足够，无需额外请求。"
        )

    if context_parts:
        llm_messages.append({
            "role": "system",
            "content": "[上下文信息]\n" + "\n\n".join(context_parts),
        })

    # 3. 最近 N 条历史消息（优先同 Agent 的，但也包含用户消息保持连贯性）
    history_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(desc(Message.created_at))
        .limit(recent_count + 1)  # +1 因为可能包含刚存的用户消息
    )
    history_msgs = list(reversed(history_result.scalars().all()))

    for msg in history_msgs:
        # 跳过最新的用户消息（因为会单独添加在最后）
        if msg.role == "user":
            llm_messages.append({"role": "user", "content": msg.content})
        elif msg.role == "assistant":
            llm_messages.append({"role": "assistant", "content": msg.content})

    # 4. 用户当前消息（如果历史中已包含则跳过）
    if not history_msgs or history_msgs[-1].role != "user" or history_msgs[-1].content != user_content:
        # 避免重复：只有当最后一条不是当前消息时才添加
        pass  # 实际上用户消息已经在历史中了（send_message 先保存再构建）

    return llm_messages


async def build_routed_messages_with_material(
    db: AsyncSession,
    conversation_id: str,
    sub_agent: Agent,
    route_result: RouteResult,
    user_content: str,
    material_ids: list[str] | None = None,
    recent_count: int = 6,
) -> list[dict]:
    """构建消息，并将指定的材料完整内容注入。

    这是 build_routed_messages 的增强版，当子 Agent 请求查看材料时使用。
    """
    llm_messages = await build_routed_messages(
        db, conversation_id, sub_agent, route_result, user_content, recent_count
    )

    # 注入完整材料
    if material_ids:
        material_contents = []
        for mid in material_ids:
            m = await get_material_by_id(db, mid)
            if m:
                material_contents.append(
                    f"=== 【{m.title}】完整内容 ===\n{m.content}\n=== 材料结束 ==="
                )
        if material_contents:
            # 在 system prompt 后插入材料
            llm_messages.insert(1, {
                "role": "system",
                "content": "[关键材料完整内容]\n" + "\n\n".join(material_contents),
            })

    return llm_messages
