# Quick Start Guide - Understanding the Codebase

## 🎯 For Those Who Want to Understand It All Fast

### 5-Minute Overview
The IELTS Copilot is an AI-powered learning platform with:
- **Backend**: FastAPI + SQLAlchemy (Python, async)
- **Frontend**: Next.js + React + TailwindCSS
- **Core Feature**: "素材" (essay materials) - bilingual learning materials with SM-2 spaced repetition
- **AI**: Alibaba Qwen (LLM) for scoring, feedback, and content generation

### 30-Minute Deep Dive

**What's a "素材" (Material)?**
```
素材 = A structured essay argument consisting of:
  ├─ Topic (教育, 科技, etc.)
  ├─ Direction (大学应该免费吗？)
  ├─ Stance (正方/反方 = pro/con)
  ├─ Angle (社会公平, 国家发展)
  ├─ Reasoning Chain (中文) + English keywords
  └─ Example (中文) + English keywords

Example:
  Topic: Education
  Direction: Should university be free?
  Stance: Pro
  Angle: Social Equality
  Reasoning: "消除经济障碍 → 寒门子弟也能读大学 → 缩小贫富差距"
  Example: "北欧国家（瑞典、挪威）免学费..."
```

**Learning Modes**:
1. **Daily** - View new materials (4 per day)
2. **Flashcard** - Spaced repetition with flip cards
3. **Downgrade** - Translate Chinese to English
4. **Library** - Browse all materials
5. **Stats** - Track progress

**SM-2 Algorithm** (Spaced Repetition):
- Mastery levels: 0 (new) → 1-4 (learning) → 5 (mastered)
- Review intervals: capped at 7 days
- User feedback: 不会 (0) → 模糊 (1) → 会了 (2) → 很熟 (3)

---

## 📁 File Structure Essentials

```
KEY FILES YOU'LL WORK WITH:

Backend (Python):
├─ backend/app/models/writing_material.py
│  └─ WritingMaterial, WritingMaterialKeyword, DowngradeAttempt
├─ backend/app/routers/writing_materials.py
│  └─ All API endpoints + SM-2 logic
├─ backend/app/data/writing_materials_seed.json
│  └─ Sample materials (edit here to add new content)
└─ backend/app/database.py
   └─ Database initialization

Frontend (React/TypeScript):
├─ frontend/app/writing-practice/page.tsx
│  └─ Main UI - tabs, components, API calls
├─ frontend/lib/api.ts
│  └─ API client methods
└─ frontend/types/index.ts
   └─ TypeScript interfaces

Database:
└─ backend/data/ielts_copilot.db
   └─ SQLite file (auto-created on startup)
```

---

## 🚀 Quick Tasks

### Task 1: Add New Materials
**File**: `backend/app/data/writing_materials_seed.json`

```json
{
  "materials": [
    {
      "topic": "environment",
      "topic_cn": "环保",
      "direction": "塑料袋应该被禁止吗？",
      "direction_index": 1,
      "stance": "pro",
      "stance_label": "正方",
      "angle": "环境保护",
      "angle_index": 1,
      "reasoning_chain": "降低塑料污染 → 减少海洋生物死亡 → 生态系统恢复",
      "example": "中国禁止一次性塑料袋后，海洋垃圾减少30%"
    }
  ],
  "keywords": [
    {
      "topic": "environment",
      "direction_index": 1,
      "cn": "塑料污染",
      "en": "plastic pollution",
      "level": "basic"
    }
  ]
}
```

### Task 2: Modify Daily Material Count
**File**: `frontend/app/writing-practice/page.tsx` (Line ~910)

```typescript
// Change this:
const newMaterials = await api.getWritingMaterialsNewToday(4);
// To:
const newMaterials = await api.getWritingMaterialsNewToday(8);
```

### Task 3: Change SM-2 Parameters
**File**: `backend/app/routers/writing_materials.py` (Function: `_sm2_update_material`)

```python
# Max mastery level (currently 5):
m.mastery_level = min(5, (m.mastery_level or 0) + 1)

# Max review interval (currently 7):
m.interval_days = min(7, m.interval_days)
```

### Task 4: Add LLM API Key
**Frontend**: Go to Settings → Input DashScope API key for Qwen

The system will use this for:
- Scoring downgrade answers
- Generating feedback
- Evaluating user responses

---

## 🔄 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ User opens: http://localhost:3000/writing-practice          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Frontend (Next.js/React)                                    │
│ - WritingPracticePage loads MaterialTab                    │
│ - Calls: api.getWritingMaterialsNewToday(4)               │
└─────────────────────────────────────────────────────────────┘
                            │
                    (HTTP GET request)
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend (FastAPI)                                           │
│ @router.get("/new-today")                                   │
│ - Query: WHERE mastery_level = 0 LIMIT 4                   │
│ - Return: [Material1, Material2, ...]                      │
└─────────────────────────────────────────────────────────────┘
                            │
                    (JSON response)
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Database (SQLite)                                           │
│ - Read from: writing_materials table                       │
└─────────────────────────────────────────────────────────────┘
                            │
                    (return results)
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Frontend renders materials                                  │
│ User clicks: "已看，加入复习"                               │
│ Calls: api.reviewWritingMaterial(id, quality=2)           │
└─────────────────────────────────────────────────────────────┘
                            │
                    (HTTP POST request)
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend                                                     │
│ @router.post("/{id}/review")                              │
│ - Load material from DB                                    │
│ - SM-2 update: _sm2_update_material(material, quality=2) │
│ - Save to DB                                              │
│ - Return updated material                                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Database                                                    │
│ UPDATE writing_materials SET                               │
│   mastery_level = 1,                                       │
│   ease_factor = 2.5,                                       │
│   interval_days = 2,                                       │
│   next_review_at = 2024-05-11 08:00                       │
│ WHERE id = 'uuid-123'                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Constants & Configurable Values

### Mastery Levels
```
0 = 新 (New - never learned)
1 = 模糊 (Vague - learning)
2 = 认识 (Recognize)
3 = 熟练 (Familiar)
4 = (Learning intermediate)
5 = 精通 (Mastered - final level)
```

### Quality Ratings (User Feedback)
```
0 = 不会 (Don't know)
1 = 模糊 (Vague)
2 = 会了 (Got it) ← Most common
3 = 很熟 (Very familiar)
```

### Daily Limits
```
frontend/app/writing-practice/page.tsx:
  - New materials per day: 4 (line ~910)
  - Can be customized per learning mode
```

### Intervals (Days Until Next Review)
```
Min: 1 day
Max: 7 days (capped)
Calculation: interval = round(previous_interval * ease_factor)
```

### Ease Factor (SM-2)
```
Default: 2.5
Min: 1.3
Formula: ef = ef + 0.1 - (3 - quality) * 0.08
Updates:
  - quality 0-1: ef -= 0.2
  - quality 2: ef += 0.08
  - quality 3: ef += 0.1
```

---

## 📊 Database Schema (Simplified)

```sql
-- Main table
CREATE TABLE writing_materials (
  id TEXT PRIMARY KEY,
  topic TEXT,
  direction TEXT,
  stance TEXT (pro/con),
  angle TEXT,
  reasoning_chain TEXT,
  reasoning_chain_en TEXT,
  example TEXT,
  example_en TEXT,
  mastery_level INT (0-5),
  review_count INT,
  correct_count INT,
  ease_factor FLOAT,
  interval_days INT (≤7),
  next_review_at DATETIME,
  last_reviewed_at DATETIME,
  first_learned_at DATETIME,
  created_at DATETIME
);

-- Keywords
CREATE TABLE writing_material_keywords (
  id TEXT PRIMARY KEY,
  topic TEXT,
  direction_index INT,
  cn TEXT,
  en TEXT,
  level TEXT (basic/advanced),
  mastery_level INT (0-2),
  -- ...SM-2 fields
);

-- Downgrade attempts
CREATE TABLE downgrade_attempts (
  id TEXT PRIMARY KEY,
  chinese TEXT,
  answer TEXT,
  score INT,
  correct INT,
  feedback TEXT,
  source_material_id TEXT FK,
  created_at DATETIME
);
```

---

## 🔌 API Endpoints (Cheat Sheet)

```
GET  /api/writing-materials                    # List all
GET  /api/writing-materials/stats              # Summary stats
GET  /api/writing-materials/new-today?limit=4  # New to learn
GET  /api/writing-materials/learned-today      # Already learned
GET  /api/writing-materials/due?limit=20       # Due for review

POST /api/writing-materials/{id}/review        # Mark as reviewed
      Body: { quality: 0-3 }

POST /api/writing-materials/{id}/check         # Check answer
      Body: { answer: string, mode: "reasoning"|"example" }

GET  /api/writing-materials/downgrade-sentences    # Get sentences to translate
POST /api/writing-materials/downgrade-check        # Check downgrade answer
      Body: { chinese: string, answer: string, source_material_id?: string }

GET  /api/writing-materials/keywords           # Get keywords
POST /api/writing-materials/keywords/{id}/review   # Review keyword
```

---

## 🧪 Testing Locally

### 1. Start Backend
```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Start Frontend
```bash
cd frontend
npm run dev
# Opens: http://localhost:3000
```

### 3. Test API
```bash
# Get materials
curl http://localhost:8000/api/writing-materials

# Get stats
curl http://localhost:8000/api/writing-materials/stats

# Get new materials for today
curl http://localhost:8000/api/writing-materials/new-today

# Mark a material as reviewed
curl -X POST http://localhost:8000/api/writing-materials/uuid-123/review \
  -H "Content-Type: application/json" \
  -d '{"quality": 2}'
```

### 4. Database
```bash
# View database (requires sqlite3 CLI)
sqlite3 backend/data/ielts_copilot.db

# Common queries:
sqlite> SELECT COUNT(*) FROM writing_materials;
sqlite> SELECT * FROM writing_materials WHERE mastery_level = 0 LIMIT 1;
sqlite> SELECT * FROM writing_materials WHERE next_review_at IS NOT NULL LIMIT 5;
```

---

## 🎯 Common Customizations

### Change Color Scheme
**File**: `frontend/tailwind.config.ts`
- All colors use TailwindCSS utilities
- Example: `bg-purple-500` for purple

### Add New Learning Mode
1. Add function in `frontend/app/writing-practice/page.tsx`
2. Add sub-tab button in main tab bar
3. Create backend endpoint if needed in `backend/app/routers/writing_materials.py`

### Modify Seed Data Structure
1. Edit `backend/app/data/writing_materials_seed.json`
2. Update model fields if needed in `backend/app/models/writing_material.py`
3. Restart backend (will auto-migrate)

### Change LLM Provider
**File**: `backend/app/main.py` (line ~170)
```python
"llm_providers": {
    "openai": {  # Change provider name
        "name": "Custom Provider",
        "api_base": "https://your-api.com/v1",
        "models": ["model-1", "model-2"]
    }
}
```

---

## 📚 Documentation Files Created

1. **CODEBASE_EXPLORATION.md** - Complete technical overview
2. **MATERIALS_ARCHITECTURE.md** - Data flow and structure details
3. **API_REFERENCE.md** - All API endpoints with examples
4. **QUICK_START_GUIDE.md** - This file

---

## ❓ Common Questions

**Q: How are materials stored?**
A: SQLite database in `backend/data/ielts_copilot.db`. Auto-created on startup.

**Q: How does spaced repetition work?**
A: SM-2 algorithm in `backend/app/routers/writing_materials.py`. User rates materials 0-3, which adjusts review intervals (1-7 days) and mastery level (0-5).

**Q: How is the downgrade practice scored?**
A: LLM (Alibaba Qwen) evaluates user's English translation of Chinese material. Requires API key in settings.

**Q: Can I add my own materials?**
A: Yes! Edit `backend/app/data/writing_materials_seed.json` and restart backend. Or create a UI for material creation.

**Q: What's the learning flow?**
A: New → Review (flashcard/downgrade) → Due (review again) → Mastered (maintenance at 7-day interval)

**Q: Can I change the SM-2 parameters?**
A: Yes, edit `_sm2_update_material()` function in `backend/app/routers/writing_materials.py`

---

## 🎓 Next Steps

1. **Understand the flow**: Read CODEBASE_EXPLORATION.md
2. **Explore the code**: Open files mentioned above
3. **Run it locally**: Follow Testing section
4. **Make a small change**: Try modifying daily limit or seed data
5. **Build your feature**: Refer to API_REFERENCE.md

Good luck! 🚀

