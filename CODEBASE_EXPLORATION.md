# IELTS Copilot - Codebase Exploration Summary

## Project Overview
**IELTS Copilot** is a comprehensive AI-powered IELTS preparation platform built with:
- **Backend**: FastAPI (Python, async) with SQLAlchemy ORM
- **Frontend**: Next.js (TypeScript/React)
- **Database**: SQLite with async support (aiosqlite)
- **AI Integration**: Alibaba Qwen/通义千问 (Primary), DeepSeek (Alternative)

---

## 1. Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── routers/             # FastAPI route handlers
│   │   ├── services/            # Business logic layer
│   │   ├── utils/               # Utilities (LLM config, parsers)
│   │   ├── schemas/             # Pydantic models
│   │   ├── data/                # Seed data (JSON/Python)
│   │   ├── database.py          # DB initialization & migrations
│   │   ├── config.py            # Configuration (DB path, upload dir)
│   │   └── main.py              # FastAPI app setup
│   └── data/
│       └── ielts_copilot.db     # SQLite database
├── frontend/
│   ├── app/                     # Next.js app directory
│   │   ├── writing-practice/    # Main writing practice page
│   │   ├── listening-practice/
│   │   ├── homeworks/
│   │   ├── vocabulary/
│   │   ├── schedule/
│   │   ├── study-plan/
│   │   └── chat/                # Conversations with agents
│   ├── components/              # React components
│   ├── lib/                     # Utilities (API client)
│   ├── types/                   # TypeScript type definitions
│   └── stores/                  # State management
└── nginx/                       # Reverse proxy config
```

---

## 2. 素材 (Essay Materials) Storage & Schema

### Database Models

#### **WritingMaterial** Table
Core model for 大作文素材 (IELTS essay materials)

```python
class WritingMaterial(Base):
    """大作文素材 — 理由链+例子，5级mastery"""
    __tablename__ = "writing_materials"
    
    # Identity
    id: str (UUID)
    
    # Topic & Direction
    topic: str                      # "education", "technology", "environment", etc.
    topic_cn: str                   # Chinese name: "教育", "科技", "环境"
    direction: str                  # Question/direction: "大学应该免费吗？"
    direction_index: int            # 1, 2, 3, etc.
    
    # Stance & Angle
    stance: str                     # "pro" or "con"
    stance_label: str               # "正方" or "反方"
    angle: str                      # Specific argument angle: "社会公平", "国家发展"
    angle_index: int                # 1, 2
    
    # Material Content (理由链 + 例子)
    reasoning_chain: str            # Chinese reasoning: "消除经济障碍 → 寒门子弟也能读大学 → 缩小贫富差距"
    reasoning_chain_en: str | null  # Downgraded English (keywords level)
    example: str                    # Chinese example: "北欧国家（瑞典、挪威）免学费..."
    example_en: str | null          # English keywords from example
    
    # Sorting
    sort_order: int
    
    # SM-2 Spaced Repetition (5-level mastery, capped at 7 days)
    mastery_level: int              # 0-5 (0=new, 5=mastered)
    review_count: int               # Total reviews
    correct_count: int              # Correct reviews
    ease_factor: float              # SM-2 factor (default 2.5)
    interval_days: int              # Days until next review (max 7)
    next_review_at: datetime | null
    last_reviewed_at: datetime | null
    first_learned_at: datetime | null
    
    created_at: datetime
```

#### **WritingMaterialKeyword** Table
关键词中英对照表 - for vocabulary extraction

```python
class WritingMaterialKeyword(Base):
    """大作文素材关键词中英对照"""
    __tablename__ = "writing_material_keywords"
    
    id: str
    topic: str
    direction_index: int
    cn: str                         # Chinese term
    en: str                         # English translation
    level: str                      # "basic" or "advanced"
    sort_order: int
    
    # SM-2 (3-level mastery, max 7 days)
    mastery_level: int              # 0-2
    review_count: int
    interval_days: int
    next_review_at: datetime | null
    last_reviewed_at: datetime | null
    first_learned_at: datetime | null
    
    created_at: datetime
```

#### **DowngradeAttempt** Table
降级练习记录 - tracks "downgrade" (translation from Chinese to English) practice

```python
class DowngradeAttempt(Base):
    """降级练习记录"""
    __tablename__ = "downgrade_attempts"
    
    id: str
    chinese: str                    # Original Chinese text
    answer: str                     # User's English answer
    score: int                      # 0-100 or points
    correct: int                    # Binary (0 or 1)
    reference_answer: str | null
    feedback: str | null
    source_material_id: str | null  # Link to WritingMaterial
    needs_retry: int                # Flag for retry queue
    retried: int                    # Whether user retried
    
    created_at: datetime
```

#### **ContextMaterial** Table
对话级关键材料存储 - stores learning materials from conversations

```python
class ContextMaterial(Base):
    """对话级关键材料存储"""
    __tablename__ = "context_materials"
    
    id: str
    conversation_id: str            # FK to Conversation
    material_type: str              # "essay", "speaking_answer", "reading_passage", 
                                    # "listening_script", "feedback", "other"
    title: str                      # Brief title: "环境保护大作文"
    content: str                    # Full content (md/txt)
    source_message_id: str | null   # Which user message produced this
    created_at: datetime
```

### Seed Data
Located in: `backend/app/data/writing_materials_seed.json`

Structure:
```json
{
  "materials": [
    {
      "topic": "education",
      "topic_cn": "教育",
      "direction": "大学应该免费吗？",
      "direction_index": 1,
      "stance": "pro",
      "stance_label": "正方",
      "angle": "社会公平",
      "angle_index": 1,
      "reasoning_chain": "消除经济障碍 → 寒门子弟也能读大学 → 缩小贫富差距、促进阶层流动",
      "example": "北欧国家（瑞典、挪威）免学费，社会流动性指标全球领先",
      "reasoning_chain_en": "Remove economic barriers → students from poor backgrounds can attend university → narrower wealth gap, increased social mobility",
      "example_en": "Nordic countries (Sweden, Norway) have free tuition, ranking highest in social mobility metrics"
    }
    // ... more materials
  ],
  "keywords": [
    {
      "topic": "education",
      "direction_index": 1,
      "cn": "寒门子弟",
      "en": "students from poor/disadvantaged backgrounds",
      "level": "basic"
    }
    // ... more keywords
  ]
}
```

---

## 3. Current Material Structure

### Display Format (理由链 + 例子 + 中英文)

**Frontend Component**: `frontend/app/writing-practice/page.tsx` - `MaterialDailySubTab()`

Materials are displayed with:

1. **Metadata Header**
   - Topic emoji: 📚 Topic (education/technology/environment/etc.)
   - Direction: "大学应该免费吗？"
   - Stance badge: "正方 · 社会公平" (color-coded: green for pro, red for con)

2. **Content - Two-Column Layout**
   - Left: Chinese (中文)
   - Right: English keywords (英文降级版)

   **理由链 (Reasoning Chain)**
   ```
   [中文] 消除经济障碍 → 寒门子弟也能读大学 → 缩小贫富差距
   [英文] Remove barriers → more students access → reduced inequality
   ```

   **例子 (Example)**
   ```
   [中文] 北欧国家（瑞典、挪威）免学费，社会流动性指标全球领先
   [英文] Nordic countries: free tuition, top social mobility rankings
   ```

3. **Interaction Modes**
   - **Daily Tab**: View new materials to learn
   - **Flashcard Tab**: Flip-to-reveal practice (Chinese visible first, English on flip)
   - **Dictation Tab**: "Downgrade" practice (Chinese → English conversion)
   - **Library**: Browse all materials
   - **Stats**: SM-2 progress tracking

---

## 4. AI/LLM Integration

### Current Setup: Alibaba Qwen/通义千问

**Configuration Location**: `backend/app/main.py` + `backend/app/routers/settings.py`

```python
# Default configuration (from backend/app/main.py)
"llm_providers": {
    "openai": {
        "name": "千问 (阿里云百炼)",
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
        "api_base": "https://api.deepseek.com",
        "models": ["deepseek-chat", "deepseek-reasoner"]
    }
}

# Default model (changeable in settings)
default_model = "openai/qwen-turbo-2024-11-01"
```

### LLM Config Resolution

**File**: `backend/app/utils/llm_config.py`

```python
async def get_llm_config(db: AsyncSession) -> tuple[str, str | None, str | None]:
    """Returns (model_name, api_key, api_base) from settings.
    Falls back to first available api_key if default is not set."""
```

The system uses **OpenAI-compatible API interface** (not direct Alibaba SDK):
- Qwen endpoints are wrapped to be compatible with `openai` provider name
- API base URL: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- Requires Alibaba DashScope API key in settings

### Usage Locations
- `backend/app/routers/messages.py` - Main conversation
- `backend/app/routers/notes.py` - Note generation
- `backend/app/routers/vocabulary.py` - Word association
- `backend/app/services/report_service.py` - Report generation
- `backend/app/services/review_note_service.py` - Review notes

---

## 5. API Endpoints (Writing Materials)

### Base URL: `/api/writing-materials`

#### Material Operations
```
GET    /api/writing-materials
       Query: ?topic=education&mastery=0-5
       Response: List[MaterialOut]

GET    /api/writing-materials/stats
       Response: StatsOut {
         total, mastered, learning, new_count, 
         due_today, tomorrow_due, learned_today,
         topic_stats, keyword_total, keyword_mastered
       }

GET    /api/writing-materials/new-today?limit=4
       Response: List[MaterialOut] - New materials for today

GET    /api/writing-materials/learned-today
       Response: List[MaterialOut] - Already learned today

GET    /api/writing-materials/due?limit=20
       Response: List[MaterialOut] - Due for review today
```

#### Learning Endpoints
```
POST   /api/writing-materials/{id}/review
       Body: { quality: 0-3 }  # 0=不会, 1=模糊, 2=会了, 3=很熟
       Purpose: SM-2 update

POST   /api/writing-materials/{id}/check
       Body: { answer: string, mode: "reasoning" | "example" }
       Response: CheckResponse { 
         correct, score, expected, feedback, 
         mastery_level, interval_days 
       }
```

#### Keyword Operations
```
GET    /api/writing-materials/keywords?topic=education&direction_index=1
       Response: List[KeywordOut]

GET    /api/writing-materials/keywords/due?limit=20
       Response: List[KeywordOut] - Keywords due for review

POST   /api/writing-materials/keywords/{id}/review
       Body: { quality: 0-3 }
```

#### Downgrade Practice (降级练习)
```
GET    /api/writing-materials/downgrade-sentences
       Response: List of Chinese sentences for translation practice

GET    /api/writing-materials/downgrade-retry
       Response: Sentences that user got wrong, for retry

GET    /api/writing-materials/downgrade-stats
       Response: { total_attempts, correct, accuracy }

POST   /api/writing-materials/downgrade-check
       Body: { chinese: string, answer: string, source_material_id?: string }
       Response: Score, feedback, reference answer
```

---

## 6. Frontend UI Components

### Main Page: `frontend/app/writing-practice/page.tsx`

**Tab Structure**:
```
┌─ Main Tabs ─────────────────────┐
│  [📝 句型背诵] [💡 素材背诵] [🎤 口语纠错]
└─────────────────────────────────┘
  
  When "💡 素材背诵" selected:
  ┌─ Sub-tabs ──────────────────────┐
  │  [每日] [闪卡] [默写] [库] [统计]
  └─────────────────────────────────┘
```

#### Sub-tabs for Materials (素材背诵):

1. **Daily Tab (每日)** - `MaterialDailySubTab()`
   - Shows 4 new materials
   - Shows today's already-learned materials
   - Progress stats
   
2. **Flashcard Tab (闪卡)** - `MaterialFlashcardSubTab()`
   - Flip-to-reveal interface
   - Chinese visible first
   - Options after flip: [不会] [模糊] [记住了]
   
3. **Dictation Tab (默写/降级)** - `MaterialDictationSubTab()`
   - Translation practice
   - Chinese prompt → English free response
   - LLM-powered scoring
   
4. **Library (库)** - `MaterialLibrarySubTab()`
   - Browse all materials by topic
   - Filter by stance/angle
   
5. **Stats (统计)** - `MaterialStatsSubTab()`
   - SM-2 progress graphs
   - Topic breakdown
   - Learning timeline

---

## 7. Frontend API Client

**File**: `frontend/lib/api.ts`

```typescript
// Writing Materials API Methods
getWritingMaterials: (params?: { topic?: string }) => List[any]
getWritingMaterialStats: () => any
getWritingMaterialsNewToday: (limit = 4) => List[any]
getWritingMaterialsLearned: () => List[any]
getWritingMaterialsDue: (limit = 20) => List[any]
reviewWritingMaterial: (id: string, quality: number) => any
checkWritingMaterial: (id: string, answer: string, mode: string) => any

// Keywords
getWritingMaterialKeywords: (params) => List[any]
getWritingMaterialKeywordsDue: (limit = 20) => List[any]
reviewWritingMaterialKeyword: (id: string, quality: number) => any

// Downgrade Practice
getDowngradeSentences: () => List[any]
getDowngradeRetry: () => List[any]
getDowngradeStats: () => any
checkDowngrade: (chinese: string, answer: string, source_material_id?) => any
```

---

## 8. SM-2 Spaced Repetition Algorithm

**Implementation**: `backend/app/routers/writing_materials.py`

### For Materials (5-level mastery, 7-day cap):
```python
def _sm2_update_material(m: WritingMaterial, quality: int, max_mastery: int = 5):
    """
    quality: 0=不会, 1=模糊, 2=会了, 3=很熟
    
    Algorithm:
    - If quality < 2: interval = 1 day, ease_factor -= 0.2, mastery decreases
    - If quality >= 2:
      - If review_count == 0: interval = 1 day
      - If review_count <= 2: interval = 2 days
      - Else: interval = min(7, round(interval * ease_factor))
    - Mastery increases by 1 (capped at 5)
    - Ease factor: ef = ef + 0.1 - (3 - quality) * 0.08
    """
    m.interval_days = min(7, interval)
    m.next_review_at = now + timedelta(days=interval)
```

### For Keywords (3-level mastery, 7-day cap):
```python
def _sm2_update_keyword(k: WritingMaterialKeyword, quality: int):
    """Similar but with mastery cap of 2 instead of 5"""
```

---

## 9. Database & Migration Strategy

### Initialization Flow (`backend/app/database.py`)

1. **Create Tables**: `Base.metadata.create_all()`
2. **Add Missing Columns**: Handles schema evolution for SQLite
3. **Backfill Data**: 
   - Parse existing feedback scores
   - Auto-extract scores from PDF attachments
   - Generate AI summaries for homeworks
4. **Seed Data**: Load `writing_materials_seed.json` if table empty

### Connection String
```
sqlite+aiosqlite:///backend/data/ielts_copilot.db
```

---

## 10. Key Configuration Files

### Backend Config (`backend/app/config.py`)
```python
DATABASE_URL = f"sqlite+aiosqlite:///backend/data/ielts_copilot.db"
UPLOAD_DIR = backend/data/uploads
MAX_FILE_SIZE = 50MB
```

### Settings Schema (`backend/app/schemas/setting.py`)
```python
llm_providers: dict         # { "provider": { "api_key": "", "api_base": "", "models": [] } }
default_model: str          # "openai/qwen-turbo-2024-11-01"
context_window_size: int    # Default 20 messages
stream_enabled: bool        # Enable streaming responses
speech_providers: dict      # TTS/STT providers
```

### Frontend API Config (`frontend/lib/api.ts`)
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
```

---

## 11. Related Models & Services

### Message & Conversation
- `backend/app/models/conversation.py` - Conversation sessions
- `backend/app/models/message.py` - Messages in conversation
- `backend/app/routers/messages.py` - Message handling with LLM integration

### Agents (AI Assistants)
- `backend/app/models/agent.py`
- Pre-configured agents:
  - Main Copilot (multi-agent router)
  - Writing Assistant (反馈整理)
  - Writing Coach (全程辅导)
  - Speaking Assistant
  - Reading/Listening Assistants

### Other Learning Materials
- `WritingTemplate` - 句型背诵 (essay sentence patterns)
- `ListeningPractice` - 听力精听
- `SpeakingCorrection` - 口语纠错
- `Vocabulary` - 单词学习

---

## 12. Tech Stack Summary

| Layer | Technology | Details |
|-------|-----------|---------|
| **Backend** | FastAPI | Async/await, CORS middleware |
| **ORM** | SQLAlchemy 2.0 | Async ORM with type hints |
| **Database** | SQLite | `aiosqlite` driver for async |
| **AI/LLM** | Alibaba Qwen | OpenAI-compatible API wrapper |
| **Serialization** | Pydantic v2 | Type validation |
| **Frontend** | Next.js 14+ | App directory (React 18+) |
| **UI Components** | shadcn/ui | TailwindCSS-based |
| **HTTP Client** | Native fetch | No axios/requests |
| **State** | React hooks + localStorage | Simple state management |
| **Styling** | TailwindCSS | Utility-first CSS |

---

## 13. File Locations Reference

| Purpose | Path |
|---------|------|
| Material Model | `backend/app/models/writing_material.py` |
| Material Router | `backend/app/routers/writing_materials.py` |
| Seed Data | `backend/app/data/writing_materials_seed.json` |
| Frontend Page | `frontend/app/writing-practice/page.tsx` |
| API Client | `frontend/lib/api.ts` |
| Types | `frontend/types/index.ts` |
| Database | `backend/data/ielts_copilot.db` |
| App Entry | `backend/app/main.py` |
| Config | `backend/app/config.py` |

---

## 14. Key Insights

1. **Material Structure**: 
   - Core: Topic → Direction → Stance/Angle → Reasoning Chain → Example
   - All content bilingual (Chinese + English keywords)
   - Linked to keywords table for vocabulary extraction

2. **Learning Flow**:
   - Daily: New materials (4 per day) → Mark seen → Enter review queue
   - Flashcard: Spaced repetition with SM-2 algorithm
   - Dictation: Translation practice (Chinese → English downgrade)
   - Stats: Progress visualization

3. **LLM Integration**:
   - Used for: Scoring user responses, generating feedback, extraction
   - Provider: Alibaba Qwen (via OpenAI-compatible wrapper)
   - Configurable: Users can set API key via settings UI

4. **Database Strategy**:
   - Single SQLite file for simplicity
   - Async ORM for better concurrency
   - Migration-friendly column addition
   - Seed data auto-imported on first run

5. **Frontend Architecture**:
   - Component-based tabs within single page
   - Optimistic UI updates
   - LocalStorage for temporary state
   - Type-safe API calls via Pydantic schemas
