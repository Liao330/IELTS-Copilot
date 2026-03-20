from __future__ import annotations

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, delete

from app.database import get_db, async_session
from app.models.agent import Agent
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.file import File
from app.models.setting import Setting
from app.schemas.message import MessageCreate, MessageEdit
from app.services.llm_service import stream_chat, complete_chat
from app.services.router_service import (
    identify_route,
    save_material,
    get_materials,
    build_routed_messages,
)

router = APIRouter(prefix="/api/conversations", tags=["messages"])


async def _get_settings(db: AsyncSession) -> dict:
    result = await db.execute(select(Setting))
    settings = {s.key: s.value for s in result.scalars().all()}
    return settings


def _parse_json_setting(value: str, default=None):
    if not value:
        return default
    return json.loads(value)


def _resolve_provider(model_name: str, providers: dict) -> tuple[str | None, str | None]:
    """Resolve api_key and api_base from model_name and providers config."""
    api_key = None
    api_base = None
    provider_key = model_name.split("/")[0] if "/" in model_name else model_name
    if provider_key in providers:
        provider_config = providers[provider_key]
        api_key = provider_config.get("api_key")
        api_base = provider_config.get("api_base")

    if not api_key:
        for prov_name, prov_config in providers.items():
            if prov_config.get("api_key"):
                api_key = prov_config["api_key"]
                api_base = prov_config.get("api_base")
                break

    return api_key, api_base


async def _build_attachment_content(
    attachments: list[str] | None, db: AsyncSession
) -> tuple[list[str], str | None]:
    """Return (attachment_texts, attachment_json) for given file ids."""
    if not attachments:
        return [], None
    attachment_texts = []
    attachment_infos = []
    for file_id in attachments:
        file_result = await db.execute(select(File).where(File.id == file_id))
        file_obj = file_result.scalar_one_or_none()
        if file_obj:
            attachment_infos.append({
                "file_id": file_obj.id,
                "filename": file_obj.filename,
                "mime_type": file_obj.mime_type,
            })
            if file_obj.text_content:
                attachment_texts.append(
                    f"[文件: {file_obj.filename}]\n{file_obj.text_content}"
                )
    attachment_json = json.dumps(attachment_infos, ensure_ascii=False) if attachment_infos else None
    return attachment_texts, attachment_json


async def _enrich_user_content_from_attachments(
    msg: Message, db: AsyncSession
) -> str:
    """Given a Message with attachments JSON, return content with file texts appended."""
    msg_content = msg.content
    if msg.attachments:
        try:
            att_infos = json.loads(msg.attachments)
            att_texts = []
            for att in att_infos:
                file_result = await db.execute(
                    select(File).where(File.id == att.get("file_id"))
                )
                file_obj = file_result.scalar_one_or_none()
                if file_obj and file_obj.text_content:
                    att_texts.append(
                        f"[文件: {file_obj.filename}]\n{file_obj.text_content}"
                    )
            if att_texts:
                msg_content += "\n\n---附件内容---\n" + "\n\n".join(att_texts)
        except (json.JSONDecodeError, TypeError):
            pass
    return msg_content


def _make_streaming_response(event_generator):
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
):
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    agent_result = await db.execute(select(Agent).where(Agent.id == conv.agent_id))
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    settings = await _get_settings(db)
    context_window = int(settings.get("context_window_size", "20"))
    stream_enabled = settings.get("stream_enabled", "true") == "true"
    default_model = settings.get("default_model", "openai/qwen-turbo-2024-11-01")
    providers = _parse_json_setting(settings.get("llm_providers", "{}"), {})

    model_name = conv.model_name or default_model
    api_key, api_base = _resolve_provider(model_name, providers)

    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key，请前往设置页面配置"
        )

    attachment_texts, attachment_json = await _build_attachment_content(
        data.attachments, db
    )

    user_content = data.content
    if attachment_texts:
        user_content += "\n\n---附件内容---\n" + "\n\n".join(attachment_texts)

    user_msg = Message(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        role="user",
        content=data.content,
        attachments=attachment_json,
    )
    db.add(user_msg)

    conv.updated_at = datetime.utcnow()
    if conv.title == "新对话" and data.content:
        conv.title = data.content[:50] + ("..." if len(data.content) > 50 else "")

    await db.commit()

    # ========== 主助手路由模式 ==========
    if conv.agent_id == "ielts-copilot":
        return await _handle_copilot_routed(
            conversation_id=conversation_id,
            user_msg_id=user_msg.id,
            user_content=user_content,
            model_name=model_name,
            api_key=api_key,
            api_base=api_base,
            stream_enabled=stream_enabled,
            context_window=context_window,
        )

    # ========== 普通子助手模式（原有逻辑） ==========
    history_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(desc(Message.created_at))
        .limit(context_window)
    )
    history_msgs = list(reversed(history_result.scalars().all()))

    llm_messages = [{"role": "system", "content": agent.system_prompt}]
    for msg in history_msgs:
        if msg.role == "assistant":
            llm_messages.append({"role": "assistant", "content": msg.content})
        elif msg.role == "user":
            msg_content = msg.content
            if msg.id == user_msg.id and attachment_texts:
                msg_content = user_content
            llm_messages.append({"role": "user", "content": msg_content})

    assistant_msg_id = str(uuid.uuid4())

    if not stream_enabled:
        try:
            full_content = await complete_chat(
                model=model_name,
                api_key=api_key,
                api_base=api_base,
                messages=llm_messages,
            )
            async with async_session() as save_db:
                assistant_msg = Message(
                    id=assistant_msg_id,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_content,
                )
                save_db.add(assistant_msg)
                await save_db.commit()
            return JSONResponse({
                "id": assistant_msg_id,
                "conversation_id": conversation_id,
                "role": "assistant",
                "content": full_content,
                "user_message_id": user_msg.id,
            })
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"API 调用失败: {e}")

    async def event_generator():
        full_content = ""
        yield f"data: {json.dumps({'type': 'start', 'message_id': assistant_msg_id, 'user_message_id': user_msg.id})}\n\n"

        try:
            async for chunk in stream_chat(
                model=model_name,
                api_key=api_key,
                api_base=api_base,
                messages=llm_messages,
            ):
                full_content += chunk
                yield f"data: {json.dumps({'type': 'delta', 'content': chunk})}\n\n"

            async with async_session() as save_db:
                assistant_msg = Message(
                    id=assistant_msg_id,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_content,
                )
                save_db.add(assistant_msg)
                await save_db.commit()

            yield f"data: {json.dumps({'type': 'done', 'message_id': assistant_msg_id})}\n\n"

        except Exception as e:
            error_msg = str(e)
            yield f"data: {json.dumps({'type': 'error', 'message': f'API 调用失败: {error_msg}'})}\n\n"

    return _make_streaming_response(event_generator)


@router.post("/{conversation_id}/retry")
async def retry_message(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
):
    """重新生成最后一条助手回复，不新建用户消息。"""
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    agent_result = await db.execute(select(Agent).where(Agent.id == conv.agent_id))
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    settings = await _get_settings(db)
    context_window = int(settings.get("context_window_size", "20"))
    stream_enabled = settings.get("stream_enabled", "true") == "true"
    default_model = settings.get("default_model", "openai/qwen-turbo-2024-11-01")
    providers = _parse_json_setting(settings.get("llm_providers", "{}"), {})

    model_name = conv.model_name or default_model
    api_key, api_base = _resolve_provider(model_name, providers)

    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key，请前往设置页面配置"
        )

    # ========== 主助手路由模式 ==========
    if conv.agent_id == "ielts-copilot":
        # For retry, find the last user message to re-route
        last_user_result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id, Message.role == "user")
            .order_by(desc(Message.created_at))
            .limit(1)
        )
        last_user_msg = last_user_result.scalar_one_or_none()

        if last_user_msg:
            user_content = await _enrich_user_content_from_attachments(last_user_msg, db)
            return await _handle_copilot_routed(
                conversation_id=conversation_id,
                user_msg_id=last_user_msg.id,
                user_content=user_content,
                model_name=model_name,
                api_key=api_key,
                api_base=api_base,
                stream_enabled=stream_enabled,
                context_window=context_window,
            )

    # ========== 普通子助手模式 ==========
    history_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(desc(Message.created_at))
        .limit(context_window)
    )
    history_msgs = list(reversed(history_result.scalars().all()))

    llm_messages = [{"role": "system", "content": agent.system_prompt}]
    for msg in history_msgs:
        if msg.role == "assistant":
            llm_messages.append({"role": "assistant", "content": msg.content})
        elif msg.role == "user":
            msg_content = await _enrich_user_content_from_attachments(msg, db)
            llm_messages.append({"role": "user", "content": msg_content})

    assistant_msg_id = str(uuid.uuid4())

    if not stream_enabled:
        try:
            full_content = await complete_chat(
                model=model_name,
                api_key=api_key,
                api_base=api_base,
                messages=llm_messages,
            )
            async with async_session() as save_db:
                assistant_msg = Message(
                    id=assistant_msg_id,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_content,
                )
                save_db.add(assistant_msg)
                await save_db.commit()
            return JSONResponse({
                "id": assistant_msg_id,
                "conversation_id": conversation_id,
                "role": "assistant",
                "content": full_content,
            })
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"API 调用失败: {e}")

    async def event_generator():
        full_content = ""
        yield f"data: {json.dumps({'type': 'start', 'message_id': assistant_msg_id})}\n\n"

        try:
            async for chunk in stream_chat(
                model=model_name,
                api_key=api_key,
                api_base=api_base,
                messages=llm_messages,
            ):
                full_content += chunk
                yield f"data: {json.dumps({'type': 'delta', 'content': chunk})}\n\n"

            async with async_session() as save_db:
                assistant_msg = Message(
                    id=assistant_msg_id,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_content,
                )
                save_db.add(assistant_msg)
                await save_db.commit()

            yield f"data: {json.dumps({'type': 'done', 'message_id': assistant_msg_id})}\n\n"

        except Exception as e:
            error_msg = str(e)
            yield f"data: {json.dumps({'type': 'error', 'message': f'API 调用失败: {error_msg}'})}\n\n"

    return _make_streaming_response(event_generator)


@router.delete("/{conversation_id}/messages/{message_id}")
async def delete_message(
    conversation_id: str,
    message_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除一条消息及其配对的问/答消息。

    - 删除 user 消息时，同时删除紧跟其后的 assistant 回复
    - 删除 assistant 消息时，同时删除其对应的上一条 user 提问
    """
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg_result = await db.execute(
        select(Message).where(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
        )
    )
    target_msg = msg_result.scalar_one_or_none()
    if not target_msg:
        raise HTTPException(status_code=404, detail="Message not found")

    # 加载同一对话的所有消息，按时间排序
    all_msgs_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )
    all_msgs = list(all_msgs_result.scalars().all())

    # 找到目标消息在列表中的索引
    target_idx = next(
        (i for i, m in enumerate(all_msgs) if m.id == message_id), None
    )
    if target_idx is None:
        raise HTTPException(status_code=404, detail="Message not found")

    ids_to_delete = [message_id]

    if target_msg.role == "user":
        # 删除 user 消息时，同时删除紧跟其后的 assistant 回复
        if target_idx + 1 < len(all_msgs) and all_msgs[target_idx + 1].role == "assistant":
            ids_to_delete.append(all_msgs[target_idx + 1].id)
    elif target_msg.role == "assistant":
        # 删除 assistant 消息时，同时删除其对应的上一条 user 提问
        if target_idx - 1 >= 0 and all_msgs[target_idx - 1].role == "user":
            ids_to_delete.append(all_msgs[target_idx - 1].id)

    await db.execute(
        delete(Message).where(Message.id.in_(ids_to_delete))
    )

    conv.updated_at = datetime.utcnow()
    await db.commit()

    return JSONResponse({"deleted_ids": ids_to_delete})


@router.post("/{conversation_id}/edit")
async def edit_message(
    conversation_id: str,
    data: MessageEdit,
    db: AsyncSession = Depends(get_db),
):
    """编辑用户消息，删除该消息之后的所有消息，然后重新调用 LLM。"""
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg_result = await db.execute(
        select(Message).where(
            Message.id == data.message_id,
            Message.conversation_id == conversation_id,
            Message.role == "user",
        )
    )
    target_msg = msg_result.scalar_one_or_none()
    if not target_msg:
        raise HTTPException(status_code=404, detail="Message not found")

    target_msg.content = data.content

    await db.execute(
        delete(Message).where(
            Message.conversation_id == conversation_id,
            Message.created_at > target_msg.created_at,
        )
    )

    conv.updated_at = datetime.utcnow()
    await db.commit()

    agent_result = await db.execute(select(Agent).where(Agent.id == conv.agent_id))
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    settings = await _get_settings(db)
    context_window = int(settings.get("context_window_size", "20"))
    stream_enabled = settings.get("stream_enabled", "true") == "true"
    default_model = settings.get("default_model", "openai/qwen-turbo-2024-11-01")
    providers = _parse_json_setting(settings.get("llm_providers", "{}"), {})

    model_name = conv.model_name or default_model
    api_key, api_base = _resolve_provider(model_name, providers)

    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="未配置 API Key，请前往设置页面配置"
        )

    # ========== 主助手路由模式 ==========
    if conv.agent_id == "ielts-copilot":
        user_content = await _enrich_user_content_from_attachments(target_msg, db)
        return await _handle_copilot_routed(
            conversation_id=conversation_id,
            user_msg_id=target_msg.id,
            user_content=user_content,
            model_name=model_name,
            api_key=api_key,
            api_base=api_base,
            stream_enabled=stream_enabled,
            context_window=context_window,
        )

    # ========== 普通子助手模式 ==========
    history_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(desc(Message.created_at))
        .limit(context_window)
    )
    history_msgs = list(reversed(history_result.scalars().all()))

    llm_messages = [{"role": "system", "content": agent.system_prompt}]
    for msg in history_msgs:
        if msg.role == "assistant":
            llm_messages.append({"role": "assistant", "content": msg.content})
        elif msg.role == "user":
            msg_content = await _enrich_user_content_from_attachments(msg, db)
            llm_messages.append({"role": "user", "content": msg_content})

    edit_assistant_msg_id = str(uuid.uuid4())

    if not stream_enabled:
        try:
            full_content = await complete_chat(
                model=model_name,
                api_key=api_key,
                api_base=api_base,
                messages=llm_messages,
            )
            async with async_session() as save_db:
                assistant_msg = Message(
                    id=edit_assistant_msg_id,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_content,
                )
                save_db.add(assistant_msg)
                await save_db.commit()
            return JSONResponse({
                "id": edit_assistant_msg_id,
                "conversation_id": conversation_id,
                "role": "assistant",
                "content": full_content,
            })
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"API 调用失败: {e}")

    async def edit_event_generator():
        full_content = ""
        yield f"data: {json.dumps({'type': 'start', 'message_id': edit_assistant_msg_id})}\n\n"

        try:
            async for chunk in stream_chat(
                model=model_name,
                api_key=api_key,
                api_base=api_base,
                messages=llm_messages,
            ):
                full_content += chunk
                yield f"data: {json.dumps({'type': 'delta', 'content': chunk})}\n\n"

            async with async_session() as save_db:
                assistant_msg = Message(
                    id=edit_assistant_msg_id,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_content,
                )
                save_db.add(assistant_msg)
                await save_db.commit()

            yield f"data: {json.dumps({'type': 'done', 'message_id': edit_assistant_msg_id})}\n\n"

        except Exception as e:
            error_msg = str(e)
            yield f"data: {json.dumps({'type': 'error', 'message': f'API 调用失败: {error_msg}'})}\n\n"

    return _make_streaming_response(edit_event_generator)


# ==================== 主助手路由模式 ====================

AGENT_NAME_MAP = {
    "writing-assistant": ("✍️", "写作笔记整理"),
    "writing-coach": ("📝", "写作辅导"),
    "speaking-assistant": ("🎤", "口语优化"),
    "speaking-feedback": ("📋", "口语反馈整理"),
    "reading-assistant": ("📖", "阅读分析"),
    "listening-assistant": ("🎧", "听力分析"),
}


async def _handle_copilot_routed(
    conversation_id: str,
    user_msg_id: str,
    user_content: str,
    model_name: str,
    api_key: str,
    api_base: str | None,
    stream_enabled: bool,
    context_window: int,
):
    """主助手路由模式：两步调用（意图识别 → 子助手回答）。"""
    async with async_session() as db:
        # --- 第一步：收集路由所需信息 ---

        # 获取最近 5 条消息用于意图识别
        recent_result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(desc(Message.created_at))
            .limit(5)
        )
        recent_msgs = list(reversed(recent_result.scalars().all()))

        recent_for_router = []
        for msg in recent_msgs:
            if msg.role in ("user", "assistant"):
                # 截断过长内容，路由只需要概要
                content = msg.content[:500] + ("..." if len(msg.content) > 500 else "")
                recent_for_router.append({"role": msg.role, "content": content})

        # 获取已有材料标题
        materials = await get_materials(db, conversation_id)
        material_titles = [m.title for m in materials]

        # 快速检查：如果上一条 assistant 消息有 routed_agent_id，
        # 且用户消息很短（可能是追问），可以直接沿用上一轮的 agent
        last_assistant = None
        for msg in reversed(recent_msgs):
            if msg.role == "assistant" and msg.routed_agent_id:
                last_assistant = msg
                break

        # --- 第二步：意图识别 ---
        route_result = await identify_route(
            model=model_name,
            api_key=api_key,
            api_base=api_base,
            user_content=user_content[:800],  # 路由只需要前800字
            recent_messages=recent_for_router,
            material_titles=material_titles,
        )

        # 如果路由判断是追问且有上一轮 agent_id，优先使用上一轮的
        if route_result.is_followup and last_assistant and last_assistant.routed_agent_id:
            route_result.agent_id = last_assistant.routed_agent_id

        # --- 第三步：保存关键材料（如果有） ---
        if route_result.has_key_material and route_result.material_title:
            await save_material(
                db=db,
                conversation_id=conversation_id,
                title=route_result.material_title,
                content=user_content,  # 保存完整用户消息作为材料
                material_type=route_result.material_type or "other",
                source_message_id=user_msg_id,
            )
            await db.commit()

        # --- 第四步：获取子 Agent ---
        sub_agent_result = await db.execute(
            select(Agent).where(Agent.id == route_result.agent_id)
        )
        sub_agent = sub_agent_result.scalar_one_or_none()
        if not sub_agent:
            # fallback: 如果子 Agent 不存在，使用 writing-coach
            sub_agent_result = await db.execute(
                select(Agent).where(Agent.id == "writing-coach")
            )
            sub_agent = sub_agent_result.scalar_one_or_none()

        if not sub_agent:
            raise HTTPException(status_code=500, detail="子助手配置异常")

        # --- 第五步：构建子 Agent 的消息列表 ---
        llm_messages = await build_routed_messages(
            db=db,
            conversation_id=conversation_id,
            sub_agent=sub_agent,
            route_result=route_result,
            user_content=user_content,
            recent_count=context_window,
        )

    # --- 第六步：调用子 Agent 回答 ---
    routed_agent_id = route_result.agent_id
    agent_info = AGENT_NAME_MAP.get(routed_agent_id, ("🤖", "助手"))
    agent_icon, agent_label = agent_info

    assistant_msg_id = str(uuid.uuid4())

    # SSE 起始事件中附带路由信息
    start_payload = {
        "type": "start",
        "message_id": assistant_msg_id,
        "user_message_id": user_msg_id,
        "routed_agent_id": routed_agent_id,
        "routed_agent_icon": agent_icon,
        "routed_agent_name": agent_label,
    }

    if not stream_enabled:
        try:
            full_content = await complete_chat(
                model=model_name,
                api_key=api_key,
                api_base=api_base,
                messages=llm_messages,
            )
            async with async_session() as save_db:
                assistant_msg = Message(
                    id=assistant_msg_id,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_content,
                    routed_agent_id=routed_agent_id,
                )
                save_db.add(assistant_msg)
                await save_db.commit()
            return JSONResponse({
                "id": assistant_msg_id,
                "conversation_id": conversation_id,
                "role": "assistant",
                "content": full_content,
                "user_message_id": user_msg_id,
                "routed_agent_id": routed_agent_id,
                "routed_agent_icon": agent_icon,
                "routed_agent_name": agent_label,
            })
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"API 调用失败: {e}")

    async def copilot_event_generator():
        full_content = ""
        yield f"data: {json.dumps(start_payload)}\n\n"

        try:
            async for chunk in stream_chat(
                model=model_name,
                api_key=api_key,
                api_base=api_base,
                messages=llm_messages,
            ):
                full_content += chunk
                yield f"data: {json.dumps({'type': 'delta', 'content': chunk})}\n\n"

            async with async_session() as save_db:
                assistant_msg = Message(
                    id=assistant_msg_id,
                    conversation_id=conversation_id,
                    role="assistant",
                    content=full_content,
                    routed_agent_id=routed_agent_id,
                )
                save_db.add(assistant_msg)
                await save_db.commit()

            yield f"data: {json.dumps({'type': 'done', 'message_id': assistant_msg_id})}\n\n"

        except Exception as e:
            error_msg = str(e)
            yield f"data: {json.dumps({'type': 'error', 'message': f'API 调用失败: {error_msg}'})}\n\n"

    return _make_streaming_response(copilot_event_generator)
