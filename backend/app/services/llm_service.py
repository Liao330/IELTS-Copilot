from __future__ import annotations

import json
from typing import AsyncGenerator

import litellm

litellm.drop_params = True


def _handle_llm_error(e: Exception) -> Exception:
    error_str = str(e)
    if "Arrearage" in error_str or "overdue" in error_str.lower():
        return Exception(
            "阿里云百炼账户欠费或未开通，请前往 https://bailian.console.aliyun.com 检查账户状态并充值/开通服务"
        )
    if "Access denied" in error_str:
        return Exception(
            "API 访问被拒绝，请检查：1) API Key 是否正确 2) 账户是否正常 3) 模型是否已开通"
        )
    if "invalid api key" in error_str.lower() or "authentication" in error_str.lower():
        return Exception("API Key 无效，请前往设置页面检查配置")
    return e


async def stream_chat(
    model: str,
    api_key: str,
    api_base: str | None,
    messages: list[dict],
    temperature: float = 0.3,
) -> AsyncGenerator[str, None]:
    try:
        response = await litellm.acompletion(
            model=model,
            api_key=api_key,
            api_base=api_base,
            messages=messages,
            stream=True,
            temperature=temperature,
        )
        async for chunk in response:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content
    except Exception as e:
        raise _handle_llm_error(e) from e


async def complete_chat(
    model: str,
    api_key: str,
    api_base: str | None,
    messages: list[dict],
    temperature: float = 0.3,
) -> str:
    try:
        response = await litellm.acompletion(
            model=model,
            api_key=api_key,
            api_base=api_base,
            messages=messages,
            stream=False,
            temperature=temperature,
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        raise _handle_llm_error(e) from e
