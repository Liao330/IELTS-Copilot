# 🎓 IELTS Copilot

你的 AI 雅思学习助手 —— 集口语、写作、阅读、听力练习于一体的全栈学习平台。

## ✨ 核心功能

- 🗣️ **口语练习** — AI 模拟雅思口语考官，实时对话练习 Part 1/2/3
- ✍️ **写作批改** — 上传作文，AI 按雅思标准逐项评分 + 详细反馈
- 📖 **阅读训练** — AI 辅助阅读理解与词汇学习
- 🎧 **听力辅导** — 听力技巧指导与练习反馈
- 📚 **单词本** — 收藏生词，AI 自动查词填充，SM-2 间隔复习
- ⭐ **好词佳句** — 框选收藏优秀表达，AI 自动翻译
- 📝 **笔记系统** — 保存对话中的重点内容
- 📋 **作业管理** — 追踪练习进度与反馈

## 🛠️ 技术栈

| 模块 | 技术 |
|------|------|
| 前端 | Next.js 14 + TailwindCSS + shadcn/ui + Zustand |
| 后端 | FastAPI + SQLAlchemy + SQLite |
| AI | LiteLLM（支持千问/DeepSeek/OpenAI 等多模型） |
| 部署 | Docker Compose + Nginx |

---

## 🚀 快速开始

### 方式一：本地开发（推荐新手）

**前提条件**：电脑上已安装 [Python 3.10+](https://www.python.org/downloads/)、[Node.js 18+](https://nodejs.org/)

#### 第 1 步：克隆项目

```bash
git clone git@github.com:Liao330/IELTS-Copilot.git
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

#### 第 1 步：首次安装 Docker（如服务器没装过）

```bash
./deploy.sh setup
```

#### 第 2 步：设置访问密码

```bash
./deploy.sh password 你的密码
```

#### 第 3 步：部署

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

1. 选择模型提供商（千问 / DeepSeek / OpenAI 等）
2. 填入 API Key
3. 选择模型名称
4. 保存即可

> 推荐使用 **DeepSeek** 或 **通义千问**，性价比高且中文效果好。

---

## 📁 项目结构

```
IELTS-Copilot/
├── backend/              # FastAPI 后端
│   ├── app/
│   │   ├── models/       # 数据模型
│   │   ├── routers/      # API 路由
│   │   ├── schemas/      # 请求/响应模型
│   │   ├── services/     # LLM/文件 服务
│   │   └── prompts/      # AI Prompt 模板
│   └── requirements.txt
├── frontend/             # Next.js 前端
│   ├── app/              # 页面
│   ├── components/       # 组件
│   ├── stores/           # Zustand 状态管理
│   ├── lib/              # API 封装、工具
│   └── types/            # TypeScript 类型
├── nginx/                # Nginx 配置
├── docker-compose.yml    # Docker 编排
├── start.sh              # 本地一键启动
└── deploy.sh             # 服务器部署脚本
```

---

## 📄 License

本项目仅供个人学习使用。
