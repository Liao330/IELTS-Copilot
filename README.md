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
- **文件附件** — 支持上传文档（PDF/DOCX/TXT）、图片，以及 🆕 **音频/视频**（自动 ASR 转写文本）

### 🎧 精听练习（新增）
专为"听到的 ≠ 认识的"这类高频问题设计的精听闭环：
- **AI 梯度例句生成** — 针对句子中的障碍词（连读/弱读/吞音/相近发音/不熟词），生成 Easy/Medium/Hard 三档包含该词的练习例句
- **句内障碍词标注** — 多词短语（如 `a lot of`）跨 token 高亮，点击即可切换标记状态
- **拟人 TTS 朗读** — 腾讯云精品英文音色（WeJack 男声 / WeWinny 女声 / WeJames 男声），自然连读弱读
- **全局单例播放** — 一个按钮在播时自动停掉其它按钮，音色/语速可持久化偏好（默认 1.0x）
- **磁盘级 SHA256 缓存** — `(text, voice, rate)` 组合只合成一次，重听 0 额度消耗
- **AI 生成内容缓存** — 已生成的障碍词例句按 `(句子, 障碍词)` 精确缓存，仅补齐新增障碍词
- **内置示例会话** — 首次打开服务端懒加载生成，所有用户共享一份琥珀色置顶的 demo 会话（只读防修改）

### 🎤 语音识别（ASR）
- **阿里云 Paraformer 实时语音识别** — 上传音频/视频文件自动转写为英文文本
- **FFmpeg 统一转码** — 任意格式（m4a/mp4/webm/ogg/wav...）→ 16kHz 单声道 mp3 再送识别
- **文件级一次性处理** — 识别结果写入附件的 `text_content`，后续对话复用不重复计费

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
| 前端 | Next.js 14 + TailwindCSS + shadcn/ui + Zustand（含 persist） |
| 后端 | FastAPI + SQLAlchemy 2.0 + SQLite（异步） |
| LLM | LiteLLM 适配层（千问 / DeepSeek / OpenAI / Claude / Gemini / 豆包等，含多模态 Vision） |
| TTS | 腾讯云语音合成 `TextToVoice` v20190823（英文精品 / 大模型音色） |
| ASR | 阿里云百炼 DashScope Paraformer-realtime-v2 |
| 媒体处理 | ffmpeg（统一转码 16kHz mp3）|
| 图表 | Recharts（评分雷达图） |
| Markdown | react-markdown + remark-gfm + rehype-raw |
| 文件处理 | python-docx + PyPDF2 + Pillow + docx-preview |
| 部署 | Docker Compose + Nginx（反向代理 + Basic Auth） |

---

## 🚀 快速开始

### 方式一：本地开发（推荐新手）

**前提条件**：电脑上已安装 [Python 3.10+](https://www.python.org/downloads/)、[Node.js 18+](https://nodejs.org/)、[ffmpeg](https://ffmpeg.org/)（如需使用音视频上传转写）

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

> 💡 所有 API Key（LLM / 腾讯云 TTS / 阿里云 ASR）都在启动后的「设置」页面配置，无需手动编辑 `.env`。

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

> 🔧 后端镜像已内置 `ffmpeg`，ASR 音视频转码开箱即用。
> 🌐 `Dockerfile.backend` 使用腾讯云内网 `mirrors.tencentyun.com` 加速 apt，国内服务器构建速度约 30 秒。
> 🔒 `deploy.sh` 已配置 `ServerAliveInterval=30`，避免长时构建期间 SSH 被防火墙断开。

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

## ⚙️ 服务配置

打开网页进入 **「设置」** 页面，按需配置：

### 1. LLM 模型（必填）

1. 选择模型提供商（千问 / DeepSeek / OpenAI / Claude / Gemini / 豆包 等）
2. 填入 API Key
3. 选择模型名称
4. 保存

> 推荐使用 **通义千问 Qwen-Turbo** 或 **DeepSeek**，性价比高且中文效果好。
> 千问新用户有 100 万 tokens / 180 天免费额度。

### 2. 腾讯云 TTS（可选，精听功能需要）

> 仅在使用"精听练习"的朗读按钮时需要。

1. 前往 [腾讯云 CAM 控制台](https://console.cloud.tencent.com/cam/capi) 创建子账号 SecretId / SecretKey
2. 建议为此密钥单独绑定 `QcloudTTSFullAccess` 策略限制最小权限
3. 前往 [语音合成控制台](https://console.cloud.tencent.com/tts/resourcebundle) 免费领取"精品音色资源包"或"大模型音色资源包"（100 万字符/月，每月刷新）
4. 在设置页填入 SecretId / SecretKey，地域默认 `ap-guangzhou`

### 3. 阿里云 ASR（可选，音视频上传需要）

> 上传音频/视频作业附件时，后端会自动调用 ASR 转写文本。

- 复用 **千问的 DashScope API Key** 即可，无需额外申请
- 新用户 36,000 秒免费额度

---

## 💰 免费额度能用多久？

| 服务 | 免费额度 | 典型日耗 | 大约能用 |
|------|----------|----------|----------|
| 千问 Qwen-Turbo LLM | 100 万 tokens / 180 天 | ~130k/天（重度） | **7-10 天** |
| 腾讯云 TTS | **100 万字符 / 月**（每月重置） | ~4k/天 | **≈ 永远够用** |
| 阿里云 Paraformer ASR | 36,000 秒 | 几分钟 | **够录 200+ 条口语** |

> 📌 **瓶颈只有 LLM tokens**。精听生成结果按 `(句, 障碍词)` 精确缓存、TTS 按 SHA256 全局缓存、demo 会话多用户共享同一份结果，整体已对免费额度做了最大化优化。

---

## 📁 项目结构

```
IELTS-Copilot/
├── backend/                          # FastAPI 后端
│   ├── app/
│   │   ├── main.py                   # FastAPI 入口 + Agent 种子数据 + demo 懒加载
│   │   ├── config.py                 # 配置常量
│   │   ├── database.py               # 异步 SQLAlchemy 初始化
│   │   ├── models/                   # 数据模型（11 个）
│   │   │   ├── agent.py              # AI 助手配置
│   │   │   ├── conversation.py       # 对话记录
│   │   │   ├── message.py            # 消息
│   │   │   ├── file.py               # 上传文件（含 ASR 结果）
│   │   │   ├── note.py               # 学习笔记
│   │   │   ├── setting.py            # 系统设置（TTS/ASR/LLM 配置均存此）
│   │   │   ├── homework.py           # 作业 + 文件 + 反馈
│   │   │   ├── vocabulary.py         # 单词本 + 好词佳句
│   │   │   ├── context_material.py   # 上下文材料缓存
│   │   │   ├── daily_report_cache.py # 日报缓存
│   │   │   └── listening_practice.py # 🆕 精听会话 / 句子 / 生成结果
│   │   ├── routers/                  # API 路由（11 个）
│   │   │   ├── agents.py             # Agent 管理
│   │   │   ├── conversations.py      # 对话管理
│   │   │   ├── messages.py           # 消息收发（SSE 流式）
│   │   │   ├── files.py              # 文件上传（自动 ASR）
│   │   │   ├── notes.py              # 笔记管理
│   │   │   ├── settings.py           # 设置管理
│   │   │   ├── homeworks.py          # 作业管理（含评分解析 + 复盘笔记）
│   │   │   ├── vocabulary.py         # 单词本 + 佳句 + AI 翻译
│   │   │   ├── reports.py            # 学习报告
│   │   │   ├── listening_practice.py # 🆕 精听会话 CRUD + AI 生成
│   │   │   └── speech.py             # 🆕 TTS / ASR / 音色列表
│   │   ├── schemas/                  # Pydantic 请求/响应模型
│   │   ├── services/                 # 业务逻辑（8 个）
│   │   │   ├── llm_service.py        # LLM 调用封装（LiteLLM）
│   │   │   ├── file_service.py       # 文件处理（含 ASR 触发）
│   │   │   ├── router_service.py     # 主 Agent 路由调度
│   │   │   ├── report_service.py     # 学习报告生成
│   │   │   ├── review_note_service.py# 复盘笔记（多模态 Vision）
│   │   │   ├── speech_service.py     # 🆕 腾讯云 TTS + 阿里云 ASR + ffmpeg
│   │   │   ├── listening_practice_service.py # 🆕 精听 AI 生成（按句合并调用）
│   │   │   └── listening_demo_service.py     # 🆕 内置 demo 会话懒生成
│   │   ├── prompts/                  # AI Prompt 模板（10 个）
│   │   │   ├── copilot_router.py     # 主路由智能调度
│   │   │   ├── writing_coach.py      # 写作辅导教练
│   │   │   ├── writing_assistant.py  # 写作笔记整理
│   │   │   ├── speaking_assistant.py # 口语优化
│   │   │   ├── speaking_feedback.py  # 口语反馈整理
│   │   │   ├── reading_assistant.py  # 阅读分析
│   │   │   ├── listening_assistant.py# 听力分析
│   │   │   ├── translate_prompt.py   # AI 翻译/查词
│   │   │   ├── review_note.py        # 复盘笔记生成提示词
│   │   │   └── listening_practice_prompt.py  # 🆕 精听梯度例句生成
│   │   └── utils/                    # 工具函数
│   │       ├── file_parser.py        # 文件文本提取
│   │       ├── pdf_images.py         # PDF 图片提取
│   │       ├── score_parser.py       # AI 报告评分解析
│   │       └── llm_config.py         # LLM 配置读取
│   └── requirements.txt              # 含 tencentcloud-sdk-python-tts / dashscope
├── frontend/                         # Next.js 前端
│   ├── app/                          # 页面
│   │   ├── page.tsx                  # 首页（今日任务 + 日报 + 助手入口）
│   │   ├── chat/[conversationId]/    # 对话页
│   │   ├── homeworks/                # 作业库（列表/详情/批量上传/批量反馈）
│   │   ├── vocabulary/               # 单词本 + 好词佳句
│   │   ├── notes/                    # 笔记本
│   │   ├── reports/                  # 学习报告
│   │   ├── listening-practice/       # 🆕 精听练习（列表 / 新建 / 详情）
│   │   └── settings/                 # 设置（LLM + TTS + ASR）
│   ├── components/                   # 组件
│   │   ├── ui/                       # shadcn/ui 基础组件
│   │   ├── chat/                     # 对话组件
│   │   ├── homework/                 # 作业组件（含 ScoreRadar 雷达图）
│   │   ├── vocabulary/               # 单词 / 佳句 / TranslatePopover 选词工具条
│   │   ├── notes/                    # 笔记组件
│   │   ├── reports/                  # 报告组件
│   │   └── listening/                # 🆕 精听组件
│   │       ├── PlayButton.tsx        # TTS 播放（全局单例 + Blob 缓存）
│   │       ├── SentenceEditor.tsx    # 句子内障碍词标注（支持多词短语）
│   │       ├── BlockerWordToken.tsx  # 障碍词高亮 token
│   │       ├── GenerateResultCard.tsx# AI 生成的梯度例句卡片
│   │       ├── SessionCard.tsx       # 会话列表卡片（含琥珀色 demo 徽标）
│   │       └── DemoPreview.tsx       # demo 预览（保留备用）
│   ├── stores/                       # Zustand 状态管理
│   ├── lib/
│   │   ├── api.ts                    # API 封装
│   │   └── voice-store.ts            # 🆕 TTS 音色/语速偏好（persist + migrate）
│   └── types/                        # TypeScript 类型定义
├── nginx/                            # Nginx 配置
├── docker-compose.yml                # Docker 编排（Nginx + 前端 + 后端）
├── Dockerfile.backend                # 含 ffmpeg，apt 源指向腾讯云内网
├── Dockerfile.frontend               # Next.js standalone 构建
├── start.sh                          # 本地一键启动
└── deploy.sh                         # 服务器部署脚本（含 SSH 保活）
```

---

## 🏗️ 系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 14)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ 首页     │ │ 对话     │ │ 单词本   │ │ 作业库   │        │
│  │ Dashboard│ │ Chat SSE │ │ Vocab    │ │ Homework │        │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤        │
│  │ 精听练习 │ │ 笔记     │ │ 学习报告 │ │ 设置     │        │
│  │ 🆕 Listen│ │ Notes    │ │ Reports  │ │ Settings │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│                      │ HTTP / SSE / Audio                    │
└──────────────────────┼───────────────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────────────┐
│                  Backend (FastAPI)                            │
│                       │                                       │
│  ┌─────────── IELTS Copilot 主路由 ──────────────┐           │
│  │  意图识别 → 自动分发到 6 个子 Agent            │           │
│  │  写作辅导 / 写作整理 / 口语优化 / 口语反馈 /   │           │
│  │  阅读分析 / 听力分析                           │           │
│  └────────────────────────────────────────────────┘           │
│                                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ 上下文   │ │ 学习报告 │ │ 精听生成 │ │ 复盘笔记 │        │
│  │ 材料管理 │ │ 生成     │ │ 🆕       │ │ Vision   │        │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤        │
│  │ 评分解析 │ │ LLM 适配 │ │ TTS 缓存 │ │ ASR 转写 │        │
│  │ 雷达图   │ │ LiteLLM  │ │ 🆕 磁盘  │ │ 🆕 ffmpeg│        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│                                                               │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────────────┐
│                  Storage & External APIs                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │ SQLite     │  │ Local Disk │  │ LLM APIs   │              │
│  │ 11 models  │  │ 上传文件 + │  │ 千问/DS/   │              │
│  │            │  │ TTS 缓存   │  │ Claude/GPT │              │
│  └────────────┘  └────────────┘  └────────────┘              │
│                                                               │
│  ┌────────────────────┐    ┌────────────────────┐            │
│  │ 🆕 腾讯云 TTS     │    │ 🆕 阿里云 Paraformer│            │
│  │ TextToVoice v2019  │    │ realtime-v2 ASR    │            │
│  └────────────────────┘    └────────────────────┘            │
└───────────────────────────────────────────────────────────────┘
```

---

## 📄 License

MIT License — 欢迎自由使用、修改和分发。
