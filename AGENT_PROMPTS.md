# IELTS Copilot - 代码 Agent 启动 Prompt

> 本文档包含多个 Prompt，分别用于不同阶段。请根据实际情况选择使用。

---

## Prompt 1：项目初始化（首次使用，创建整个项目骨架）

```
我要创建一个名为 "IELTS Copilot" 的雅思学习 AI 助手平台，请你按照我提供的三份文档来实现这个项目。

## 项目文档
请先阅读以下三份文档，理解完整的产品需求和技术设计：
1. `PRD.md` — 产品需求文档（功能需求、页面设计、用户故事）
2. `TDD.md` — 技术设计文档（架构、技术选型、数据模型、API设计、目录结构）
3. `PROMPTS.md` — Prompt 设计文档（各 Agent 的 System Prompt）

## 当前目标
实现 V1.0 版本，包含以下功能：
1. ✅ 写作助手 Agent（含完整的 System Prompt）
2. ✅ 基础对话系统（新建对话、消息收发、流式输出、历史对话）
3. ✅ 文件上传（支持图片/PDF/DOCX/TXT，内容提取后作为上下文）
4. ✅ 设置页面（API Key 配置、模型提供商选择、模型切换）
5. ✅ Markdown 渲染（支持表格、代码块、列表等）
6. ✅ 响应式布局

## 技术栈要求
- 前端：Next.js 14+ (App Router) + TailwindCSS + shadcn/ui + Zustand
- 后端：Python FastAPI + SQLAlchemy 2.0 + SQLite + LiteLLM
- 流式输出：SSE (Server-Sent Events)
- 文件解析：python-docx, PyPDF2, Pillow

## 开发优先级
请按以下顺序实现：
1. 先搭建后端：数据库模型 → API 路由 → LLM 集成（SSE 流式）→ 文件上传
2. 再搭建前端：布局与路由 → Agent 选择页 → 对话页面（含流式渲染）→ 设置页
3. 最后联调测试

## 初始数据
项目启动时需要自动初始化以下数据：
- 内置写作助手 Agent（使用 PROMPTS.md 中定义的 System Prompt）
- 默认设置（context_window_size: 20, stream_enabled: true）

## LLM 配置
开发调试阶段优先使用千问（免费额度）：
- 模型名：qwen-plus
- API Base：https://dashscope.aliyuncs.com/compatible-mode/v1
- 通过 LiteLLM 统一调用接口

## 重要约束
- API Key 不要硬编码，通过设置页面配置并存储到数据库
- 所有 API 请求参数必须通过 Pydantic 校验
- 数据库操作全程使用 SQLAlchemy ORM，禁止原始 SQL 拼接
- 前端对话页必须支持 Markdown 渲染（特别是表格，写作助手会大量使用表格）
- 前后端目录结构严格按照 TDD.md 中定义的结构

请先完整阅读三份文档，确认理解后开始实现。每完成一个模块请说明进度。
```

---

## Prompt 2：增加口语助手 Agent（V1.1）

```
请在现有 IELTS Copilot 项目基础上，增加口语助手 Agent。

## 需求
1. 在后端 `prompts/` 目录下创建 `speaking_assistant.py`，使用 PROMPTS.md 中定义的口语助手 System Prompt
2. 在数据库初始化脚本中添加口语助手 Agent 的初始数据
3. 前端 Agent 选择页自动展示新增的口语助手卡片（无需修改前端代码，数据驱动）

## 口语助手的特殊要求
- 输出格式为"三色笔记法"表格，确保 Markdown 表格渲染正常
- 开场白使用 PROMPTS.md 中定义的内容

请参考 PROMPTS.md 中的口语助手部分进行实现。
```

---

## Prompt 3：增加笔记管理功能（V1.1）

```
请在现有 IELTS Copilot 项目基础上，增加笔记管理功能。

## 需求
参考 PRD.md 中的笔记管理页设计和 TDD.md 中的 notes 表结构，实现以下功能：

### 后端
1. notes 表（如未创建则创建）
2. 笔记 CRUD API：GET /api/notes（支持 category 筛选和 search 搜索）、POST/PUT/DELETE
3. 笔记可关联来源对话和消息

### 前端
1. 对话页面：Agent 每条回复下方增加"保存为笔记"按钮，点击后弹窗选择分类和标题
2. 笔记管理页（/notes）：分类标签筛选、搜索、笔记卡片列表、编辑和删除
3. 首页增加"我的笔记"入口

请参考 PRD.md 中的页面原型进行实现。
```

---

## Prompt 4：Bug 修复 / 功能调优（通用模板）

```
请修复/优化 IELTS Copilot 项目中的以下问题：

## 问题描述
[描述具体问题，如：流式输出中途断开、Markdown 表格渲染异常、文件上传后内容未正确提取等]

## 复现步骤
1. [步骤1]
2. [步骤2]
3. [步骤3]

## 期望行为
[描述期望的正确行为]

## 实际行为
[描述实际的错误行为]

## 相关文件
[列出可能涉及的文件路径]
```

---

## Prompt 5：新增 Agent（通用模板）

```
请在 IELTS Copilot 项目中新增一个 Agent。

## Agent 信息
- 名称：[Agent 名称]
- 图标：[emoji]
- 描述：[一句话描述]
- 使用场景：[什么时候用这个 Agent]

## System Prompt
[粘贴完整的 System Prompt]

## 开场白
[粘贴开场白内容]

## 实现要求
1. 后端：在 prompts/ 目录创建对应文件，在数据库初始化中添加 Agent 数据
2. 前端：无需修改（数据驱动，自动展示）
```

---

## Prompt 6：部署上线准备（远期）

```
请为 IELTS Copilot 项目做部署上线准备。

## 需求
1. 添加 Docker 支持（Dockerfile + docker-compose.yml）
   - 前端：多阶段构建，nginx 静态托管
   - 后端：Python 镜像，uvicorn 生产模式
2. 数据库迁移到 PostgreSQL（使用 Alembic 管理迁移）
3. 文件存储迁移到 S3 兼容存储（预留接口）
4. 添加用户认证系统（注册/登录/JWT）
5. CORS 配置：限制为生产域名
6. 环境变量管理：所有敏感信息通过环境变量注入
7. API Key 加密存储（Fernet 加密）

请参考 TDD.md 中的安全考虑和远期部署方案章节。
```

---

## 使用建议

### 给 Claude Code / Codebuddy 的通用技巧

1. **首次对话**：使用 Prompt 1，把三份文档（PRD.md、TDD.md、PROMPTS.md）一起上传/粘贴到对话中
2. **分阶段推进**：不要一次性要求实现所有功能，按 V1.0 → V1.1 → V2.0 分步推进
3. **出现问题时**：使用 Prompt 4 模板，清晰描述问题、复现步骤、期望行为
4. **新增 Agent 时**：先自己定好 System Prompt（可以在日常使用中打磨满意后再固化），然后用 Prompt 5 让代码 Agent 添加
5. **每次新开对话**：如果之前的对话上下文过长，新开对话时简要说明"这是一个已有的项目，请先阅读项目代码了解现状"

### Prompt 优化技巧
- **具体 > 抽象**：描述需求时尽量具体，给出示例输入和期望输出
- **约束明确**：明确告诉 Agent "不要做什么"和"必须做什么"
- **分步确认**：大功能分步实现，每步完成后确认再继续
- **附上截图**：如果是 UI 问题，截图比文字描述更高效
