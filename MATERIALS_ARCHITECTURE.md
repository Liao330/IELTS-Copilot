# Essay Materials (素材) - Architecture & Data Flow

## 1. Data Model Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                       WritingMaterial                           │
│                    (大作文素材 - Core)                           │
├─────────────────────────────────────────────────────────────────┤
│ id (UUID)                                                       │
│ topic, direction, stance, angle                                │
│ reasoning_chain (中文) + reasoning_chain_en (英文关键词)        │
│ example (中文) + example_en (英文关键词)                        │
│ SM-2: mastery_level(0-5), interval_days(≤7), ease_factor      │
│ Timestamps: created, first_learned, last_reviewed, next_review│
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
┌──────────────────────┐    ┌──────────────────────┐
│ WritingMaterialKWD   │    │  DowngradeAttempt    │
│ (关键词库)           │    │  (降级练习记录)      │
├──────────────────────┤    ├──────────────────────┤
│ id, topic            │    │ id                   │
│ direction_index      │    │ chinese (原文)       │
│ cn, en               │    │ answer (用户答案)    │
│ level (basic/adv)    │    │ score, correct       │
│ SM-2: mastery(0-2)   │    │ feedback             │
└──────────────────────┘    │ source_material_id FK│
                            └──────────────────────┘

┌──────────────────────────────────┐
│    ContextMaterial               │
│  (对话中的材料引用)              │
├──────────────────────────────────┤
│ id, conversation_id FK           │
│ material_type (essay/speaking...)│
│ title, content                   │
│ source_message_id FK             │
└──────────────────────────────────┘
```

## 2. Material Structure Hierarchy

```
Topic (主题)
  ├─ education (教育)
  ├─ technology (科技)
  ├─ environment (环保)
  └─ ... (20+ more)
      │
      └─ Direction (方向/问题)
           ├─ Direction 1: "大学应该免费吗？"
           ├─ Direction 2: "网课能否取代传统课堂？"
           └─ Direction N: ...
               │
               └─ Stance (立场)
                    ├─ Pro (正方)
                    │  └─ Angle 1: "社会公平"
                    │     └─ Material (素材)
                    │        ├─ reasoning_chain (理由链)
                    │        ├─ example (例子)
                    │        └─ keywords (关键词)
                    │
                    └─ Con (反方)
                       └─ Angle 1: "财政压力"
                          └─ Material (素材)
```

## 3. Learning Flow State Machine

```
                  ┌───────────────────────────────┐
                  │   NEW MATERIAL               │
                  │ (mastery_level = 0)          │
                  │ (review_count = 0)           │
                  └─────────┬─────────────────────┘
                            │
                    User marks "已看，加入复习"
                  (reviewWritingMaterial(quality=2))
                            │
                            ▼
          ┌─────────────────────────────────────┐
          │  LEARNING - Mastery Level 1-4       │
          │  quality < 2: retry next day         │
          │  quality >= 2: interval increases    │
          └─────────────────────────────────────┘
                            │
                  Multiple successful reviews
                  (quality = 2-3)
                            │
                            ▼
          ┌─────────────────────────────────────┐
          │  MASTERED - Mastery Level 5         │
          │  Max interval: 7 days (capped)      │
          │  Max ease_factor evolution          │
          └─────────────────────────────────────┘

Quality Scale (from user interaction):
  0 = 不会 (Don't know)   → interval=1, mastery--, ease--
  1 = 模糊 (Vague)        → interval=1, mastery--,  ease--
  2 = 会了 (Got it)       → interval*ease, mastery++
  3 = 很熟 (Very familiar)→ interval*ease*1.1, mastery++
```

## 4. API Data Flow

```
┌─ Frontend ───────────────────────────────────────────────────┐
│                                                               │
│  MaterialDailySubTab()                                       │
│    │                                                         │
│    ├─ api.getWritingMaterialsNewToday(4)                    │
│    │   └─ GET /api/writing-materials/new-today?limit=4     │
│    │       ↓ Returns: [Material, ...]                       │
│    │                                                         │
│    ├─ User clicks "已看，加入复习"                           │
│    │   └─ api.reviewWritingMaterial(id, quality=2)         │
│    │       └─ POST /api/writing-materials/{id}/review      │
│    │           Body: { quality: 2 }                         │
│    │           ↓ Backend: SM-2 update                       │
│    │           ↓ Returns: updated material                  │
│    │                                                         │
│    ├─ api.getWritingMaterialsLearned()                      │
│    │   └─ GET /api/writing-materials/learned-today         │
│    │       ↓ Returns: [Material, ...]                       │
│    │                                                         │
│    └─ api.getWritingMaterialStats()                         │
│        └─ GET /api/writing-materials/stats                 │
│            ↓ Returns: { total, mastered, due, ... }        │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─ Backend (FastAPI) ──────────────────────────────────────────┐
│                                                               │
│ @router.get("/new-today")                                   │
│   → Query: WritingMaterial where mastery_level == 0         │
│            Limit 4 items                                    │
│            Order by sort_order                              │
│                                                             │
│ @router.post("/{id}/review")                                │
│   ← Body: { quality: int }                                  │
│   → Load material from DB                                   │
│   → Call _sm2_update_material(material, quality)            │
│      - Update: mastery_level, ease_factor                   │
│      - Calculate: next_review_at, interval_days             │
│   → Save to DB                                              │
│   → Return updated material                                 │
│                                                             │
│ @router.get("/stats")                                       │
│   → Count by mastery_level                                  │
│   → Count materials due today                               │
│   → Aggregate by topic                                      │
│   → Return: StatsOut                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─ Database (SQLite) ──────────────────────────────────────────┐
│                                                               │
│ SELECT * FROM writing_materials                             │
│ WHERE mastery_level = 0                                     │
│ ORDER BY sort_order LIMIT 4                                 │
│                                                             │
│ UPDATE writing_materials                                    │
│ SET mastery_level = ?, ease_factor = ?,                    │
│     interval_days = ?, next_review_at = ?,                 │
│     review_count = ?, correct_count = ?                    │
│ WHERE id = ?                                                │
│                                                             │
│ SELECT COUNT(*) FROM writing_materials                     │
│ WHERE mastery_level >= 5                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 5. Frontend UI Component Tree

```
WritingPracticePage (Main Page)
│
├─ Tab Selection: template | material | speaking
│
└─ When mainTab === "material"
   │
   ├─ Sub-tabs: m-daily | m-flashcard | m-dictation | m-library | m-stats | m-downgrade
   │
   ├─ MaterialDailySubTab (每日学习)
   │  ├─ Section: Stats Bar
   │  │  └─ Display: total, mastered, learned_today, due_today, tomorrow_due, keywords
   │  │
   │  ├─ Section: 待学素材 (New to Learn)
   │  │  └─ For each material:
   │  │     ├─ Header: [topic] · direction · [stance·angle]
   │  │     ├─ Content:
   │  │     │  ├─ 📎 理由链（中文） + ✏️ 降级英文
   │  │     │  └─ 📖 例子（中文） + 英文版本
   │  │     └─ Action: [已看，加入复习]
   │  │
   │  └─ Section: 今日已学 (Already Learned Today)
   │     └─ Compact list of reviewed items
   │
   ├─ MaterialFlashcardSubTab (闪卡复习)
   │  ├─ Progress: "N / Total"
   │  ├─ Flip Card (clickable):
   │  │  ├─ Front (Chinese): reasoning_chain + example
   │  │  └─ Back (English): reasoning_chain_en + example_en
   │  └─ Action Buttons (after flip):
   │     ├─ [不会]   (quality=0)
   │     ├─ [模糊]   (quality=1)
   │     └─ [记住了] (quality=3)
   │
   ├─ MaterialDictationSubTab (降级练习/默写)
   │  ├─ Display: Chinese (reasoning or example)
   │  ├─ Input: User types English translation
   │  └─ Action: [提交]
   │     → LLM evaluation
   │     → Feedback + score
   │     → Save DowngradeAttempt
   │
   ├─ MaterialLibrarySubTab (素材库浏览)
   │  ├─ Filter: By topic, stance, angle
   │  └─ Display: All materials with metadata
   │
   └─ MaterialStatsSubTab (统计)
      ├─ Overall progress (pie/bar chart)
      ├─ By topic breakdown
      └─ Learning timeline
```

## 6. SM-2 Algorithm Implementation Detail

```python
def _sm2_update_material(m: WritingMaterial, quality: int):
    """
    Inputs:
      m.mastery_level (0-5)
      m.review_count
      m.ease_factor (default 2.5)
      m.interval_days
      quality (0-3)
    
    Logic:
      if quality < 2:  # 不会 or 模糊
        interval = 1 day
        ease_factor -= 0.2 (minimum 1.3)
        if quality == 0:
          mastery_level -= 1 (minimum 0)
      
      else:  # 会了 or 很熟
        if review_count == 0:
          interval = 1 day
        elif review_count <= 2:
          interval = 2 days
        else:
          interval = round(interval * ease_factor)
        
        ease_factor = ease_factor + 0.1 - (3 - quality) * 0.08
        ease_factor = max(1.3, ease_factor)
        mastery_level += 1 (cap at 5)
    
    interval_days = min(7, interval)  # CAP AT 7 DAYS
    next_review_at = now + timedelta(days=interval_days)
    review_count += 1
    if quality >= 2:
      correct_count += 1
    last_reviewed_at = now
    if not first_learned_at:
      first_learned_at = now
    
    Outputs:
      Updated m (all fields)
      → Saved to DB
      → Returned to frontend
    """
```

## 7. Seed Data Loading Process

```
FastAPI Startup (main.py:lifespan)
│
├─ init_db()
│  ├─ Base.metadata.create_all()
│  │  └─ Creates tables if not exist
│  │
│  ├─ _migrate_add_columns()
│  │  └─ ALTER TABLE ... ADD COLUMN (if not exists)
│  │
│  ├─ _backfill_feedback_scores()
│  ├─ _backfill_listening_reading_scores()
│  ├─ _backfill_homework_summaries()
│  │
│  └─ _seed_writing_templates()
│     └─ If table empty: load from .../data/writing_templates_seed.json
│
└─ seed_data()
   │
   ├─ Create agents if not exist
   ├─ Initialize settings (default_model, llm_providers, etc.)
   │
   └─ [WritingMaterial Seeding]
      ├─ Check if writing_materials table is empty
      ├─ If empty: load writing_materials_seed.json
      ├─ If empty: load writing_material_keywords from seed
      │
      └─ For each material in seed:
         ├─ Generate new UUID
         ├─ db.add(WritingMaterial(...))
         │
         └─ db.commit()
```

## 8. Downgrade Practice (降级) Workflow

```
User selects: MaterialDictationSubTab
│
├─ api.getDowngradeSentences()
│  └─ GET /api/writing-materials/downgrade-sentences
│     → Query: WritingMaterial where mastery_level in (1,2)
│     → Extract: reasoning_chain + example from these materials
│     → Return: [{ id, chinese, ... }, ...]
│
├─ For each sentence displayed:
│  └─ User types English answer in textarea
│
├─ User clicks: [提交]
│  └─ api.checkDowngrade(chinese, answer, source_material_id?)
│     └─ POST /api/writing-materials/downgrade-check
│         Body: { chinese, answer, source_material_id }
│         │
│         ├─ Backend receives
│         ├─ Call LLM to score answer
│         │  (Using Qwen model via OpenAI API)
│         │
│         ├─ Create DowngradeAttempt record:
│         │  ├─ chinese (original)
│         │  ├─ answer (user's response)
│         │  ├─ score (LLM score 0-100)
│         │  ├─ feedback (LLM feedback)
│         │  ├─ reference_answer (optional)
│         │  └─ source_material_id
│         │
│         └─ Return: { score, feedback, correct, ... }
│
├─ Frontend displays: feedback + score
│
└─ Retry option:
   └─ api.getDowngradeRetry()
      → Query: DowngradeAttempt where correct == 0
      → Return: Failed attempts for retry
```

## 9. Keyword Learning Path

```
WritingMaterial (with linked keywords)
│
├─ Extract keywords from: reasoning_chain, example
├─ Store in: WritingMaterialKeyword table
│
└─ User learns:
   │
   ├─ Keyword lookup: api.getWritingMaterialKeywords()
   │  └─ GET /api/writing-materials/keywords?topic=education&direction_index=1
   │
   ├─ Daily due: api.getWritingMaterialKeywordsDue(limit=20)
   │  └─ GET /api/writing-materials/keywords/due?limit=20
   │
   └─ Review: api.reviewWritingMaterialKeyword(id, quality)
      └─ POST /api/writing-materials/keywords/{id}/review
         → SM-2 update (mastery capped at 2, not 5)
         → Return updated keyword
```

## 10. Context Material (对话中的素材) Usage

```
User sends message to Conversation/Agent
│
├─ Message content: user's essay draft, speaking answer, etc.
│
├─ Agent processes: identifies learning material
│
├─ System creates: ContextMaterial record
│  ├─ conversation_id: link to conversation
│  ├─ material_type: "essay" | "speaking_answer" | ...
│  ├─ title: "User's Environment Essay Draft"
│  ├─ content: Full essay text
│  ├─ source_message_id: Which message created this
│  │
│  └─ Later in conversation:
│     └─ Agent can reference: "#material-1" in summary
│     └─ Sub-agent fetches full content as needed
│     └─ Avoids: sending full text in every message → saves tokens
│
└─ User benefits:
   ├─ Rich context maintained across conversation
   ├─ LLM sees material reference instead of full text
   └─ Better context window usage
```

---

## Quick Reference

### Key Concepts

| Term | Meaning | Example |
|------|---------|---------|
| **Topic** | 主题 | education, technology |
| **Direction** | 题目方向 | "大学应该免费吗？" |
| **Stance** | 立场 | pro (正方), con (反方) |
| **Angle** | 论证角度 | "社会公平", "国家发展" |
| **Reasoning Chain** | 理由链 | "消除障碍 → 寒门子弟读大学 → 社会流动" |
| **Example** | 例子 | "北欧国家免学费..." |
| **Downgrade** | 降级 | 中文 → 英文关键词转换练习 |
| **Mastery Level** | 掌握度 | 0 (new) - 5 (mastered) |
| **Ease Factor** | SM-2难度系数 | default 2.5, range [1.3, ∞) |
| **Interval** | 复习间隔 | days until next review (capped 7) |

### File Map (What to Edit for Changes)

| If you want to... | Edit this file |
|------------------|----------------|
| Add new materials | `backend/app/data/writing_materials_seed.json` |
| Change SM-2 algorithm | `backend/app/routers/writing_materials.py` → `_sm2_update_material()` |
| Modify daily material count | `frontend/app/writing-practice/page.tsx` → `api.getWritingMaterialsNewToday(4)` |
| Change UI display format | `frontend/app/writing-practice/page.tsx` → `MaterialDailySubTab()` |
| Add new learning mode | `frontend/app/writing-practice/page.tsx` + new API endpoint |
| Change LLM for scoring | `backend/app/routers/writing_materials.py` → check downgrade-check endpoint |

