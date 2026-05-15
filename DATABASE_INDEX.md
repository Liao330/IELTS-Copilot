# IELTS Copilot Database Documentation Index

**Last Updated**: 2026-05-15
**Status**: ✅ Complete and Verified

---

## Quick Links

| Document | Purpose | Length | Updated |
|----------|---------|--------|---------|
| [DATABASE_FIXES_AND_IMPROVEMENTS.md](./DATABASE_FIXES_AND_IMPROVEMENTS.md) | 🔴 **START HERE** - Executive summary of critical bug fix | 314 lines | 2026-05-15 |
| [DATABASE_MODELS_COMPLETE.md](./DATABASE_MODELS_COMPLETE.md) | 📚 Complete reference for all 27 models | 858 lines | 2026-05-15 |
| [CODEBASE_EXPLORATION.md](./CODEBASE_EXPLORATION.md) | 🌍 Full codebase overview including materials architecture | 598 lines | Previous |

---

## What Was Fixed

### 🔴 Critical Bug: Missing Listening Practice Tables

**Problem**: The listening practice feature would not work because 5 model classes were never imported in `init_db()`, preventing their database tables from being created.

**Models Affected**:
- `ListeningPracticeSession`
- `ListeningPracticeSentence`
- `ListeningPracticeGenerated`
- `ListeningDictationAttempt`
- `ListeningDiscoveredWord`

**Solution**: Added explicit imports in `backend/app/database.py` init_db() function

**Commits**:
- **e727d71**: Fix missing listening practice imports
- **fdac248**: Refactor centralized model imports
- **982314e**: Add comprehensive documentation
- **0b33c4f**: Add summary document

---

## Database Architecture Overview

### 27 SQLAlchemy ORM Models

```
┌─────────────────────────────────────────────────────────────┐
│                    IELTS Copilot Database                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Chat & Conversation (4)        Homework & Scoring (3)      │
│  ├─ Agent                        ├─ Homework               │
│  ├─ Conversation                 ├─ HomeworkFile           │
│  ├─ Message                      └─ HomeworkFeedback ⭐     │
│  └─ File                            (scores stored here)    │
│                                                              │
│  Writing Materials (3)           Writing Templates (2)      │
│  ├─ WritingMaterial              ├─ WritingTemplate        │
│  ├─ WritingMaterialKeyword       └─ TemplateVocab          │
│  └─ DowngradeAttempt                                        │
│                                                              │
│  Speaking (2)                    Listening Practice (5) ✅  │
│  ├─ SpeakingCorrection           ├─ ListeningPracticeSession
│  └─ SpeakingPhrase               ├─ ListeningPracticeSentence
│                                  ├─ ListeningPracticeGenerated
│  Vocabulary (2)                  ├─ ListeningDictationAttempt
│  ├─ VocabularyWord               └─ ListeningDiscoveredWord
│  └─ FavoriteSentence                                        │
│                                                              │
│  Utilities (8)                                              │
│  ├─ Note                                                    │
│  ├─ Setting                                                │
│  ├─ ScheduleTask                                            │
│  ├─ FeedbackItem                                            │
│  ├─ ContextMaterial                                         │
│  └─ DailyReportCache                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Concepts

### 1. Score Storage (HomeworkFeedback)
Scores are stored as JSON in `HomeworkFeedback.scores`:
```json
{
  "category": "speaking|writing|listening|reading",
  "overall": 7.5,
  "dimensions": [
    {"key": "FC|LR|GRA|PRON|TA|CC", "score": 7.0}
  ],
  "raw_score": 30,        // For listening/reading only
  "raw_total": 40,        // For listening/reading only
  "parts": []             // For listening/reading parts breakdown
}
```

**Dimension Codes**:
- **Speaking**: FC (Fluency & Coherence), LR (Lexical Resource), GRA (Grammar), PRON (Pronunciation)
- **Writing**: TA (Task Achievement), CC (Coherence & Cohesion), LR (Lexical Resource), GRA (Grammar)

### 2. Learning Algorithms

#### SM-2 Spaced Repetition
- Used for: WritingMaterial, WritingTemplate, VocabularyWord, etc.
- Interval progression: 1 → 3 → 7 → 7 (capped)
- Mastery levels: 0 (new) to 5 (mastered)
- Ease factor calculation based on review quality

#### Streak-Based Mastery
- Used for: SpeakingCorrection, SpeakingPhrase, TemplateVocab
- Status: "active" → "passed" (after 3 consecutive "fluent" results)
- Streak counter increments on fluent, resets on hesitant

#### TEE Framework (Writing Materials)
- **T**opic: Opinion sentence (topic_sentence)
- **E**xplanation: Reasoning chain (reasoning_chain)
- **E**xample: Concrete example (example)
- Bilingual content (Chinese + English keywords)

#### Gradient Practice (Listening)
- 3 difficulty levels per blocker word
- Progressive pronunciation challenges
- User tracks accuracy across levels

### 3. Relationships

Key foreign key relationships:
- `Conversation` → `Agent` (M2O)
- `Message` → `Conversation` (M2O)
- `Homework` ← `HomeworkFeedback` (O2M, cascade delete)
- `Homework` ← `HomeworkFile` (O2M, cascade delete)
- `HomeworkFeedback` → `File` (M2O, optional)
- `ListeningPracticeSession` ← `ListeningPracticeSentence` (O2M)
- `ListeningPracticeSentence` ← `ListeningPracticeGenerated` (O2M)
- `ListeningPracticeGenerated` ← `ListeningDictationAttempt` (O2M)

---

## File Locations

### Core Database Files
| File | Purpose |
|------|---------|
| `backend/app/database.py` | Database engine, session factory, init_db() |
| `backend/app/config.py` | Database URL configuration |
| `backend/data/ielts_copilot.db` | SQLite database file |

### Model Definitions (27 classes in 17 files)
| Category | Files |
|----------|-------|
| Chat | `agent.py`, `conversation.py`, `message.py`, `file.py` |
| Homework | `homework.py` (3 classes) |
| Writing | `writing_material.py` (3 classes), `writing_template.py` (2 classes) |
| Speaking | `speaking_correction.py`, `speaking_phrase.py` |
| Listening | `listening_practice.py` (5 classes) |
| Vocabulary | `vocabulary.py` (2 classes) |
| Utilities | `note.py`, `setting.py`, `schedule.py`, `feedback.py`, `context_material.py`, `daily_report_cache.py` |

### Seed Data
| File | Model | Records |
|------|-------|---------|
| `backend/app/data/writing_templates_seed.json` | WritingTemplate | 200+ |
| `backend/app/data/writing_materials_seed.json` | WritingMaterial | Various |
| `backend/app/data/speaking_phrases_seed.json` | SpeakingPhrase | Various |
| `backend/app/data/template_vocab_seed.json` | TemplateVocab | Various |

---

## Database Initialization Process

```
1. Import all 27 model classes
   ↓
2. Create all tables (Base.metadata.create_all)
   ↓
3. Add new columns to existing tables (migrations)
   ↓
4. Backfill feedback scores from AI reports
   ↓
5. Extract scores from listening/reading PDFs
   ↓
6. Generate AI summaries for homeworks
   ↓
7. Import writing template seed data
   ↓
✓ Database ready for use
```

**Location**: `backend/app/database.py` → `async def init_db()`

---

## Common Queries

### Get All Homeworks with Scores
```python
from sqlalchemy import select
from app.models import Homework, HomeworkFeedback

stmt = select(Homework).join(
    HomeworkFeedback
).where(
    HomeworkFeedback.scores.isnot(None)
)
homeworks = await db.execute(stmt)
```

### Parse Score JSON
```python
import json
from app.models import HomeworkFeedback

feedback = await db.get(HomeworkFeedback, feedback_id)
if feedback.scores:
    scores = json.loads(feedback.scores)
    overall = scores['overall']
    dimensions = scores['dimensions']
```

### Create Listening Practice Session
```python
from app.models import (
    ListeningPracticeSession,
    ListeningPracticeSentence,
)

session = ListeningPracticeSession(
    id=str(uuid.uuid4()),
    title="Practice Set 1"
)
sentence = ListeningPracticeSentence(
    session_id=session.id,
    original_text="The sentence",
    order_index=0
)
```

---

## Testing Checklist

- [ ] Database initializes without errors
- [ ] All 27 models registered with SQLAlchemy
- [ ] All table creation migrations run successfully
- [ ] Foreign key constraints enforced
- [ ] Cascade deletes work correctly
- [ ] Listening practice tables created (5 tables)
- [ ] Seed data imports successfully
- [ ] Scores parsed and stored correctly
- [ ] SM-2 algorithm functioning
- [ ] Streak-based mastery updates properly

---

## Troubleshooting

### Tables Missing After Initialization
**Cause**: Models not imported in `init_db()`
**Solution**: Verify all models imported from `app.models` in `database.py`

### Foreign Key Errors
**Cause**: Parent record deleted without cascade
**Solution**: Check cascade delete configuration in relationship definitions

### Score Parsing Failures
**Cause**: Unexpected score format in PDF/AI report
**Solution**: Debug `app/utils/score_parser.py` with actual text samples

### Seed Data Not Importing
**Cause**: Seed JSON file missing or malformed
**Solution**: Verify JSON syntax and file path in `app/data/`

---

## Related Documentation

- [CODEBASE_EXPLORATION.md](./CODEBASE_EXPLORATION.md) - Full codebase overview
- [PRD.md](./PRD.md) - Product requirements and features
- [README.md](./README.md) - Project setup and usage
- [MATERIALS_ARCHITECTURE.md](./MATERIALS_ARCHITECTURE.md) - Writing materials design

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-15 | Initial comprehensive documentation with critical bug fix |

---

**Next Review**: After production deployment
**Maintainer**: Engineering Team
**Questions?**: See DATABASE_MODELS_COMPLETE.md for detailed reference
