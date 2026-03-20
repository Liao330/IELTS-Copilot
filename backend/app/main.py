from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.database import init_db, async_session
from app.models.agent import Agent
from app.models.setting import Setting
from app.prompts.writing_assistant import WRITING_ASSISTANT_PROMPT, WRITING_ASSISTANT_WELCOME
from app.prompts.writing_coach import WRITING_COACH_PROMPT, WRITING_COACH_WELCOME
from app.prompts.speaking_assistant import SPEAKING_ASSISTANT_PROMPT, SPEAKING_ASSISTANT_WELCOME
from app.prompts.speaking_feedback import SPEAKING_FEEDBACK_PROMPT, SPEAKING_FEEDBACK_WELCOME
from app.prompts.reading_assistant import READING_ASSISTANT_PROMPT, READING_ASSISTANT_WELCOME
from app.prompts.listening_assistant import LISTENING_ASSISTANT_PROMPT, LISTENING_ASSISTANT_WELCOME
from app.prompts.copilot_router import COPILOT_ROUTER_PROMPT, COPILOT_WELCOME
from app.routers import agents, conversations, messages, files, notes, settings, homeworks, vocabulary, reports, study_plan


async def seed_data():
    async with async_session() as db:
        # 主助手 — IELTS Copilot 统一入口
        result = await db.execute(select(Agent).where(Agent.id == "ielts-copilot"))
        copilot_agent = result.scalar_one_or_none()
        if not copilot_agent:
            db.add(Agent(
                id="ielts-copilot",
                name="IELTS Copilot",
                description="智能雅思全能助手，自动识别你的需求并调用最合适的专项助手",
                icon="🎓",
                system_prompt=COPILOT_ROUTER_PROMPT,
                welcome_message=COPILOT_WELCOME,
                is_active=True,
                sort_order=-1,  # 排在所有子助手前面
            ))
        else:
            copilot_agent.system_prompt = COPILOT_ROUTER_PROMPT
            copilot_agent.welcome_message = COPILOT_WELCOME
            copilot_agent.description = "智能雅思全能助手，自动识别你的需求并调用最合适的专项助手"

        result = await db.execute(select(Agent).where(Agent.id == "writing-assistant"))
        writing_agent = result.scalar_one_or_none()
        if not writing_agent:
            db.add(Agent(
                id="writing-assistant",
                name="写作助手",
                description="整理作文反馈笔记，拆分针对性内容和通用积累内容",
                icon="✍️",
                system_prompt=WRITING_ASSISTANT_PROMPT,
                welcome_message=WRITING_ASSISTANT_WELCOME,
                is_active=True,
                sort_order=0,
            ))
        else:
            writing_agent.system_prompt = WRITING_ASSISTANT_PROMPT
            writing_agent.description = "整理作文反馈笔记，拆分针对性内容和通用积累内容"

        result = await db.execute(select(Agent).where(Agent.id == "writing-coach"))
        writing_coach = result.scalar_one_or_none()
        if not writing_coach:
            db.add(Agent(
                id="writing-coach",
                name="写作辅导",
                description="协助写作全过程：审题构思、框架搭建、逐段批改、表达升级",
                icon="📝",
                system_prompt=WRITING_COACH_PROMPT,
                welcome_message=WRITING_COACH_WELCOME,
                is_active=True,
                sort_order=1,
            ))
        else:
            writing_coach.system_prompt = WRITING_COACH_PROMPT
            writing_coach.description = "协助写作全过程：审题构思、框架搭建、逐段批改、表达升级"

        result = await db.execute(select(Agent).where(Agent.id == "speaking-assistant"))
        speaking_agent = result.scalar_one_or_none()
        if not speaking_agent:
            db.add(Agent(
                id="speaking-assistant",
                name="口语助手",
                description="帮你修改、优化、整理雅思口语答案，支持 Part1/Part2/Part3",
                icon="🎤",
                system_prompt=SPEAKING_ASSISTANT_PROMPT,
                welcome_message=SPEAKING_ASSISTANT_WELCOME,
                is_active=True,
                sort_order=2,
            ))
        else:
            speaking_agent.system_prompt = SPEAKING_ASSISTANT_PROMPT
            speaking_agent.description = "帮你修改、优化、整理雅思口语答案，支持 Part1/Part2/Part3"

        result = await db.execute(select(Agent).where(Agent.id == "speaking-feedback"))
        speaking_fb = result.scalar_one_or_none()
        if not speaking_fb:
            db.add(Agent(
                id="speaking-feedback",
                name="口语反馈整理",
                description="根据老师反馈整理口语改进笔记，分类归档问题，生成行动清单",
                icon="📋",
                system_prompt=SPEAKING_FEEDBACK_PROMPT,
                welcome_message=SPEAKING_FEEDBACK_WELCOME,
                is_active=True,
                sort_order=3,
            ))
        else:
            speaking_fb.system_prompt = SPEAKING_FEEDBACK_PROMPT
            speaking_fb.description = "根据老师反馈整理口语改进笔记，分类归档问题，生成行动清单"

        result = await db.execute(select(Agent).where(Agent.id == "reading-assistant"))
        reading_agent = result.scalar_one_or_none()
        if not reading_agent:
            db.add(Agent(
                id="reading-assistant",
                name="阅读助手",
                description="解析阅读题型技巧，精读长难句，整理同义替换",
                icon="📖",
                system_prompt=READING_ASSISTANT_PROMPT,
                welcome_message=READING_ASSISTANT_WELCOME,
                is_active=True,
                sort_order=4,
            ))
        else:
            reading_agent.system_prompt = READING_ASSISTANT_PROMPT
            reading_agent.description = "解析阅读题型技巧，精读长难句，整理同义替换"

        result = await db.execute(select(Agent).where(Agent.id == "listening-assistant"))
        listening_agent = result.scalar_one_or_none()
        if not listening_agent:
            db.add(Agent(
                id="listening-assistant",
                name="听力助手",
                description="听力题型攻略，场景词汇整理，错题精准分析",
                icon="🎧",
                system_prompt=LISTENING_ASSISTANT_PROMPT,
                welcome_message=LISTENING_ASSISTANT_WELCOME,
                is_active=True,
                sort_order=5,
            ))
        else:
            listening_agent.system_prompt = LISTENING_ASSISTANT_PROMPT
            listening_agent.description = "听力题型攻略，场景词汇整理，错题精准分析"

        for key, value in [
            ("context_window_size", "20"),
            ("stream_enabled", "true"),
            ("default_model", "openai/qwen-turbo-2024-11-01"),
            ("llm_providers", json.dumps({
                "openai": {
                    "name": "千问 (阿里云百炼)",
                    "api_key": "",
                    "api_base": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                    "models": [
                        "qwen-turbo-2024-11-01",
                        "qwen-plus",
                        "qwen-turbo",
                        "qwen-max",
                        "qwen-long",
                        "qwq-plus"
                    ]
                },
                "deepseek": {
                    "name": "DeepSeek",
                    "api_key": "",
                    "api_base": "https://api.deepseek.com",
                    "models": ["deepseek-chat", "deepseek-reasoner"]
                }
            })),
        ]:
            existing = await db.execute(select(Setting).where(Setting.key == key))
            if not existing.scalar_one_or_none():
                db.add(Setting(key=key, value=value))

        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_data()
    yield


app = FastAPI(title="IELTS Copilot API", version="1.0.0", lifespan=lifespan)

_cors_origins = [
    "http://localhost:3000",
]
# 云端部署时，Nginx 反向代理会通过同源访问，但也允许外部 IP 直连
_extra_origins = os.environ.get("CORS_ORIGINS", "")
if _extra_origins:
    _cors_origins.extend([o.strip() for o in _extra_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents.router)
app.include_router(conversations.router)
app.include_router(messages.router)
app.include_router(files.router)
app.include_router(notes.router)
app.include_router(settings.router)
app.include_router(homeworks.router)
app.include_router(vocabulary.router)
app.include_router(reports.router)
app.include_router(study_plan.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
