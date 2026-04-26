from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.setting import Setting


async def get_llm_config(db: AsyncSession) -> tuple[str, str | None, str | None]:
    """从设置读取默认 LLM 配置，返回 (model_name, api_key, api_base)。

    未配置 api_key 时会尝试 fallback 到任意已填 api_key 的 provider。
    """
    result = await db.execute(select(Setting))
    settings = {s.key: s.value for s in result.scalars().all()}

    default_model = settings.get("default_model", "openai/qwen-turbo-2024-11-01")
    providers = json.loads(settings.get("llm_providers", "{}"))

    provider_key = default_model.split("/")[0] if "/" in default_model else default_model
    api_key = None
    api_base = None

    if provider_key in providers:
        api_key = providers[provider_key].get("api_key")
        api_base = providers[provider_key].get("api_base")

    if not api_key:
        for prov_config in providers.values():
            if prov_config.get("api_key"):
                api_key = prov_config["api_key"]
                api_base = prov_config.get("api_base")
                break

    return default_model, api_key, api_base
