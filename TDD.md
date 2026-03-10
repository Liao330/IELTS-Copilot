# IELTS Copilot - 技术设计文档（TDD）

## 1. 整体架构

### 1.1 架构图

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Agent    │ │ Chat     │ │ Notes    │ │ Settings │       │
│  │ Selector │ │ Interface│ │ Manager  │ │ Panel    │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       └─────────────┴────────────┴─────────────┘             │
│                         │ HTTP / SSE                         │
└─────────────────────────┼────────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────────┐
│                     Backend (FastAPI)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ API      │ │ Agent    │ │ File     │ │ Note     │       │
│  │ Router   │ │ Engine   │ │ Service  │ │ Service  │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       │             │            │             │             │
│  ┌────┴─────┐ ┌─────┴────┐ ┌────┴─────┐                    │
│  │ Prompt   │ │ LLM      │ │ File     │                    │
│  │ Manager  │ │ Adapter  │ │ Parser   │                    │
│  └──────────┘ └──────────┘ └──────────┘                     │
│                     │                                        │
└─────────────────────┼────────────────────────────────────────┘
                      │
┌─────────────────────┼────────────────────────────────────────┐
│                 Storage Layer                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ SQLite       │  │ Local File   │  │ LLM APIs     │       │
│  │ (对话/笔记/   │  │ Storage      │  │ (千问/DS/    │       │
│  │  设置)       │  │ (上传文件)    │  │  Claude/GPT) │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 技术选型

| 层级 | 技术 | 版本 | 理由 |
|------|------|------|------|
| **前端框架** | Next.js (React) | 14+ (App Router) | SSR/SSG 灵活，生态成熟，远期可部署 Vercel |
| **前端 UI** | TailwindCSS + shadcn/ui | 最新 | 开发效率高，组件美观，高度可定制 |
| **前端状态** | Zustand | 最新 | 轻量、简洁，适合中小型项目 |
| **Markdown 渲染** | react-markdown + remark-gfm | 最新 | 支持 GFM 表格、代码高亮等 |
| **后端框架** | Python FastAPI | 0.100+ | 异步原生支持，自动 API 文档，类型安全 |
| **ORM** | SQLAlchemy 2.0 + Alembic | 最新 | 成熟稳定，支持异步，数据库迁移方便 |
| **数据库** | SQLite | 3 | 零配置，文件即数据库，个人使用足够 |
| **LLM 调用** | LiteLLM | 最新 | 统一接口兼容 100+ 模型（千问/DS/Claude/GPT/Gemini/豆包） |
| **文件解析** | python-docx, PyPDF2, Pillow | 最新 | 解析 Word/PDF/图片 |
| **流式输出** | SSE (Server-Sent Events) | - | 实现打字机效果，浏览器原生支持 |

### 1.3 为什么选择前后端分离

- **灵活性**：前端可独立迭代 UI，后端专注业务逻辑
- **远期可扩展**：会员制上线后，后端可独立部署和扩容
- **技术生态**：Next.js 生态提供丰富的 UI 组件和部署方案
- **开发效率**：前后端可并行开发

---

## 2. 项目目录结构

```
ielts-copilot/
├── frontend/                          # Next.js 前端
│   ├── app/                           # App Router 页面
│   │   ├── layout.tsx                 # 根布局
│   │   ├── page.tsx                   # 首页（Agent 选择）
│   │   ├── chat/
│   │   │   └── [conversationId]/
│   │   │       └── page.tsx           # 对话页
│   │   ├── notes/
│   │   │   └── page.tsx               # 笔记管理
│   │   └── settings/
│   │       └── page.tsx               # 设置页
│   ├── components/                    # 通用组件
│   │   ├── ui/                        # shadcn/ui 基础组件
│   │   ├── chat/                      # 对话相关组件
│   │   │   ├── ChatMessage.tsx        # 单条消息
│   │   │   ├── ChatInput.tsx          # 输入框+上传
│   │   │   ├── ChatSidebar.tsx        # 对话历史侧边栏
│   │   │   └── MarkdownRenderer.tsx   # Markdown 渲染
│   │   ├── agent/                     # Agent 相关组件
│   │   │   └── AgentCard.tsx          # Agent 选择卡片
│   │   ├── notes/                     # 笔记相关组件
│   │   │   ├── NoteCard.tsx
│   │   │   └── NoteEditor.tsx
│   │   └── layout/                    # 布局组件
│   │       ├── Header.tsx
│   │       └── Sidebar.tsx
│   ├── lib/                           # 工具函数
│   │   ├── api.ts                     # API 请求封装
│   │   └── sse.ts                     # SSE 流式处理
│   ├── stores/                        # 状态管理
│   │   ├── chatStore.ts
│   │   ├── noteStore.ts
│   │   └── settingStore.ts
│   ├── types/                         # TypeScript 类型定义
│   │   └── index.ts
│   ├── package.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── backend/                           # Python FastAPI 后端
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # FastAPI 入口
│   │   ├── config.py                  # 配置管理
│   │   ├── database.py                # 数据库初始化
│   │   ├── routers/                   # API 路由
│   │   │   ├── __init__.py
│   │   │   ├── agents.py             # Agent CRUD
│   │   │   ├── conversations.py      # 对话管理
│   │   │   ├── messages.py           # 消息收发 (SSE)
│   │   │   ├── files.py             # 文件上传
│   │   │   ├── notes.py             # 笔记管理
│   │   │   └── settings.py          # 设置管理
│   │   ├── models/                   # SQLAlchemy 模型
│   │   │   ├── __init__.py
│   │   │   ├── agent.py
│   │   │   ├── conversation.py
│   │   │   ├── message.py
│   │   │   ├── note.py
│   │   │   ├── file.py
│   │   │   └── setting.py
│   │   ├── schemas/                  # Pydantic 请求/响应模型
│   │   │   ├── __init__.py
│   │   │   ├── agent.py
│   │   │   ├── conversation.py
│   │   │   ├── message.py
│   │   │   ├── note.py
│   │   │   └── setting.py
│   │   ├── services/                 # 业务逻辑
│   │   │   ├── __init__.py
│   │   │   ├── agent_service.py
│   │   │   ├── llm_service.py       # LLM 调用（LiteLLM）
│   │   │   ├── file_service.py      # 文件解析
│   │   │   └── note_service.py
│   │   ├── prompts/                  # Agent Prompt 定义
│   │   │   ├── writing_assistant.py
│   │   │   └── speaking_assistant.py
│   │   └── utils/                    # 工具函数
│   │       ├── __init__.py
│   │       └── file_parser.py        # 文件内容提取
│   ├── alembic/                      # 数据库迁移
│   │   └── versions/
│   ├── alembic.ini
│   ├── data/                         # 运行时数据（gitignore）
│   │   ├── ielts_copilot.db         # SQLite 数据库文件
│   │   └── uploads/                 # 上传文件存储
│   ├── requirements.txt
│   └── pyproject.toml
│
├── .env.example                      # 环境变量模板
├── .gitignore
└── docker-compose.yml                # （远期）容器化部署
```

---

## 3. 数据模型设计

### 3.1 ER 图

```
Agent 1──N Conversation 1──N Message
                              │
                              │ (可选来源)
                              ▼
                            Note N──N Tag

File (独立存储，通过 message.attachments JSON 引用)

Setting (KV 存储)
```

### 3.2 表结构

#### agents 表
```sql
CREATE TABLE agents (
    id          TEXT PRIMARY KEY,           -- UUID
    name        TEXT NOT NULL,              -- Agent 名称
    description TEXT,                       -- 描述
    icon        TEXT,                       -- 图标 emoji
    system_prompt TEXT NOT NULL,            -- System Prompt
    is_active   BOOLEAN DEFAULT TRUE,      -- 是否启用
    sort_order  INTEGER DEFAULT 0,         -- 排序
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### conversations 表
```sql
CREATE TABLE conversations (
    id          TEXT PRIMARY KEY,
    agent_id    TEXT NOT NULL REFERENCES agents(id),
    title       TEXT,                       -- 自动生成或手动修改
    model_name  TEXT,                       -- 使用的模型名称
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### messages 表
```sql
CREATE TABLE messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content         TEXT NOT NULL,
    attachments     TEXT,                   -- JSON: [{file_id, filename, mime_type}]
    token_count     INTEGER,               -- token 用量统计
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### notes 表
```sql
CREATE TABLE notes (
    id                      TEXT PRIMARY KEY,
    title                   TEXT NOT NULL,
    content                 TEXT NOT NULL,
    category                TEXT NOT NULL CHECK(category IN ('writing', 'speaking', 'reading', 'listening', 'general')),
    tags                    TEXT,           -- JSON: ["tag1", "tag2"]
    source_conversation_id  TEXT REFERENCES conversations(id),
    source_message_id       TEXT REFERENCES messages(id),
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### files 表
```sql
CREATE TABLE files (
    id          TEXT PRIMARY KEY,
    filename    TEXT NOT NULL,              -- 原始文件名
    filepath    TEXT NOT NULL,              -- 存储路径
    mime_type   TEXT NOT NULL,
    size        INTEGER NOT NULL,           -- 字节
    text_content TEXT,                      -- 提取的文本内容（如有）
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### settings 表
```sql
CREATE TABLE settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,              -- JSON 序列化的值
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 预置 key: llm_providers, default_model, context_window_size, stream_enabled
```

---

## 4. API 详细设计

### 4.1 Agent 相关

#### GET /api/agents
获取所有启用的 Agent 列表。

**Response 200:**
```json
{
  "agents": [
    {
      "id": "writing-assistant",
      "name": "写作助手",
      "description": "整合作文原文、AI批改报告、老师点评...",
      "icon": "✍️",
      "is_active": true
    }
  ]
}
```

#### GET /api/agents/{agent_id}
获取单个 Agent 详情（含 system_prompt 预览）。

### 4.2 对话相关

#### POST /api/conversations
创建新对话。

**Request:**
```json
{
  "agent_id": "writing-assistant",
  "model_name": "qwen-plus"  // 可选，不传则用默认模型
}
```

**Response 201:**
```json
{
  "id": "conv-uuid",
  "agent_id": "writing-assistant",
  "title": "新对话",
  "model_name": "qwen-plus",
  "created_at": "2025-01-01T00:00:00Z"
}
```

#### GET /api/conversations
获取对话列表（分页）。

**Query Params:** `page=1&page_size=20&agent_id=writing-assistant`（agent_id 可选筛选）

**Response 200:**
```json
{
  "conversations": [...],
  "total": 50,
  "page": 1,
  "page_size": 20
}
```

#### GET /api/conversations/{conversation_id}
获取对话详情，含所有消息。

#### DELETE /api/conversations/{conversation_id}
删除对话及关联消息。

#### PATCH /api/conversations/{conversation_id}
更新对话信息（如修改标题）。

**Request:**
```json
{
  "title": "澳洲移民小作文复盘"
}
```

### 4.3 消息相关（核心）

#### POST /api/conversations/{conversation_id}/messages
发送消息并获取 Agent 流式回复。

**Request:**
```json
{
  "content": "这是我的作文原文...",
  "attachments": ["file-uuid-1", "file-uuid-2"]
}
```

**Response: SSE Stream (text/event-stream)**
```
data: {"type": "start", "message_id": "msg-uuid"}

data: {"type": "delta", "content": "# 作文"}

data: {"type": "delta", "content": "文档专属内容"}

data: {"type": "done", "message_id": "msg-uuid", "token_count": 1234}

data: {"type": "error", "message": "API 调用失败: ..."}
```

**SSE 事件类型说明:**
| type | 说明 |
|------|------|
| `start` | 开始回复，返回 message_id |
| `delta` | 增量文本内容 |
| `done` | 回复完成，附带 token 统计 |
| `error` | 错误信息 |

### 4.4 文件相关

#### POST /api/files/upload
上传文件。

**Request:** `multipart/form-data`, field: `file`

**Response 201:**
```json
{
  "id": "file-uuid",
  "filename": "作文原文.docx",
  "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "size": 12345,
  "text_content": "提取的文本内容...(如有)"
}
```

### 4.5 笔记相关

#### GET /api/notes
获取笔记列表。

**Query Params:** `category=writing&search=趋势&page=1&page_size=20`

#### POST /api/notes
创建笔记。

**Request:**
```json
{
  "title": "趋势描述万能模板",
  "content": "...(Markdown)",
  "category": "general",
  "tags": ["小作文", "数据描述"],
  "source_conversation_id": "conv-uuid",
  "source_message_id": "msg-uuid"
}
```

#### PUT /api/notes/{note_id}
更新笔记。

#### DELETE /api/notes/{note_id}
删除笔记。

### 4.6 设置相关

#### GET /api/settings
获取所有设置。

**Response 200:**
```json
{
  "llm_providers": {
    "qwen": {
      "api_key": "sk-***",
      "api_base": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "models": ["qwen-plus", "qwen-turbo", "qwen-max"]
    },
    "deepseek": {
      "api_key": "sk-***",
      "api_base": "https://api.deepseek.com/v1",
      "models": ["deepseek-chat", "deepseek-reasoner"]
    }
  },
  "default_model": "qwen/qwen-plus",
  "context_window_size": 20,
  "stream_enabled": true
}
```

#### PUT /api/settings
更新设置（部分更新）。

---

## 5. 核心流程设计

### 5.1 消息发送与流式响应流程

```
用户输入消息 + 附件
       │
       ▼
前端发送 POST /api/conversations/{id}/messages
       │
       ▼
后端接收请求
       │
       ├── 1. 保存用户消息到 messages 表
       │
       ├── 2. 查询该对话的 agent，获取 system_prompt
       │
       ├── 3. 加载最近 N 条历史消息（context_window_size）
       │
       ├── 4. 如有附件，从 files 表查询并加载 text_content
       │
       ├── 5. 组装 LLM 请求：
       │      [system_prompt, ...history_messages, current_message(+attachments)]
       │
       ├── 6. 通过 LiteLLM 调用对应模型（流式）
       │
       ├── 7. SSE 逐 token 推送给前端
       │
       └── 8. 流式结束后，保存完整 assistant 消息到 messages 表
```

### 5.2 文件处理流程

```
用户选择文件上传
       │
       ▼
前端 POST /api/files/upload (multipart/form-data)
       │
       ▼
后端接收文件
       │
       ├── 1. 校验文件类型和大小
       │
       ├── 2. 生成 UUID，保存文件到 data/uploads/
       │
       ├── 3. 根据 MIME 类型提取文本内容：
       │      ├── .txt → 直接读取
       │      ├── .docx → python-docx 提取
       │      ├── .pdf → PyPDF2 提取
       │      └── 图片 → 不提取文本，保留为 base64（供多模态模型）
       │
       ├── 4. 保存文件记录到 files 表
       │
       └── 5. 返回 file_id 给前端
```

### 5.3 LLM 适配层设计

使用 LiteLLM 统一接口，支持以下模型提供商：

| 提供商 | LiteLLM 模型名格式 | API Base |
|--------|-------------------|----------|
| 千问 (阿里) | `openai/qwen-plus` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| DeepSeek | `deepseek/deepseek-chat` | `https://api.deepseek.com` |
| Claude | `claude-3-5-sonnet-20241022` | 默认 |
| GPT | `gpt-4o` | 默认 |
| Gemini | `gemini/gemini-pro` | 默认 |
| 豆包 (字节) | `openai/doubao-pro-32k` | `https://ark.cn-beijing.volces.com/api/v3` |

**调用封装（伪代码）：**
```python
import litellm

async def stream_chat(model: str, api_key: str, api_base: str | None, messages: list):
    response = await litellm.acompletion(
        model=model,
        api_key=api_key,
        api_base=api_base,
        messages=messages,
        stream=True,
    )
    async for chunk in response:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
```

---

## 6. 开发计划

### 6.1 V1.0 开发阶段（预计 2-3 周）

| 阶段 | 任务 | 预计时间 |
|------|------|---------|
| **Phase 1: 后端基础** | 项目初始化、数据库模型、Agent/对话/消息 CRUD API | 3天 |
| **Phase 2: LLM 集成** | LiteLLM 集成、SSE 流式输出、模型切换 | 2天 |
| **Phase 3: 文件处理** | 文件上传、内容提取（PDF/DOCX/TXT/图片）| 2天 |
| **Phase 4: 前端基础** | Next.js 项目初始化、路由、布局、Agent 选择页 | 2天 |
| **Phase 5: 对话界面** | 对话组件、Markdown 渲染、流式显示、文件上传 UI | 3天 |
| **Phase 6: 设置与联调** | 设置页、前后端联调、Bug 修复 | 2天 |

### 6.2 本地运行方式

```bash
# 后端
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
npm install
npm run dev    # localhost:3000
```

### 6.3 远期部署方案
- **前端**：Vercel / Cloudflare Pages
- **后端**：Docker + Railway / Fly.io / 自有服务器
- **数据库**：升级为 PostgreSQL（多用户场景）
- **文件存储**：迁移至 S3/R2 对象存储

---

## 7. 安全考虑

| 项目 | 方案 |
|------|------|
| API Key 存储 | SQLite 中加密存储（使用 cryptography 库 Fernet 加密）；V1 可简化为 base64 编码 |
| CORS | 仅允许 `localhost:3000` 访问（V1 本地运行） |
| 文件上传 | 校验 MIME 类型白名单、文件大小限制 10MB |
| 输入校验 | Pydantic 严格类型校验所有请求参数 |
| SQL 注入 | 全程使用 SQLAlchemy ORM，禁止原始 SQL 拼接 |
