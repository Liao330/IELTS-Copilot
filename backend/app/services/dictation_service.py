"""听写模块服务。

四类训练：
1. 月份（基础）：12 个固定月份词条，走 SM-2 复习（vocabulary_words, category='dictation'）
2. 月份（进阶）：日期 + 月份组合，运行时随机生成，不入库，宽松判题
3. 数字/时间/其他：运行时按模板随机生成，不入库
4. 听力单词听写：从用户的 VocabularyWord(category='listening') 抽题，走 SM-2
"""
from __future__ import annotations

import json
import random
import re
import uuid
from datetime import datetime
from typing import Literal

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models.vocabulary import VocabularyWord


# ==================== 月份基础 · 种子数据 ====================

MONTHS: list[tuple[str, str]] = [
    ("January", "/ˈdʒænjuəri/"),
    ("February", "/ˈfebruəri/"),
    ("March", "/mɑːtʃ/"),
    ("April", "/ˈeɪprəl/"),
    ("May", "/meɪ/"),
    ("June", "/dʒuːn/"),
    ("July", "/dʒuˈlaɪ/"),
    ("August", "/ˈɔːɡəst/"),
    ("September", "/sepˈtembə(r)/"),
    ("October", "/ɒkˈtəʊbə(r)/"),
    ("November", "/nəʊˈvembə(r)/"),
    ("December", "/dɪˈsembə(r)/"),
]

MONTH_NAMES = [m[0] for m in MONTHS]
MONTH_INDEX = {m.lower(): i + 1 for i, m in enumerate(MONTH_NAMES)}
# 常见简写也能识别
MONTH_SHORT = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}

DICTATION_SOURCE = "dictation:builtin-months"


async def ensure_dictation_months_seeded() -> None:
    """幂等：首次启动时把 12 个月份写入 vocabulary_words。"""
    async with async_session() as db:  # type: AsyncSession
        q = await db.execute(
            select(VocabularyWord).where(
                VocabularyWord.source_conversation_id == DICTATION_SOURCE
            )
        )
        existing_words = {w.word for w in q.scalars().all()}

        added = 0
        for word, phonetic in MONTHS:
            if word in existing_words:
                continue
            db.add(VocabularyWord(
                id=str(uuid.uuid4()),
                word=word,
                phonetic=phonetic,
                pos="noun",
                meaning=f"{word}（月份）",
                category="dictation",
                tags=json.dumps(["month"], ensure_ascii=False),
                source_conversation_id=DICTATION_SOURCE,
                next_review_at=datetime.utcnow(),
            ))
            added += 1

        if added:
            await db.commit()


# ==================== 序数词工具 ====================

def ordinal_suffix(n: int) -> str:
    """1→st, 2→nd, 3→rd, 4→th, 11→th, 21→st …"""
    if 10 <= n % 100 <= 20:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


def ordinal(n: int) -> str:
    return f"{n}{ordinal_suffix(n)}"


# ==================== 日期进阶 ====================

def generate_date_question() -> dict:
    """随机生成"日期+月份"题目，多种合法英式写法之一作为 display。"""
    month_idx = random.randint(1, 12)
    month_name = MONTH_NAMES[month_idx - 1]
    # 不同月份的天数简化
    max_day = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month_idx - 1]
    day = random.randint(1, max_day)

    # 3 种常见英式写法，展示时随机挑 1 种作为"标准答案显示"
    forms = [
        f"{ordinal(day)} {month_name}",               # 3rd March
        f"{month_name} {ordinal(day)}",               # March 3rd
        f"the {ordinal(day)} of {month_name}",        # the 3rd of March
    ]
    display = random.choice(forms)
    # TTS 朗读用"the Xth of Month"最清楚
    read = f"the {ordinal(day)} of {month_name}"

    return {
        "kind": "date",
        "text": display,
        "read_text": read,
        "hint": "日期+月份（任一合法英式写法均可）",
        "_meta": {"day": day, "month": month_idx},
    }


# ==================== 时间 ====================

def generate_time_question() -> dict:
    """生成 4 种英式时间表达之一。"""
    hour = random.randint(1, 12)
    # 只用常见分钟：0, 15, 30, 45
    minute = random.choice([0, 15, 30, 45, random.choice([5, 10, 20, 25, 35, 40, 50, 55])])

    variants: list[tuple[str, str]] = []  # (display, read_text)

    if minute == 0:
        variants.append((f"{hour}:00", f"{_num_word(hour)} o'clock"))
        variants.append((f"{hour} o'clock", f"{_num_word(hour)} o'clock"))
    elif minute == 15:
        variants.append((f"{hour}:15", f"quarter past {_num_word(hour)}"))
        variants.append((f"quarter past {_num_word(hour)}", f"quarter past {_num_word(hour)}"))
    elif minute == 30:
        variants.append((f"{hour}:30", f"half past {_num_word(hour)}"))
        variants.append((f"half past {_num_word(hour)}", f"half past {_num_word(hour)}"))
    elif minute == 45:
        next_h = hour + 1 if hour < 12 else 1
        variants.append((f"{hour}:45", f"quarter to {_num_word(next_h)}"))
        variants.append((f"quarter to {_num_word(next_h)}", f"quarter to {_num_word(next_h)}"))
    else:
        variants.append((f"{hour}:{minute:02d}", f"{_num_word(hour)} {_num_word(minute) if minute >= 10 else 'oh ' + _num_word(minute)}"))

    display, read = random.choice(variants)
    return {
        "kind": "time",
        "text": display,
        "read_text": read,
        "hint": "时间（数字或 half past/quarter to 等均可）",
        "_meta": {"hour": hour, "minute": minute},
    }


def _num_word(n: int) -> str:
    """小数字转英文（只覆盖时间场景 0-59）。"""
    words = {
        0: "zero", 1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
        6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten",
        11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen",
        15: "fifteen", 16: "sixteen", 17: "seventeen", 18: "eighteen", 19: "nineteen",
        20: "twenty", 30: "thirty", 40: "forty", 50: "fifty",
    }
    if n in words:
        return words[n]
    tens, ones = divmod(n, 10)
    return f"{words[tens * 10]}-{words[ones]}"


# ==================== 百分比 / 分数 / 测量 ====================

def generate_percent_question() -> dict:
    pct = random.choice([5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, random.randint(1, 99)])
    return {
        "kind": "percent",
        "text": f"{pct}%",
        "read_text": f"{pct} percent",
        "hint": "百分比（数字+%）",
    }


def generate_fraction_question() -> dict:
    fractions = [
        ("1/2", "a half"),
        ("1/3", "one third"),
        ("2/3", "two thirds"),
        ("1/4", "a quarter"),
        ("3/4", "three quarters"),
        ("1/5", "one fifth"),
        ("2/5", "two fifths"),
    ]
    text, read = random.choice(fractions)
    return {
        "kind": "fraction",
        "text": text,
        "read_text": read,
        "hint": "分数（如 1/2、3/4）",
    }


def generate_measurement_question() -> dict:
    kind = random.choice(["weight_kg", "height_cm", "distance_m", "distance_km"])
    if kind == "weight_kg":
        n = random.randint(5, 120)
        return {
            "kind": "measurement",
            "text": f"{n}kg",
            "read_text": f"{n} kilograms",
            "hint": "重量（kg）",
        }
    if kind == "height_cm":
        n = random.randint(100, 200)
        return {
            "kind": "measurement",
            "text": f"{n}cm",
            "read_text": f"{n} centimeters",
            "hint": "身高（cm）",
        }
    if kind == "distance_m":
        n = random.randint(5, 500)
        return {
            "kind": "measurement",
            "text": f"{n}m",
            "read_text": f"{n} meters",
            "hint": "距离（m）",
        }
    n = round(random.uniform(1.5, 50.0), 1)
    return {
        "kind": "measurement",
        "text": f"{n}km",
        "read_text": f"{n} kilometers",
        "hint": "距离（km）",
    }


# ==================== 数字串随机生成（旧） ====================

NumberKind = Literal[
    "phone", "postcode", "flight_no", "card_no", "room_no", "price", "year",
    "time", "date", "percent", "fraction", "measurement",
]


def _rand_digits(n: int) -> str:
    return "".join(random.choice("0123456789") for _ in range(n))


def generate_number_string(kind: NumberKind | None = None) -> dict:
    """随机生成一个题目。"""
    kinds: list[NumberKind] = [
        "phone", "postcode", "flight_no", "card_no", "room_no", "price", "year",
        "time", "percent", "fraction", "measurement",
    ]
    chosen: NumberKind = kind or random.choice(kinds)

    if chosen == "time":
        return generate_time_question()
    if chosen == "date":
        return generate_date_question()
    if chosen == "percent":
        return generate_percent_question()
    if chosen == "fraction":
        return generate_fraction_question()
    if chosen == "measurement":
        return generate_measurement_question()

    if chosen == "phone":
        s = f"{_rand_digits(3)} {_rand_digits(4)} {_rand_digits(4)}"
        return {"kind": chosen, "text": s, "read_text": s, "hint": "英式电话（3-4-4 分组）"}

    if chosen == "postcode":
        letters1 = random.choice(["SW", "NW", "SE", "NE", "EC", "WC", "M", "B", "L", "CB"])
        mid_digit = _rand_digits(random.choice([1, 2]))
        trailing_digit = _rand_digits(1)
        trailing_letters = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ", k=2))
        s = f"{letters1}{mid_digit} {trailing_digit}{trailing_letters}"
        read = " ".join(list(s.replace(" ", " ")))
        return {"kind": chosen, "text": s, "read_text": read, "hint": "英式邮编（字母+数字）"}

    if chosen == "flight_no":
        airline = random.choice(["BA", "AC", "LH", "AA", "CA", "MU", "QF", "EK"])
        num = _rand_digits(random.choice([3, 4]))
        s = f"{airline}{num}"
        read = f"{airline[0]} {airline[1]} {num}"
        return {"kind": chosen, "text": s, "read_text": read, "hint": "航班号（2 字母+3-4 位）"}

    if chosen == "card_no":
        s = " ".join(_rand_digits(4) for _ in range(4))
        return {"kind": chosen, "text": s, "read_text": s, "hint": "银行卡号（4-4-4-4，16 位）"}

    if chosen == "room_no":
        s = _rand_digits(random.choice([3, 4]))
        return {"kind": chosen, "text": s, "read_text": s, "hint": "房间号（3-4 位）"}

    if chosen == "price":
        pounds = random.randint(3, 999)
        pence = random.randint(0, 99)
        s = f"£{pounds}.{pence:02d}"
        read = f"{pounds} pounds {pence:02d}" if pence else f"{pounds} pounds"
        return {"kind": chosen, "text": s, "read_text": read, "hint": "价格（£x.xx）"}

    year = random.choice([random.randint(1970, 1999), random.randint(2000, 2024)])
    s = str(year)
    return {"kind": "year", "text": s, "read_text": s, "hint": "年份（4 位数字）"}


# ==================== 智能判题 ====================

def normalize_basic(s: str) -> str:
    """去多余空格、统一大小写。"""
    return " ".join(s.strip().upper().split())


def check_number_answer(expected: str, answer: str, kind: str | None = None) -> bool:
    """对多数数字题型采用"忽略空格+大小写"的宽松判题。"""
    if kind == "date":
        return check_date_answer(expected, answer)
    if kind == "time":
        return check_time_answer(expected, answer)
    if kind == "fraction":
        return check_fraction_answer(expected, answer)
    if kind == "percent":
        return _clean_strip(expected).replace("%", "") == _clean_strip(answer).replace("%", "")
    if kind == "measurement":
        return _clean_strip(expected) == _clean_strip(answer)

    a = normalize_basic(expected).replace(" ", "")
    b = normalize_basic(answer).replace(" ", "")
    return a == b


def _clean_strip(s: str) -> str:
    return s.strip().lower().replace(" ", "")


# ---- 日期宽松解析 ----

_ORD_RE = re.compile(r"(\d+)(st|nd|rd|th)\b", re.IGNORECASE)


def parse_date_en(s: str) -> tuple[int, int] | None:
    """解析英式日期：返回 (day, month_idx 1-12)；失败返回 None。

    接受的写法（大小写不敏感）：
      - 3rd March
      - March 3rd
      - the 3rd of March
      - 3 March
      - 23/03
      - March 23
      - 23rd of March
      - Mar 3
    """
    if not s:
        return None
    s = s.strip().lower()
    # 去掉 "the" / "of" / 逗号，保留数字和月份
    s_clean = re.sub(r"\bthe\b|\bof\b|,", " ", s)
    s_clean = re.sub(r"\s+", " ", s_clean).strip()

    # 先尝试 DD/MM 或 D/M 格式
    m = re.fullmatch(r"(\d{1,2})[/\-.](\d{1,2})", s_clean)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        if 1 <= day <= 31 and 1 <= month <= 12:
            return day, month

    # 去掉序数后缀（3rd → 3）
    s_clean = _ORD_RE.sub(r"\1", s_clean)

    tokens = s_clean.split()
    if not tokens:
        return None

    # 找出数字 token 和月份 token
    day = None
    month = None
    for t in tokens:
        if t.isdigit():
            n = int(t)
            if 1 <= n <= 31 and day is None:
                day = n
        else:
            if t in MONTH_INDEX:
                month = MONTH_INDEX[t]
            elif t in MONTH_SHORT:
                month = MONTH_SHORT[t]

    if day is not None and month is not None:
        return day, month
    return None


def check_date_answer(expected: str, answer: str) -> bool:
    e = parse_date_en(expected)
    a = parse_date_en(answer)
    if e is None or a is None:
        return False
    return e == a


# ---- 时间宽松判题 ----

_NUM_WORDS_REVERSE = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
}


def parse_time_en(s: str) -> tuple[int, int] | None:
    """解析英式时间：返回 (hour 1-12, minute 0-59)；失败返回 None。

    - "9:45" / "9:5"
    - "nine forty-five"
    - "quarter past nine" → (9, 15)
    - "quarter to ten" → (9, 45)
    - "half past nine" → (9, 30)
    - "nine o'clock" → (9, 0)
    """
    if not s:
        return None
    s = s.strip().lower().replace("'", "").replace(".", "")

    # HH:MM
    m = re.fullmatch(r"(\d{1,2}):(\d{1,2})", s)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
        if 1 <= h <= 12 and 0 <= mi <= 59:
            return h, mi

    # "N oclock"
    m = re.fullmatch(r"(\d{1,2})\s*oclock", s)
    if m:
        h = int(m.group(1))
        if 1 <= h <= 12:
            return h, 0

    # 处理文字形式
    s2 = s.replace("-", " ")
    # half past X
    m = re.fullmatch(r"half past ([a-z]+|\d{1,2})", s2)
    if m:
        h = _word_to_num_1_12(m.group(1))
        if h is not None:
            return h, 30

    # quarter past X
    m = re.fullmatch(r"(?:a )?quarter past ([a-z]+|\d{1,2})", s2)
    if m:
        h = _word_to_num_1_12(m.group(1))
        if h is not None:
            return h, 15

    # quarter to X
    m = re.fullmatch(r"(?:a )?quarter to ([a-z]+|\d{1,2})", s2)
    if m:
        next_h = _word_to_num_1_12(m.group(1))
        if next_h is not None:
            base = next_h - 1 if next_h > 1 else 12
            return base, 45

    # "X oclock" (文字)
    m = re.fullmatch(r"([a-z]+) oclock", s2)
    if m:
        h = _word_to_num_1_12(m.group(1))
        if h is not None:
            return h, 0

    # "X [minutes] past Y" / "X [minutes] to Y"
    m = re.fullmatch(r"([a-z]+|\d{1,2})(?:\s+minutes?)?\s+(past|to)\s+([a-z]+|\d{1,2})", s2)
    if m:
        mi_word, direction, h_word = m.group(1), m.group(2), m.group(3)
        mi = int(mi_word) if mi_word.isdigit() else _word_to_num_minute(mi_word)
        h = _word_to_num_1_12(h_word)
        if mi is not None and h is not None:
            if direction == "past":
                return h, mi
            else:
                base = h - 1 if h > 1 else 12
                return base, 60 - mi

    # "nine forty-five"（hour + minute 全单词）
    parts = s2.split()
    if len(parts) == 2:
        h = _word_to_num_1_12(parts[0])
        mi = _word_to_num_minute(parts[1])
        if h is not None and mi is not None:
            return h, mi

    return None


def _word_to_num_1_12(s: str) -> int | None:
    if s.isdigit():
        n = int(s)
        return n if 1 <= n <= 12 else None
    return _NUM_WORDS_REVERSE.get(s)


def _word_to_num_minute(s: str) -> int | None:
    if s.isdigit():
        n = int(s)
        return n if 0 <= n <= 59 else None
    # 支持 "twenty-five" / "forty five" 等
    s2 = s.replace("-", " ").strip()
    parts = s2.split()
    if len(parts) == 1:
        return _NUM_WORDS_REVERSE.get(parts[0])
    if len(parts) == 2:
        tens = _NUM_WORDS_REVERSE.get(parts[0])
        ones = _NUM_WORDS_REVERSE.get(parts[1])
        if tens is not None and ones is not None and tens in (20, 30, 40, 50) and 1 <= ones <= 9:
            return tens + ones
    return None


def check_time_answer(expected: str, answer: str) -> bool:
    e = parse_time_en(expected)
    a = parse_time_en(answer)
    if e is None or a is None:
        return False
    return e == a


# ---- 分数宽松判题 ----

_FRAC_WORDS = {
    "half": (1, 2), "halves": (1, 2),
    "third": (1, 3), "thirds": (1, 3),
    "quarter": (1, 4), "quarters": (1, 4),
    "fifth": (1, 5), "fifths": (1, 5),
    "sixth": (1, 6), "sixths": (1, 6),
    "seventh": (1, 7), "sevenths": (1, 7),
    "eighth": (1, 8), "eighths": (1, 8),
}


def parse_fraction_en(s: str) -> tuple[int, int] | None:
    if not s:
        return None
    s = s.strip().lower()
    m = re.fullmatch(r"(\d+)\s*/\s*(\d+)", s)
    if m:
        return int(m.group(1)), int(m.group(2))
    s = s.replace("-", " ").replace("a ", "one ")
    parts = s.split()
    if len(parts) == 2:
        num = _NUM_WORDS_REVERSE.get(parts[0])
        frac = _FRAC_WORDS.get(parts[1])
        if num is not None and frac is not None:
            return num, frac[1]
    return None


def check_fraction_answer(expected: str, answer: str) -> bool:
    e = parse_fraction_en(expected)
    a = parse_fraction_en(answer)
    if e is None or a is None:
        return False
    # 化简后再比（2/4 == 1/2）
    from math import gcd
    def reduce(f: tuple[int, int]) -> tuple[int, int]:
        g = gcd(f[0], f[1]) or 1
        return f[0] // g, f[1] // g
    return reduce(e) == reduce(a)


# ==================== 月份到期队列 ====================

async def get_due_months(db: AsyncSession, limit: int = 50) -> list[VocabularyWord]:
    """取月份听写的到期队列。无到期时返回所有月份。"""
    now = datetime.utcnow()
    q = await db.execute(
        select(VocabularyWord)
        .where(
            and_(
                VocabularyWord.category == "dictation",
                VocabularyWord.source_conversation_id == DICTATION_SOURCE,
                VocabularyWord.next_review_at <= now,
            )
        )
        .order_by(VocabularyWord.next_review_at.asc().nullsfirst())
        .limit(limit)
    )
    due = list(q.scalars().all())
    if due:
        return due
    q2 = await db.execute(
        select(VocabularyWord)
        .where(
            and_(
                VocabularyWord.category == "dictation",
                VocabularyWord.source_conversation_id == DICTATION_SOURCE,
            )
        )
        .order_by(VocabularyWord.next_review_at.asc().nullsfirst())
        .limit(limit)
    )
    return list(q2.scalars().all())


# ==================== 听力单词到期队列 ====================

async def get_due_listening_words(db: AsyncSession, limit: int = 50) -> list[VocabularyWord]:
    """从 category='listening' 的词里取到期的。

    排除 dictation 内置题，只取用户的听力单词。无到期时返回所有（让用户能随时练）。
    """
    now = datetime.utcnow()
    base_filter = and_(
        VocabularyWord.category == "listening",
    )
    q = await db.execute(
        select(VocabularyWord)
        .where(and_(base_filter, VocabularyWord.next_review_at <= now))
        .order_by(VocabularyWord.next_review_at.asc().nullsfirst())
        .limit(limit)
    )
    due = list(q.scalars().all())
    if due:
        return due
    q2 = await db.execute(
        select(VocabularyWord)
        .where(base_filter)
        .order_by(VocabularyWord.next_review_at.asc().nullsfirst())
        .limit(limit)
    )
    return list(q2.scalars().all())
