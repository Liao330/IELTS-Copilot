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
