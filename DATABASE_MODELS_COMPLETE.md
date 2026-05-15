# IELTS Copilot - Complete Database Models Reference

## Overview

This document provides comprehensive coverage of all 27 SQLAlchemy ORM model classes across 17 model files in the IELTS Copilot backend, including a critical fix for database initialization.

---

## Database Initialization Fix (Critical)

**File**: `backend/app/database.py`
**Issue**: Listening practice models were missing from `init_db()` imports
**Status**: ✅ FIXED (commit e727d71)

### Before:
```python
async def init_db():
    from app.models import Agent, Conversation, Message, File, Note, Setting, Homework, ...
    # Missing: ListeningPracticeSession, ListeningPracticeSentence, etc.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

### After:
```python
async def init_db():
    from app.models import Agent, Conversation, Message, File, Note, Setting, Homework, ...
    from app.models.listening_practice import ListeningPracticeSession, ListeningPracticeSentence, ListeningPracticeGenerated, ListeningDictationAttempt, ListeningDiscoveredWord  # ✅ ADDED
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

**Impact**: Without this fix, the listening practice tables would not be created during database initialization, causing runtime errors when the application tries to interact with those tables.

---

## Complete Model Inventory

### 1. **Chat & Conversation Models** (4 models)

#### Agent (`backend/app/models/agent.py`)
```python
class Agent(Base):
    __tablename__ = "agents"
    
    id: str                    # UUID primary key
    name: str                  # Agent name (e.g., "Writing Assistant")
    description: str          # Description
    system_prompt: str        # System prompt for LLM
    created_at: datetime
```
**Purpose**: Define available AI agents (IELTS Copilot, Writing Assistant, Speaking Assistant, etc.)

#### Conversation (`backend/app/models/conversation.py`)
```python
class Conversation(Base):
    __tablename__ = "conversations"
    
    id: str                    # UUID
    agent_id: str              # FK → agents.id
    title: str                 # User-defined title
    model_name: str            # LLM model used (qwen-turbo, etc.)
    created_at: datetime
    updated_at: datetime
    
    # Relationships
    messages: List[Message]    # O2M
```

#### Message (`backend/app/models/message.py`)
```python
class Message(Base):
    __tablename__ = "messages"
    
    id: str                    # UUID
    conversation_id: str       # FK → conversations.id
    role: str                  # "user" | "assistant" | "system"
    content: str               # Message text
    attachments: str | null    # JSON: [{"file_id": "...", "filename": "..."}]
    token_count: int           # For billing/tracking
    routed_agent_id: str | null # Which agent handled this
    created_at: datetime
    
    # Relationships
    conversation: Conversation # M2O
```

#### File (`backend/app/models/file.py`)
```python
class File(Base):
    __tablename__ = "files"
    
    id: str                    # UUID
    filename: str              # Original filename
    filepath: str              # Storage path
    mime_type: str             # Content type
    size: int                  # File size in bytes
    text_content: str | null   # Extracted/OCR'd text
    uploaded_at: datetime
```
**Purpose**: Store uploaded files (PDFs, images, audio) with extracted text for processing

---

### 2. **Homework & Scoring Models** (3 models) ⭐ CRITICAL FOR SCORES

#### Homework (`backend/app/models/homework.py`)
```python
class Homework(Base):
    __tablename__ = "homeworks"
    
    id: str                    # UUID
    title: str                 # Assignment title
    category: str              # "writing" | "speaking" | "reading" | "listening"
    homework_date: date        # When homework was assigned
    description: str | null    # Notes/description
    file_id: str | null        # Legacy single file FK
    summary: str | null        # AI-generated structure summary
    summary_updated_at: datetime | null
    created_at: datetime
    updated_at: datetime
    
    # Relationships
    feedbacks: List[HomeworkFeedback]  # O2M (feedback scores)
    homework_files: List[HomeworkFile] # O2M (multiple files)
```

#### HomeworkFile (`backend/app/models/homework.py`)
```python
class HomeworkFile(Base):
    __tablename__ = "homework_files"
    
    id: str                    # UUID
    homework_id: str           # FK → homeworks.id (cascade delete)
    file_id: str               # FK → files.id
    created_at: datetime
    
    # Relationships
    homework: Homework         # M2O
```
**Purpose**: Many-to-many mapping between homeworks and files

#### HomeworkFeedback (`backend/app/models/homework.py`) ⭐ SCORES TABLE
```python
class HomeworkFeedback(Base):
    __tablename__ = "homework_feedbacks"
    
    id: str                    # UUID
    homework_id: str           # FK → homeworks.id (cascade delete)
    feedback_type: str         # "ai_report" | "teacher_text" | "teacher_audio" | "teacher_image" | "auto_scores"
    content: str | null        # Text feedback
    file_id: str | null        # FK → files.id (for audio/image feedback)
    scores: str | null         # ⭐ JSON: Parsed IELTS scores (see schema below)
    created_at: datetime
    
    # Relationships
    homework: Homework         # M2O
```

**Scores JSON Format** (stored in `HomeworkFeedback.scores`):
```json
{
  "category": "speaking|writing|listening|reading",
  "overall": 7.5,
  "dimensions": [
    {
      "key": "FC|LR|GRA|PRON|TA|CC",
      "label": "流利度和连贯性",
      "label_en": "Fluency & Coherence",
      "score": 7.0
    }
  ],
  "raw_score": 30,
  "raw_total": 40,
  "parts": [
    {"part": 1, "correct": 10, "total": 10, "label": "Section 1"}
  ]
}
```

**Dimension Codes**:
- **Speaking**: FC (Fluency & Coherence), LR (Lexical Resource), GRA (Grammatical Range), PRON (Pronunciation)
- **Writing**: TA (Task Achievement), CC (Coherence & Cohesion), LR (Lexical Resource), GRA (Grammatical Range)
- **Listening/Reading**: Raw score → IELTS Band via conversion tables (0-9 scale)

---

### 3. **Writing Materials Models** (3 models) ⭐ TEE FRAMEWORK

#### WritingMaterial (`backend/app/models/writing_material.py`)
```python
class WritingMaterial(Base):
    """大作文素材 — 理由链+例子，5级mastery"""
    __tablename__ = "writing_materials"
    
    # Identity
    id: str                    # UUID
    
    # Topic Classification
    topic: str                 # "education", "technology", "environment", etc.
    topic_cn: str              # "教育", "科技", "环境"
    direction: str             # Question direction (e.g., "大学应该免费吗？")
    direction_index: int       # 1, 2, 3
    
    # Stance & Angle
    stance: str                # "pro" | "con"
    stance_label: str          # "正方" | "反方"
    angle: str                 # Argument angle (e.g., "社会公平")
    angle_index: int           # 1 | 2
    
    # TEE Content (Topic-Explanation-Example)
    topic_sentence: str | null          # T: Opinion sentence (Chinese)
    topic_sentence_en: str | null       # T: Opinion sentence (English)
    reasoning_chain: str                # E: Reasoning chain (→ separated, Chinese)
    reasoning_chain_en: str | null      # E: Reasoning (downgraded English)
    example: str                        # E: Example (Chinese)
    example_en: str | null              # E: Example keywords (English)
    
    # Memory Aid
    memory_anchor: str | null   # Memory device/anchor point
    sort_order: int
    
    # SM-2 Spaced Repetition (5-level mastery, capped 7 days)
    mastery_level: int         # 0=new, 1-5 mastery levels
    review_count: int
    correct_count: int
    ease_factor: float         # Default 2.5
    interval_days: int         # Max 7 days
    next_review_at: datetime | null
    last_reviewed_at: datetime | null
    first_learned_at: datetime | null
    
    created_at: datetime
```

#### WritingMaterialKeyword (`backend/app/models/writing_material.py`)
```python
class WritingMaterialKeyword(Base):
    """关键词中英对照表"""
    __tablename__ = "writing_material_keywords"
    
    id: str
    topic: str
    direction_index: int
    cn: str                    # Chinese keyword
    en: str                    # English translation
    level: str                 # "basic" | "advanced"
    sort_order: int
    
    # SM-2 (3-level)
    mastery_level: int         # 0=new, 1=hazy, 2=recognized
    review_count: int
    interval_days: int
    next_review_at: datetime | null
    last_reviewed_at: datetime | null
    first_learned_at: datetime | null
    
    created_at: datetime
```

#### DowngradeAttempt (`backend/app/models/writing_material.py`)
```python
class DowngradeAttempt(Base):
    """降级练习记录 (Chinese → Simple English translation attempts)"""
    __tablename__ = "downgrade_attempts"
    
    id: str
    chinese: str               # Original Chinese text
    answer: str                # User's English downgrade
    score: int                 # AI-assessed score (0-100)
    correct: int               # 1 = correct, 0 = incorrect
    reference_answer: str | null
    feedback: str | null
    source_material_id: str | null  # FK to WritingMaterial
    needs_retry: int           # 1 = mark for retry
    retried: int               # 1 = already retried
    
    created_at: datetime
```

---

### 4. **Writing Templates Models** (2 models)

#### WritingTemplate (`backend/app/models/writing_template.py`)
```python
class WritingTemplate(Base):
    """IELTS写作句型/模板"""
    __tablename__ = "writing_templates"
    
    id: str
    category: str              # "map" | "process" | "data" | "essay"
    sub_category: str          # "overview" | "trend_rise" | "trend_fall"
    scene_cn: str              # Chinese usage scenario
    scene_detail: str | null   # Detailed scenario (for flashcards)
    template_en: str           # English template with blanks
    template_cn: str | null    # Chinese translation
    example_en: str | null     # Complete example sentence
    note: str | null           # Usage notes
    difficulty: int            # 1=easy, 2=medium, 3=hard
    sort_order: int
    
    # SM-2 Spaced Repetition
    mastery_level: int         # 0=new, 1=blur, 2=recognize, 3=fluent
    review_count: int
    correct_count: int
    ease_factor: float         # Default 2.5
    interval_days: int
    next_review_at: datetime | null
    last_reviewed_at: datetime | null
    first_learned_at: datetime | null
    
    # Cloze Practice
    blank_slots: str | null    # JSON: AI-extracted fill-in-blanks
    slots_passed: str | null   # JSON: [slot_index, ...] passed
    
    created_at: datetime
```

#### TemplateVocab (`backend/app/models/writing_template.py`)
```python
class TemplateVocab(Base):
    """句型关键词汇 — Streak-based flashcard review"""
    __tablename__ = "template_vocab"
    
    id: str
    word_en: str               # English word/phrase
    meaning_cn: str            # Chinese meaning
    example_sentence: str | null
    category: str              # "data" | "map" | "process" | "essay"
    sort_order: int
    
    # Streak-based Mastery (3-day consecutive "fluent")
    status: str                # "active" | "passed"
    streak_days: int
    last_reviewed_at: datetime | null
    last_result: str | null    # "fluent" | "hesitant"
    passed_at: datetime | null
    
    created_at: datetime
```

---

### 5. **Speaking Models** (2 models)

#### SpeakingCorrection (`backend/app/models/speaking_correction.py`)
```python
class SpeakingCorrection(Base):
    """口语纠错条目 — Cumulative review (3 consecutive days → pass)"""
    __tablename__ = "speaking_corrections"
    
    id: str
    correct_text: str          # Correct version
    error_type: str            # "grammar" | "vocabulary" | "pronunciation" | "expression"
    
    # Cumulative Review Status
    status: str                # "active" | "passed"
    streak_days: int           # Consecutive fluent days
    last_reviewed_at: datetime | null
    last_result: str | null    # "fluent" | "hesitant"
    
    created_at: datetime
    passed_at: datetime | null
```

#### SpeakingPhrase (`backend/app/models/speaking_phrase.py`)
```python
class SpeakingPhrase(Base):
    """口语降级表达 — Chinese → Simple English downgrade"""
    __tablename__ = "speaking_phrases"
    
    id: str
    category: str              # feelings|reasons|people|places|changes|opinions|frequency|habits|difficulties|filler
    cn: str                    # Chinese expression
    en: str                    # Simple English downgrade
    
    # Streak-based Mastery (same as SpeakingCorrection)
    status: str                # "active" | "passed"
    streak_days: int
    last_reviewed_at: datetime | null
    last_result: str | null    # "fluent" | "hesitant"
    
    created_at: datetime
    passed_at: datetime | null
```

---

### 6. **Listening Practice Models** (5 models) ⭐ GRADIENT PRACTICE

#### ListeningPracticeSession (`backend/app/models/listening_practice.py`)
```python
class ListeningPracticeSession(Base):
    """精听练习会话 — One test paper review"""
    __tablename__ = "listening_practice_sessions"
    
    id: str
    title: str                 # Session title
    note: str | null           # User notes
    cleanup_summary: str | null # AI review summary
    study_duration_seconds: int # Cumulative study time
    duration_snapshot: int     # Start-of-day cumulative time
    snapshot_date: str | null  # YYYY-MM-DD (CST)
    
    homework_id: str | null    # FK → homeworks.id (optional)
    
    created_at: datetime
    updated_at: datetime
    
    # Relationships
    sentences: List[ListeningPracticeSentence]      # O2M
    discovered_words: List[ListeningDiscoveredWord] # O2M
```

#### ListeningPracticeSentence (`backend/app/models/listening_practice.py`)
```python
class ListeningPracticeSentence(Base):
    """Answer sentence — one sentence in session"""
    __tablename__ = "listening_practice_sentences"
    
    id: str
    session_id: str            # FK → listening_practice_sessions.id (cascade delete)
    original_text: str         # Original sentence
    translation: str | null    # Chinese translation
    order_index: int
    note: str | null           # User notes (context for AI)
    
    # Blocker Words (difficult pronunciation)
    blocker_words: str | null  # JSON: [{"word":"...", "start":N, "end":N, "vocab_word_id":"..."|null}]
    
    created_at: datetime
    updated_at: datetime
    
    # Relationships
    session: ListeningPracticeSession       # M2O
    generated_blocks: List[ListeningPracticeGenerated] # O2M
```

#### ListeningPracticeGenerated (`backend/app/models/listening_practice.py`)
```python
class ListeningPracticeGenerated(Base):
    """AI-generated gradient practice examples (cached)"""
    __tablename__ = "listening_practice_generated"
    # Unique constraint: (sentence_id, blocker_word)
    
    id: str
    sentence_id: str           # FK → listening_practice_sentences.id (cascade delete)
    blocker_word: str          # Normalized lowercase difficult word
    difficulty_type: str       # linking|weak_form|unfamiliar|deletion|similar_sound|other
    explanation: str           # Chinese pronunciation explanation
    
    # Gradient Examples (3 difficulty levels)
    examples: str              # JSON: [
                               #   {"text":"...", "translation":"...", "difficulty_level":1|2|3, "hint":"..."},
                               #   ...
                               # ]
    
    created_at: datetime
    
    # Relationships
    sentence: ListeningPracticeSentence    # M2O
    dictation_attempts: List[ListeningDictationAttempt] # O2M
```

#### ListeningDictationAttempt (`backend/app/models/listening_practice.py`)
```python
class ListeningDictationAttempt(Base):
    """Dictation attempt record"""
    __tablename__ = "listening_dictation_attempts"
    
    id: str
    generated_block_id: str    # FK → listening_practice_generated.id (cascade delete)
    example_index: int         # Which example (0-based)
    play_count: int            # How many times user played
    correct_count: int         # Correctly transcribed words
    total_count: int           # Total words in example
    accuracy_pct: int          # (correct_count / total_count) * 100
    
    missed_words: str | null   # JSON: ["word1", "word2"]
    user_answers: str | null   # JSON: ["answer1", "answer2", ...] (for display)
    
    created_at: datetime
    
    # Relationships
    generated_block: ListeningPracticeGenerated # M2O
```

#### ListeningDiscoveredWord (`backend/app/models/listening_practice.py`)
```python
class ListeningDiscoveredWord(Base):
    """Extended blocker words discovered during practice"""
    __tablename__ = "listening_discovered_words"
    
    id: str
    session_id: str            # FK → listening_practice_sessions.id (cascade delete)
    word: str
    note: str | null           # AI-generated explanation
    source: str                # "click" | "missed" | "ai_analyzed"
    
    created_at: datetime
    
    # Relationships
    session: ListeningPracticeSession # M2O
```

---

### 7. **Vocabulary Models** (2 models)

#### VocabularyWord (`backend/app/models/vocabulary.py`)
```python
class VocabularyWord(Base):
    """单词本条目"""
    __tablename__ = "vocabulary_words"
    
    id: str
    word: str                  # Word/phrase (indexed)
    phonetic: str | null       # IPA phonetics
    pos: str | null            # Part of speech (noun, verb, adj, etc.)
    meaning: str               # Chinese meaning
    example: str | null        # English example sentence
    example_cn: str | null     # Chinese translation of example
    synonyms: str | null       # JSON: ["word1", "word2"]
    note: str | null           # User notes
    category: str              # writing|speaking|reading|listening|general
    tags: str | null           # JSON: ["tag1", "tag2"]
    
    # Source Tracking
    source_conversation_id: str | null
    source_message_id: str | null
    
    # Encounter Tracking
    encounter_count: int       # Cumulative encounters
    
    # SM-2 Spaced Repetition
    mastery_level: int         # 0=new, 1=hazy, 2=recognized, 3=fluent
    review_count: int
    correct_count: int
    ease_factor: float         # Default 2.5
    interval_days: int
    next_review_at: datetime | null
    last_reviewed_at: datetime | null
    
    created_at: datetime
    updated_at: datetime
```

#### FavoriteSentence (`backend/app/models/vocabulary.py`)
```python
class FavoriteSentence(Base):
    """好词佳句 — Sentence favorites"""
    __tablename__ = "favorite_sentences"
    
    id: str
    content: str               # English sentence
    translation: str | null    # Chinese translation
    note: str | null           # Usage notes
    category: str              # writing|speaking|reading|listening|general
    tags: str | null           # JSON: ["tag1", "tag2"]
    
    # Source Tracking
    source_conversation_id: str | null
    source_message_id: str | null
    
    # Review Status
    mastery_level: int         # 0, 1, 2, 3
    review_count: int
    next_review_at: datetime | null
    last_reviewed_at: datetime | null
    
    created_at: datetime
    updated_at: datetime
```

---

### 8. **Utility Models** (8 models)

#### Note (`backend/app/models/note.py`)
```python
class Note(Base):
    """用户笔记"""
    __tablename__ = "notes"
    
    id: str
    title: str
    content: str
    category: str
    tags: str | null           # JSON
    source_conversation_id: str | null
    source_message_id: str | null
    created_at: datetime
    updated_at: datetime
```

#### Setting (`backend/app/models/setting.py`)
```python
class Setting(Base):
    """Key-value settings store"""
    __tablename__ = "settings"
    
    key: str                   # Primary key
    value: str                 # JSON value
```

#### ScheduleTask (`backend/app/models/schedule.py`)
```python
class ScheduleTask(Base):
    """日程任务"""
    __tablename__ = "schedule_tasks"
    
    id: str
    title: str
    description: str | null
    due_date: date
    due_time: str | null       # HH:MM format
    status: str                # pending|completed|cancelled
    priority: str              # low|medium|high
    category: str
    
    source: str | null         # Where task came from
    plan_tag: str | null       # Associated study plan tag
    
    created_at: datetime
    updated_at: datetime
```

#### FeedbackItem (`backend/app/models/feedback.py`)
```python
class FeedbackItem(Base):
    """User feedback/bug reports"""
    __tablename__ = "feedback_items"
    
    id: str
    type: str                  # "bug"|"feedback"|"feature_request"
    title: str
    content: str
    created_at: datetime
```

#### ContextMaterial (`backend/app/models/context_material.py`)
```python
class ContextMaterial(Base):
    """缓存上下文材料"""
    __tablename__ = "context_materials"
    
    id: str
    key: str                   # Query key
    material_type: str
    content: str               # Cached content
    created_at: datetime
    expires_at: datetime
```

#### DailyReportCache (`backend/app/models/daily_report_cache.py`)
```python
class DailyReportCache(Base):
    """Daily report caching"""
    __tablename__ = "daily_report_cache"
    
    id: str
    report_date: date          # CST date
    cache_key: str
    content: str               # Cached report
    include_notes: int         # 0 or 1 (boolean)
    created_at: datetime
    updated_at: datetime
```

---

## Database Initialization Flow

```python
# backend/app/database.py
async def init_db():
    # 1. Import all model classes (CRITICAL - ensures metadata registration)
    from app.models import Agent, Conversation, Message, File, Note, Setting, ...
    from app.models.feedback import FeedbackItem
    from app.models.schedule import ScheduleTask
    from app.models.writing_template import WritingTemplate, TemplateVocab
    from app.models.writing_material import WritingMaterial, WritingMaterialKeyword, DowngradeAttempt
    from app.models.speaking_correction import SpeakingCorrection
    from app.models.speaking_phrase import SpeakingPhrase
    from app.models.listening_practice import (  # ✅ FIXED IN commit e727d71
        ListeningPracticeSession, ListeningPracticeSentence, 
        ListeningPracticeGenerated, ListeningDictationAttempt, 
        ListeningDiscoveredWord
    )
    
    # 2. Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    # 3. Add new columns to existing tables (migrations)
    await _migrate_add_columns(conn)
    
    # 4. Backfill operations
    await _backfill_feedback_scores()       # Parse existing AI report scores
    await _backfill_listening_reading_scores()  # Auto-extract PDF scores
    await _backfill_homework_summaries()    # Generate AI summaries
    
    # 5. Seed initial data
    await _seed_writing_templates()         # Load 200+ writing templates
```

---

## Model Relationships Diagram

```
Agent ←→ Conversation
              ↓
         Message ←→ File
         
Homework ←---→ HomeworkFile ←→ File
   ↓
HomeworkFeedback ←→ File (optional)
   (scores extracted here)

WritingMaterial ←→ WritingMaterialKeyword
   ↓
DowngradeAttempt

WritingTemplate ←→ TemplateVocab

SpeakingCorrection (standalone)
SpeakingPhrase (standalone)

ListeningPracticeSession ←→ ListeningPracticeSentence
                              ↓
                         ListeningPracticeGenerated
                              ↓
                         ListeningDictationAttempt

ListeningPracticeSession ←→ ListeningDiscoveredWord

VocabularyWord (standalone)
FavoriteSentence (standalone)

Note (standalone - can reference Conversation/Message)
Setting (key-value store)
ScheduleTask (standalone)
FeedbackItem (standalone)
ContextMaterial (cache)
DailyReportCache (cache)
```

---

## Key Learning Algorithms

### 1. **SM-2 Spaced Repetition** (WritingMaterial, WritingTemplate, VocabularyWord, etc.)
- Interval progression: 1 → 3 → 7 → 7 (capped)
- Ease factor calculation based on review quality
- 5 mastery levels for materials (0-5)
- 4 mastery levels for vocabulary/sentences (0-3)

### 2. **Streak-Based Mastery** (SpeakingCorrection, SpeakingPhrase, TemplateVocab)
- Status: "active" → "passed" (3 consecutive fluent results)
- Streak counter increments on fluent reviews
- Resets on hesitant reviews
- Used for cumulative learning validation

### 3. **TEE Framework** (WritingMaterial)
- **T**opic: Opinion sentence (topic_sentence)
- **E**xplanation: Reasoning chain (reasoning_chain)
- **E**xample: Concrete example (example)
- Bilingual content (Chinese + English keywords)
- Memory anchors for retention

### 4. **Gradient Practice** (ListeningPracticeGenerated)
- Difficulty levels: 1 (easy) → 2 (medium) → 3 (hard)
- Progressive pronunciation challenges
- Multiple examples per blocker word
- User can track accuracy across difficulty levels

---

## Seed Data Files

| File | Purpose | Model |
|------|---------|-------|
| `writing_templates_seed.json` | 200+ IELTS writing templates | WritingTemplate |
| `writing_materials_seed.json` | Essay materials with TEE | WritingMaterial |
| `speaking_phrases_seed.json` | English downgrade phrases | SpeakingPhrase |
| `template_vocab_seed.json` | Template vocabulary items | TemplateVocab |

All seed data auto-imports on first `init_db()` call if tables are empty.

---

## Common Operations

### Creating a New Homework with Score
```python
homework = Homework(
    id=str(uuid.uuid4()),
    title="Essay Practice",
    category="writing",
    homework_date=date.today(),
)
db.add(homework)
await db.flush()

# Add score feedback
feedback = HomeworkFeedback(
    id=str(uuid.uuid4()),
    homework_id=homework.id,
    feedback_type="ai_report",
    content="AI Assessment",
    scores=json.dumps({
        "category": "writing",
        "overall": 7.5,
        "dimensions": [
            {"key": "TA", "score": 7.5},
            {"key": "CC", "score": 7.0},
            {"key": "LR", "score": 7.5},
            {"key": "GRA", "score": 7.0}
        ]
    }, ensure_ascii=False)
)
db.add(feedback)
await db.commit()
```

### Querying Homework with Scores
```python
from sqlalchemy import select

# Get all writing homeworks with feedback
stmt = select(Homework).where(
    Homework.category == "writing"
).join(HomeworkFeedback).where(
    HomeworkFeedback.scores.isnot(None)
)
result = await db.execute(stmt)
homeworks_with_scores = result.unique().scalars().all()
```

---

## Testing Checklist

- [ ] All 27 models are created in database
- [ ] Listening practice tables exist (ListeningPracticeSession, etc.)
- [ ] Foreign key relationships work correctly
- [ ] Migrations add columns without errors
- [ ] Seed data imports successfully
- [ ] Scores are parsed and stored in JSON format
- [ ] SM-2 algorithm works for spaced repetition
- [ ] Streak-based status updates correctly

---

**Last Updated**: 2026-05-15 (with fix for listening practice imports)
**Status**: ✅ Complete and documented
