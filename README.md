# 🎓 IELTS Copilot

你的 AI 雅思学习助手 —— 集口语、写作、阅读、听力练习于一体的全栈学习平台。

## ✨ 核心功能

### 🤖 智能 AI 助手（1 主路由 + 6 子 Agent）
- **IELTS Copilot 主路由** — 智能意图识别，自动调度最合适的专项助手，无需手动切换
- **✍️ 写作辅导** — 审题构思、作文批改、范文参考、表达升级，遵循最小修改原则
- **📝 写作笔记整理** — 基于 AI 报告和老师反馈自动整理学习笔记
- **🎤 口语优化** — IDPOF 框架 + 三色笔记法，打磨口语文稿
- **🗣️ 口语反馈整理** — 整理老师口语课后反馈为结构化笔记
- **📖 阅读分析** — 题型分析、长难句解析、同义替换整理
- **🎧 听力分析** — 错题分析、场景词汇积累、听力技巧指导

### 💬 对话增强
- **SSE 流式输出** — 实时打字机效果，体验流畅
- **消息重试 / 编辑** — 不满意可重新生成，也可编辑消息后重新回复
- **上下文材料系统** — 自动识别并缓存作文原文、口语答案等关键材料，减少 token 浪费
- **路由 Agent 标识** — 每条消息标注由哪个子 Agent 处理
- **文件附件** — 支持上传文档（PDF/DOCX/TXT）和图片，自动提取文本内容

### 📚 单词本
- **单词管理** — 增删改查，支持分类、标签、来源追溯
- **AI 翻译 / 查词** — 调用 LLM 返回音标、词性、释义、例句、同义词等结构化信息
- **SM-2 间隔复习** — 基于艾宾浩斯遗忘曲线的智能复习算法，自动安排复习时间
- **掌握等级** — 新词 → 模糊 → 认识 → 熟练，渐进式学习

### ⭐ 好词佳句
- **佳句收藏** — 框选对话中的优秀表达一键收藏
- **AI 自动翻译** — 收藏时自动填充翻译和注释
- **分类管理** — 按写作/口语/阅读/听力分类整理

### 📋 作业管理
- **作业 CRUD** — 创建、编辑、删除，支持多文件上传
- **日历视图** — 按月份查看作业完成情况，一目了然
- **反馈管理** — 支持 AI 报告 / 老师文字 / 老师音频 / 老师图片 四种反馈类型
- **📊 评分解析 + 雷达图** — 自动从 AI 报告中提取口语/写作各维度分数，雷达图可视化展示
- **🔄 AI 复盘笔记** — 一键生成精华复盘笔记，综合 AI 报告 + 老师反馈（支持多模态 Vision 识别老师图片批注）
- **批量上传 / 批量反馈** — 高效管理大量作业材料
- **文件预览** — 在线预览 DOCX、PDF 等作业附件

### 📊 学习报告
- **每日学习日报** — AI 分析当日学习情况（概览、重点、问题、横向对比、明日建议）
- **作业趋势分析** — 分析最近多次作业的进步点、薄弱项、重复问题和行动建议
- **智能缓存** — 报告缓存避免重复 LLM 调用，支持手动刷新

### 📝 笔记系统
- **笔记管理** — 创建、编辑、删除，支持分类和标签
- **从对话保存** — 在聊天中一键保存优质回复为笔记
- **从对话保存为反馈** — 将 AI 批改结果直接保存为作业反馈
- **AI 生成标题** — 根据笔记内容自动生成简洁标题
- **来源追溯** — 记录笔记来源的对话和消息

---

## 🛠️ 技术栈

| 模块 | 技术 |
|------|------|
| 前端 | Next.js 14 + TailwindCSS + shadcn/ui + Zustand |
| 后端 | FastAPI + SQLAlchemy 2.0 + SQLite (异步) |
| AI | LiteLLM（支持千问/DeepSeek/OpenAI/Claude/Gemini/豆包等多模型，含多模态 Vision） |
| 图表 | Recharts（评分雷达图） |
| Markdown | react-markdown + remark-gfm + rehype-raw |
| 文件处理 | python-docx + PyPDF2 + Pillow + docx-preview |
| 部署 | Docker Compose + Nginx (反向代理 + Basic Auth) |

---

## 🚀 快速开始

### 方式一：本地开发（推荐新手）

**前提条件**：电脑上已安装 [Python 3.10+](https://www.python.org/downloads/)、[Node.js 18+](https://nodejs.org/)

#### 第 1 步：克隆项目

```bash
git clone https://github.com/Liao330/IELTS-Copilot.git
cd IELTS-Copilot
```

#### 第 2 步：配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 AI 模型 API Key（至少填一个）：

```env
# 前端 API 地址（本地开发不用改）
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

> 💡 模型 API Key 在项目启动后，通过网页端「设置」页面配置即可，无需手动填写。

#### 第 3 步：一键启动

```bash
chmod +x start.sh
./start.sh
```

脚本会自动：
1. 创建 Python 虚拟环境 & 安装后端依赖
2. 安装前端依赖（首次需要几分钟）
3. 启动后端（http://localhost:8000）
4. 启动前端（http://localhost:3000）

启动成功后，打开浏览器访问 **http://localhost:3000** 即可使用 🎉

#### 常用命令

```bash
./start.sh          # 启动
./start.sh stop     # 停止
./start.sh restart  # 重启
./start.sh status   # 查看状态
./start.sh logs     # 查看日志
```

---

### 方式二：Docker 部署到服务器

**前提条件**：一台 Linux 服务器（已安装 Docker），本地有 SSH 访问权限

#### 第 1 步：配置部署参数

```bash
cp .env.deploy.example .env.deploy
```

编辑 `.env.deploy`，填入你的服务器信息：

```env
DEPLOY_SERVER_IP=你的服务器IP
DEPLOY_SERVER_USER=root
DEPLOY_PORT=8391
CORS_ORIGINS=http://你的服务器IP:8391
```

> 💡 `.env.deploy` 已在 `.gitignore` 中，不会被提交到 Git。

#### 第 2 步：首次安装 Docker（如服务器没装过）

```bash
./deploy.sh setup
```

#### 第 3 步：设置访问密码

```bash
./deploy.sh password 你的密码
```

#### 第 4 步：部署

```bash
./deploy.sh deploy
```

部署完成后，访问 `http://你的服务器IP:8391` 即可。

#### 部署常用命令

```bash
./deploy.sh deploy    # 完整部署（同步+构建+启动）
./deploy.sh update    # 快速更新（代码有改动时用这个）
./deploy.sh status    # 查看服务状态
./deploy.sh logs      # 查看日志
./deploy.sh stop      # 停止服务
./deploy.sh restart   # 重启服务
```

---

## ⚙️ 配置 AI 模型

启动后打开网页，进入 **「设置」** 页面：

1. 选择模型提供商（千问 / DeepSeek / OpenAI / Claude / Gemini / 豆包 等）
2. 填入 API Key
3. 选择模型名称
4. 保存即可

> 推荐使用 **DeepSeek** 或 **通义千问**，性价比高且中文效果好。

---

## 📁 项目结构

```
IELTS-Copilot/
├── backend/                        # FastAPI 后端
│   ├── app/
│   │   ├── main.py                 # FastAPI 入口
│   │   ├── database.py             # 数据库初始化
│   │   ├── models/                 # 数据模型（12 个文件）
│   │   │   ├── agent.py            # AI 助手配置
│   │   │   ├── conversation.py     # 对话记录
│   │   │   ├── message.py          # 消息
│   │   │   ├── file.py             # 上传文件
│   │   │   ├── note.py             # 学习笔记
│   │   │   ├── setting.py          # 系统设置
│   │   │   ├── homework.py         # 作业 + 文件 + 反馈
│   │   │   ├── vocabulary.py       # 单词本 + 好词佳句
│   │   │   ├── context_material.py # 上下文材料缓存
│   │   │   └── daily_report_cache.py # 日报缓存
│   │   ├── routers/                # API 路由（11 个文件）
│   │   │   ├── agents.py           # Agent 管理
│   │   │   ├── conversations.py    # 对话管理
│   │   │   ├── messages.py         # 消息收发 (SSE)
│   │   │   ├── files.py            # 文件上传
│   │   │   ├── notes.py            # 笔记管理
│   │   │   ├── settings.py         # 设置管理
│   │   │   ├── homeworks.py        # 作业管理（含评分解析 + 复盘笔记）
│   │   │   ├── vocabulary.py       # 单词本 + 佳句 + AI翻译
│   │   │   ├── reports.py          # 学习报告
│   │   │   └── study_plan.py       # 学习计划
│   │   ├── schemas/                # Pydantic 请求/响应模型
│   │   ├── services/               # 业务逻辑（7 个文件）
│   │   │   ├── llm_service.py      # LLM 调用封装
│   │   │   ├── file_service.py     # 文件处理
│   │   │   ├── router_service.py   # 主 Agent 路由调度
│   │   │   ├── report_service.py   # 学习报告生成
│   │   │   ├── study_plan_service.py # 学习计划解析
│   │   │   └── review_note_service.py # 复盘笔记生成（多模态 Vision）
│   │   ├── prompts/                # AI Prompt 模板（9 个文件）
│   │   │   ├── copilot_router.py   # 主路由智能调度
│   │   │   ├── writing_coach.py    # 写作辅导教练
│   │   │   ├── writing_assistant.py # 写作笔记整理
│   │   │   ├── speaking_assistant.py # 口语优化
│   │   │   ├── speaking_feedback.py # 口语反馈整理
│   │   │   ├── reading_assistant.py # 阅读分析
│   │   │   ├── listening_assistant.py # 听力分析
│   │   │   ├── translate_prompt.py # AI 翻译/查词
│   │   │   └── review_note.py      # 复盘笔记生成提示词
│   │   └── utils/                  # 工具函数（4 个文件）
│   │       ├── file_parser.py      # 文件文本提取
│   │       ├── pdf_images.py       # PDF 图片提取
│   │       └── score_parser.py     # AI 报告评分解析
│   └── requirements.txt
├── frontend/                       # Next.js 前端
│   ├── app/                        # 页面（12 个文件）
│   │   ├── page.tsx                # 首页（今日任务 + 日报 + 助手入口）
│   │   ├── chat/[conversationId]/  # 对话页
│   │   ├── homeworks/              # 作业库（列表/详情/批量上传/批量反馈）
│   │   ├── vocabulary/             # 单词本 + 好词佳句
│   │   ├── notes/                  # 笔记本
│   │   ├── reports/                # 学习报告
│   │   ├── study-plan/             # 学习计划
│   │   └── settings/               # 设置
│   ├── components/                 # 组件
│   │   ├── ui/                     # shadcn/ui 基础组件
│   │   ├── chat/                   # 对话组件
│   │   ├── homework/               # 作业组件（含 ScoreRadar 雷达图）
│   │   ├── vocabulary/             # 单词/佳句组件
│   │   ├── notes/                  # 笔记组件
│   │   └── reports/                # 报告组件
│   ├── stores/                     # Zustand 状态管理
│   ├── lib/                        # API 封装、工具函数
│   └── types/                      # TypeScript 类型定义
├── nginx/                          # Nginx 配置
├── docker-compose.yml              # Docker 编排（Nginx + 前端 + 后端）
├── start.sh                        # 本地一键启动
└── deploy.sh                       # 服务器部署脚本
```

---

## 🏗️ 系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 14)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 首页     │ │ 对话     │ │ 单词本   │ │ 作业库    │       │
│  │ Dashboard│ │ Chat     │ │ Vocab    │ │ Homework  │       │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤       │
│  │ 学习计划 │ │ 笔记     │ │ 学习报告 │ │ 设置     │       │
│  │ Plan     │ │ Notes    │ │ Reports  │ │ Settings │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                      │ HTTP / SSE                            │
└──────────────────────┼───────────────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────────────┐
│                  Backend (FastAPI)                            │
│                       │                                      │
│  ┌─────────── IELTS Copilot 主路由 ──────────────┐          │
│  │  意图识别 → 自动分发到 6 个子 Agent            │          │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │          │
│  │  │写作辅导│ │写作整理│ │口语优化│ │口语反馈│ │          │
│  │  ├────────┤ ├────────┤ ├────────┤ ├────────┤ │          │
│  │  │阅读分析│ │听力分析│ │        │ │        │ │          │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ │          │
│  └────────────────────────────────────────────────┘          │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 上下文   │ │ 学习报告 │ │ LLM      │ │          │       │
│  │ 材料管理 │ │ 生成     │ │ 适配层   │ │          │       │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤       │
│  │ 评分解析 │ │ 复盘笔记 │ │          │ │ 多模态   │       │
│  │ 雷达图   │ │ Vision   │ │          │ │ Vision   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────────────┐
│                  Storage Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ SQLite       │  │ Local File   │  │ LLM APIs     │       │
│  │ (12 个数据模型)│  │ Storage      │  │ (千问/DS/    │       │
│  │              │  │ (上传文件)    │  │  Claude/GPT) │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

---

## 📄 License

MIT License — 欢迎自由使用、修改和分发。
