# Writing Materials API - Complete Reference

## Base Configuration

```
Base URL: http://localhost:8000
API Prefix: /api/writing-materials
Database: SQLite (backend/data/ielts_copilot.db)
```

---

## 1. Material Retrieval Endpoints

### 1.1 Get All Materials

```http
GET /api/writing-materials
```

**Query Parameters:**
```
topic?: string          # Filter by topic (education, technology, etc.)
mastery?: int          # Filter by mastery level (0-5)
```

**Example Request:**
```bash
curl "http://localhost:8000/api/writing-materials?topic=education&mastery=0"
```

**Example Response:**
```json
[
  {
    "id": "uuid-string",
    "topic": "education",
    "topic_cn": "教育",
    "direction": "大学应该免费吗？",
    "direction_index": 1,
    "stance": "pro",
    "stance_label": "正方",
    "angle": "社会公平",
    "angle_index": 1,
    "reasoning_chain": "消除经济障碍 → 寒门子弟也能读大学 → 缩小贫富差距、促进阶层流动",
    "reasoning_chain_en": "Remove economic barriers → students from poor backgrounds can attend university → narrower wealth gap, increased social mobility",
    "example": "北欧国家（瑞典、挪威）免学费，社会流动性指标全球领先",
    "example_en": "Nordic countries (Sweden, Norway) have free tuition, ranking highest in social mobility metrics",
    "sort_order": 0,
    "mastery_level": 0,
    "review_count": 0,
    "correct_count": 0,
    "interval_days": 1,
    "next_review_at": null,
    "last_reviewed_at": null,
    "first_learned_at": null,
    "created_at": "2024-03-05T10:00:00"
  },
  // ... more materials
]
```

---

### 1.2 Get Stats (Summary)

```http
GET /api/writing-materials/stats
```

**Example Request:**
```bash
curl http://localhost:8000/api/writing-materials/stats
```

**Example Response:**
```json
{
  "total": 120,
  "mastered": 35,
  "learning": 45,
  "new_count": 40,
  "due_today": 12,
  "tomorrow_due": 8,
  "learned_today": 5,
  "topic_stats": {
    "education": {
      "total": 30,
      "mastered": 10,
      "due_today": 3
    },
    "technology": {
      "total": 25,
      "mastered": 8,
      "due_today": 2
    }
  },
  "keyword_total": 500,
  "keyword_mastered": 150
}
```

---

### 1.3 Get New Materials (Today's Learning)

```http
GET /api/writing-materials/new-today?limit=4
```

**Query Parameters:**
```
limit?: int  # Default: 4 (how many new materials to show)
```

**Example Request:**
```bash
curl http://localhost:8000/api/writing-materials/new-today?limit=4
```

**Example Response:**
```json
[
  {
    "id": "uuid-1",
    "topic": "education",
    // ... (same structure as above)
    "mastery_level": 0,
    "review_count": 0
  },
  {
    "id": "uuid-2",
    // ... 3 more new materials
  }
]
```

---

### 1.4 Get Already-Learned Materials (Today)

```http
GET /api/writing-materials/learned-today
```

**Example Request:**
```bash
curl http://localhost:8000/api/writing-materials/learned-today
```

**Example Response:**
```json
[
  {
    "id": "uuid-1",
    "topic": "education",
    // ...
    "mastery_level": 1,
    "review_count": 1,
    "correct_count": 1,
    "last_reviewed_at": "2024-05-09T10:30:00"
  },
  // ... more materials learned today
]
```

---

### 1.5 Get Materials Due for Review

```http
GET /api/writing-materials/due?limit=20
```

**Query Parameters:**
```
limit?: int  # Default: 20 (max materials to return)
```

**Example Request:**
```bash
curl http://localhost:8000/api/writing-materials/due?limit=20
```

**Example Response:**
```json
[
  {
    "id": "uuid-due-1",
    // ... material structure
    "mastery_level": 2,
    "next_review_at": "2024-05-09T08:00:00",  // Overdue or today
    "last_reviewed_at": "2024-05-07T14:22:00"
  },
  // ... more due materials (max 20)
]
```

---

## 2. Learning/Review Endpoints

### 2.1 Mark Material as Seen/Reviewed

```http
POST /api/writing-materials/{id}/review
Content-Type: application/json

{
  "quality": 0|1|2|3
}
```

**Path Parameters:**
```
id: string (UUID of the material)
```

**Request Body:**
```json
{
  "quality": 2
}
```

**Quality Levels:**
```
0 = 不会 (Don't know)
    → interval = 1 day
    → mastery_level decreases
    → ease_factor decreases by 0.2

1 = 模糊 (Vague/Confused)
    → interval = 1 day
    → mastery_level stays same
    → ease_factor decreases by 0.2

2 = 会了 (Got it)
    → interval increases (based on ease_factor)
    → mastery_level increases
    → ease_factor increases by 0.08

3 = 很熟 (Very familiar)
    → interval increases (based on ease_factor)
    → mastery_level increases
    → ease_factor increases by 0.1
```

**Example Request:**
```bash
curl -X POST http://localhost:8000/api/writing-materials/uuid-123/review \
  -H "Content-Type: application/json" \
  -d '{"quality": 2}'
```

**Example Response:**
```json
{
  "id": "uuid-123",
  "topic": "education",
  // ... (full material object)
  "mastery_level": 1,
  "review_count": 1,
  "correct_count": 1,
  "ease_factor": 2.5,
  "interval_days": 2,
  "next_review_at": "2024-05-11T08:00:00",
  "last_reviewed_at": "2024-05-09T10:45:00",
  "first_learned_at": "2024-05-09T10:45:00"
}
```

---

### 2.2 Check User Answer (Dictation/Downgrade)

```http
POST /api/writing-materials/{id}/check
Content-Type: application/json

{
  "answer": "user's english translation",
  "mode": "reasoning"|"example"
}
```

**Path Parameters:**
```
id: string (UUID of the material)
```

**Request Body:**
```json
{
  "answer": "remove economic barriers to allow disadvantaged students attend university",
  "mode": "reasoning"
}
```

**Query Mode:**
```
"reasoning" = User translating 理由链 (reasoning chain)
"example"   = User translating 例子 (example)
```

**Example Request:**
```bash
curl -X POST http://localhost:8000/api/writing-materials/uuid-123/check \
  -H "Content-Type: application/json" \
  -d '{
    "answer": "free university increases social mobility",
    "mode": "reasoning"
  }'
```

**Example Response:**
```json
{
  "correct": true,
  "score": 85,
  "expected": "Remove economic barriers → students from disadvantaged backgrounds can attend university → narrower wealth gap",
  "feedback": "Good! You captured the main points. Consider adding 'gap' or 'disparity' for completeness.",
  "mastery_level": 2,
  "interval_days": 3
}
```

---

## 3. Keyword Endpoints

### 3.1 Get Keywords

```http
GET /api/writing-materials/keywords
```

**Query Parameters:**
```
topic?: string          # Filter by topic
direction_index?: int   # Filter by direction_index
```

**Example Request:**
```bash
curl "http://localhost:8000/api/writing-materials/keywords?topic=education&direction_index=1"
```

**Example Response:**
```json
[
  {
    "id": "uuid-kw-1",
    "topic": "education",
    "direction_index": 1,
    "cn": "寒门子弟",
    "en": "students from poor/disadvantaged backgrounds",
    "level": "basic",
    "sort_order": 0,
    "mastery_level": 0,
    "review_count": 0,
    "interval_days": 1,
    "next_review_at": null,
    "last_reviewed_at": null,
    "first_learned_at": null,
    "created_at": "2024-03-05T10:00:00"
  },
  // ... more keywords
]
```

---

### 3.2 Get Keywords Due for Review

```http
GET /api/writing-materials/keywords/due?limit=20
```

**Query Parameters:**
```
limit?: int  # Default: 20
```

**Example Request:**
```bash
curl http://localhost:8000/api/writing-materials/keywords/due?limit=20
```

**Example Response:**
```json
[
  {
    "id": "uuid-kw-due-1",
    // ... keyword structure with mastery > 0
  },
  // ... more due keywords
]
```

---

### 3.3 Review Keyword

```http
POST /api/writing-materials/keywords/{id}/review
Content-Type: application/json

{
  "quality": 0|1|2|3
}
```

**Path Parameters:**
```
id: string (UUID of the keyword)
```

**Request Body:**
```json
{
  "quality": 2
}
```

**Note:** Keywords use same quality scale (0-3) but mastery is capped at 2 (not 5)

**Example Request:**
```bash
curl -X POST http://localhost:8000/api/writing-materials/keywords/uuid-kw-123/review \
  -H "Content-Type: application/json" \
  -d '{"quality": 2}'
```

**Example Response:**
```json
{
  "id": "uuid-kw-123",
  "topic": "education",
  "direction_index": 1,
  "cn": "寒门子弟",
  "en": "students from poor/disadvantaged backgrounds",
  "mastery_level": 1,
  "review_count": 1,
  "interval_days": 2,
  "next_review_at": "2024-05-11T08:00:00",
  "last_reviewed_at": "2024-05-09T10:50:00",
  "first_learned_at": "2024-05-09T10:50:00"
}
```

---

## 4. Downgrade Practice Endpoints (降级练习)

### 4.1 Get Sentences for Translation Practice

```http
GET /api/writing-materials/downgrade-sentences
```

**Example Request:**
```bash
curl http://localhost:8000/api/writing-materials/downgrade-sentences
```

**Example Response:**
```json
[
  {
    "id": "uuid-mat-1",
    "chinese": "消除经济障碍 → 寒门子弟也能读大学 → 缩小贫富差距",
    "type": "reasoning_chain"
  },
  {
    "id": "uuid-mat-2",
    "chinese": "北欧国家（瑞典、挪威）免学费，社会流动性指标全球领先",
    "type": "example"
  },
  // ... more sentences (from materials with mastery_level 1-2)
]
```

---

### 4.2 Get Failed Attempts for Retry

```http
GET /api/writing-materials/downgrade-retry
```

**Example Request:**
```bash
curl http://localhost:8000/api/writing-materials/downgrade-retry
```

**Example Response:**
```json
[
  {
    "id": "uuid-attempt-1",
    "chinese": "消除经济障碍 → 寒门子弟也能读大学 → 缩小贫富差距",
    "answer": "remove barriers for poor students to attend university",
    "feedback": "Missing the 'wealth gap' reduction consequence",
    "source_material_id": "uuid-mat-1",
    "needs_retry": 1
  },
  // ... more failed attempts
]
```

---

### 4.3 Get Downgrade Stats

```http
GET /api/writing-materials/downgrade-stats
```

**Example Request:**
```bash
curl http://localhost:8000/api/writing-materials/downgrade-stats
```

**Example Response:**
```json
{
  "total_attempts": 42,
  "correct": 35,
  "accuracy": 83.33,
  "by_type": {
    "reasoning_chain": {
      "total": 25,
      "correct": 21,
      "accuracy": 84.0
    },
    "example": {
      "total": 17,
      "correct": 14,
      "accuracy": 82.35
    }
  }
}
```

---

### 4.4 Check Downgrade Answer (LLM Scoring)

```http
POST /api/writing-materials/downgrade-check
Content-Type: application/json

{
  "chinese": "user's chinese text to translate",
  "answer": "user's english answer",
  "source_material_id": "uuid-123"
}
```

**Request Body:**
```json
{
  "chinese": "消除经济障碍 → 寒门子弟也能读大学 → 缩小贫富差距、促进阶层流动",
  "answer": "remove economic barriers to allow disadvantaged students access university and reduce wealth inequality",
  "source_material_id": "uuid-mat-1"
}
```

**Example Request:**
```bash
curl -X POST http://localhost:8000/api/writing-materials/downgrade-check \
  -H "Content-Type: application/json" \
  -d '{
    "chinese": "消除经济障碍 → 寒门子弟也能读大学 → 缩小贫富差距",
    "answer": "remove barriers for poor students to attend university",
    "source_material_id": "uuid-mat-1"
  }'
```

**Example Response:**
```json
{
  "score": 72,
  "correct": 0,
  "feedback": "Good attempt! You captured the barrier removal and student access. However, you missed the 'wealth gap reduction' consequence. Try again: 'Remove economic barriers → disadvantaged students can attend university → reduced wealth inequality'",
  "reference_answer": "Remove economic barriers → students from poor backgrounds can attend university → narrower wealth gap, increased social mobility"
}
```

---

## 5. Error Responses

### 5.1 Invalid Material ID

```http
GET /api/writing-materials/invalid-uuid/review
```

**Response:**
```json
HTTP/1.1 404 Not Found
{
  "detail": "Material not found"
}
```

---

### 5.2 Invalid Quality Score

```http
POST /api/writing-materials/uuid-123/review
Content-Type: application/json

{
  "quality": 5
}
```

**Response:**
```json
HTTP/1.1 422 Unprocessable Entity
{
  "detail": [
    {
      "loc": ["body", "quality"],
      "msg": "ensure this value is less than or equal to 3",
      "type": "value_error.number.not_le"
    }
  ]
}
```

---

## 6. Frontend Integration Examples

### 6.1 React Hook Usage

```typescript
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function MaterialComponent() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    (async () => {
      // Get new materials
      const newMaterials = await api.getWritingMaterialsNewToday(4);
      setMaterials(newMaterials);

      // Get stats
      const stats = await api.getWritingMaterialStats();
      setStats(stats);
    })();
  }, []);

  const handleReview = async (materialId: string, quality: number) => {
    await api.reviewWritingMaterial(materialId, quality);
    // Refresh data
    const updated = await api.getWritingMaterialsNewToday(4);
    setMaterials(updated);
  };

  return (
    <div>
      {stats && <p>Total: {stats.total}, Mastered: {stats.mastered}</p>}
      {materials.map(m => (
        <div key={m.id}>
          <p>{m.reasoning_chain}</p>
          <button onClick={() => handleReview(m.id, 2)}>Mark as Seen</button>
        </div>
      ))}
    </div>
  );
}
```

---

### 6.2 Downgrade Practice

```typescript
const handleDowngradeSubmit = async (chinese: string, answer: string) => {
  const result = await api.checkDowngrade(chinese, answer);
  console.log('Score:', result.score);
  console.log('Feedback:', result.feedback);
  console.log('Reference:', result.reference_answer);
};
```

---

## 7. Pydantic Models (Backend Schemas)

### MaterialOut
```python
class MaterialOut(BaseModel):
    id: str
    topic: str
    topic_cn: str
    direction: str
    direction_index: int
    stance: str
    stance_label: str
    angle: str
    angle_index: int
    reasoning_chain: str
    reasoning_chain_en: Optional[str]
    example: str
    example_en: Optional[str]
    sort_order: int
    mastery_level: int
    review_count: int
    correct_count: int
    interval_days: int
    next_review_at: Optional[datetime]
    last_reviewed_at: Optional[datetime]
    first_learned_at: Optional[datetime]
    created_at: datetime
```

### ReviewRequest
```python
class ReviewRequest(BaseModel):
    quality: int  # 0-3
```

### CheckRequest
```python
class CheckRequest(BaseModel):
    answer: str
    mode: str  # "reasoning" or "example"
```

### CheckResponse
```python
class CheckResponse(BaseModel):
    correct: bool
    score: int
    expected: str
    feedback: str
    mastery_level: int
    interval_days: int
```

### StatsOut
```python
class StatsOut(BaseModel):
    total: int
    mastered: int
    learning: int
    new_count: int
    due_today: int
    tomorrow_due: int
    learned_today: int
    topic_stats: dict
    keyword_total: int
    keyword_mastered: int
```

---

## 8. Database Queries

### 8.1 Get New Materials Today

```sql
SELECT * FROM writing_materials
WHERE mastery_level = 0
ORDER BY sort_order
LIMIT ?;
```

### 8.2 Get Due Materials

```sql
SELECT * FROM writing_materials
WHERE next_review_at <= datetime('now')
  AND mastery_level BETWEEN 1 AND 4
ORDER BY next_review_at ASC
LIMIT ?;
```

### 8.3 Get Mastered Materials

```sql
SELECT * FROM writing_materials
WHERE mastery_level >= 5;
```

### 8.4 Get Statistics

```sql
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN mastery_level >= 5 THEN 1 ELSE 0 END) as mastered,
  SUM(CASE WHEN mastery_level BETWEEN 1 AND 4 THEN 1 ELSE 0 END) as learning,
  SUM(CASE WHEN mastery_level = 0 THEN 1 ELSE 0 END) as new_count
FROM writing_materials;
```

---

## 9. Common Workflows

### Workflow 1: Daily Learning Session

```
1. GET /api/writing-materials/new-today?limit=4
   ↓ User sees 4 new materials
2. User reads and clicks "已看，加入复习"
   ↓ POST /api/writing-materials/{id}/review with quality=2
3. GET /api/writing-materials/learned-today
   ↓ Show materials learned so far
4. GET /api/writing-materials/stats
   ↓ Update progress bar
```

### Workflow 2: Flashcard Review

```
1. GET /api/writing-materials/due?limit=20
   ↓ Load materials due for review
2. User flips cards (frontend only, no API call)
3. User rates: [不会] [模糊] [记住了]
   ↓ POST /api/writing-materials/{id}/review with quality=0/1/3
4. Load next card from queue
5. Repeat until queue empty
```

### Workflow 3: Downgrade Practice

```
1. GET /api/writing-materials/downgrade-sentences
   ↓ Get Chinese sentences to translate
2. User enters English translation
3. POST /api/writing-materials/downgrade-check
   ↓ LLM scores the answer
4. Display feedback + reference
5. Option to retry or move to next
```

