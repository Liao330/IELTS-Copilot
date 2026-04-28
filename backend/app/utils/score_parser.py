"""从 AI 报告文本中提取雅思评分信息。"""

from __future__ import annotations

import re
from typing import Optional


# ── Speaking 维度配置 ──────────────────────────────────────────────
SPEAKING_DIMENSIONS = [
    {
        "key": "FC",
        "label": "流利度和连贯性",
        "label_en": "Fluency & Coherence",
        "patterns": [
            r"Fluency\s+and\s+Coherence",
            r"流利度和连贯性",
            r"\bFC\b",
        ],
    },
    {
        "key": "LR",
        "label": "词汇资源",
        "label_en": "Lexical Resource",
        "patterns": [
            r"Lexical\s+Resource",
            r"词汇资源",
            r"词汇丰富程度",
        ],
    },
    {
        "key": "GRA",
        "label": "语法范围和准确性",
        "label_en": "Grammatical Range & Accuracy",
        "patterns": [
            r"Grammatical\s+Range\s+and\s+Accuracy",
            r"语法范围和准确性",
            r"语法多样性及准确性",
        ],
    },
    {
        "key": "PRON",
        "label": "发音",
        "label_en": "Pronunciation",
        "patterns": [
            r"Pronunciation",
            r"发音",
        ],
    },
]

# ── Writing 维度配置 ──────────────────────────────────────────────
WRITING_DIMENSIONS = [
    {
        "key": "TA",
        "label": "任务完成情况",
        "label_en": "Task Achievement",
        "patterns": [
            r"Task\s+Achievement",
            r"任务完成情况",
            r"Task\s+Response",
        ],
    },
    {
        "key": "CC",
        "label": "连贯与衔接",
        "label_en": "Coherence & Cohesion",
        "patterns": [
            r"Coherence\s+and\s+Cohesion",
            r"连贯与衔接",
        ],
    },
    {
        "key": "LR",
        "label": "词汇资源",
        "label_en": "Lexical Resource",
        "patterns": [
            r"Lexical\s+Resource",
            r"词汇丰富程度",
            r"词汇资源",
        ],
    },
    {
        "key": "GRA",
        "label": "语法范围和准确性",
        "label_en": "Grammatical Range & Accuracy",
        "patterns": [
            r"Grammatical\s+Range\s+and\s+Accuracy",
            r"语法多样性及准确性",
            r"语法范围和准确性",
        ],
    },
]


def _extract_score_near_keyword(text: str, keyword_pattern: str) -> Optional[float]:
    """在关键词附近查找分数。

    支持多种格式:
      - `关键词 (Score / 分数: 7)`
      - `关键词（Task Achievement）: 6`
      - `关键词: 6`
      - `关键词 ... (Score / 分数: Band 7)`
    """
    # 构建组合正则：关键词后方 200 字符内的第一个数字分数
    # 格式1: (Score / 分数: 7) 或 (Score: 7)
    pattern1 = keyword_pattern + r"[\s\S]{0,200}?(?:Score\s*/?\s*分数|Score)\s*[:：]\s*(?:Band\s*)?(\d+(?:\.\d+)?)"
    m = re.search(pattern1, text, re.IGNORECASE)
    if m:
        return float(m.group(1))

    # 格式2: 关键词）: 6 或 关键词): 6  (中文括号 + 冒号)
    pattern2 = keyword_pattern + r"[）\)]\s*[:：]\s*(\d+(?:\.\d+)?)"
    m = re.search(pattern2, text, re.IGNORECASE)
    if m:
        return float(m.group(1))

    # 格式3: 关键词 ... : 6 (同一行内)
    pattern3 = keyword_pattern + r"[^\n]{0,80}?[:：]\s*(\d+(?:\.\d+)?)"
    m = re.search(pattern3, text, re.IGNORECASE)
    if m:
        return float(m.group(1))

    return None


def _extract_overall(text: str) -> Optional[float]:
    """提取总分。"""
    patterns = [
        r"Overall\s+Score\s*/?\s*总分\s*[:：]\s*(?:Band\s*)?(\d+(?:\.\d+)?)",
        r"Overall\s+Score\s*[/／]\s*分数\s*[:：]\s*(?:Band\s*)?(\d+(?:\.\d+)?)",
        r"Overall\s*[:：]\s*(?:Band\s*)?(\d+(?:\.\d+)?)",
        r"总体评分\s*[:：]\s*(\d+(?:\.\d+)?)",
        r"总分\s*[:：]\s*(\d+(?:\.\d+)?)",
        r"Overall\s+Score\s*\)?[:：]\s*(\d+(?:\.\d+)?)",
        # 口语样本格式: "5. Overall Score / 总分 (Score / 分数: 7.0)**"
        r"Overall\s+Score[\s\S]{0,50}?(?:Score\s*/?\s*分数|Score)\s*[:：]\s*(?:Band\s*)?(\d+(?:\.\d+)?)",
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            return float(m.group(1))
    return None


def parse_scores(text: str, category: str) -> Optional[dict]:
    """从 AI 报告文本中提取雅思评分。

    Args:
        text: AI 报告的纯文本内容
        category: 作业类别 ('speaking' / 'writing' / 'listening' / 'reading')

    Returns:
        评分字典或 None（未找到有效评分时）
    """
    if not text:
        return None

    # 听力 / 阅读走专门的解析路径
    if category in ("listening", "reading"):
        return _parse_listening_reading_scores(text, category)

    # 根据类别选择维度配置；如果不确定则两套都试
    if category == "speaking":
        dim_configs = SPEAKING_DIMENSIONS
        cat_key = "speaking"
    elif category == "writing":
        dim_configs = WRITING_DIMENSIONS
        cat_key = "writing"
    else:
        # 尝试自动检测
        has_speaking = bool(re.search(r"Pronunciation|发音|Fluency\s+and\s+Coherence|流利度", text, re.IGNORECASE))
        has_writing = bool(re.search(r"Task\s+Achievement|任务完成情况|Task\s+Response", text, re.IGNORECASE))
        # 尝试听力/阅读
        has_lr = bool(re.search(r"总\s*\d+\s*/\s*40|Section|Part\s*\d|P[1234]\s*\d+\s*/\s*\d+", text))
        if has_lr and not has_speaking and not has_writing:
            return _parse_listening_reading_scores(text, "listening")  # 默认当听力试
        if has_speaking and not has_writing:
            dim_configs = SPEAKING_DIMENSIONS
            cat_key = "speaking"
        elif has_writing and not has_speaking:
            dim_configs = WRITING_DIMENSIONS
            cat_key = "writing"
        else:
            return None

    dimensions = []
    for dim in dim_configs:
        score = None
        for pattern in dim["patterns"]:
            score = _extract_score_near_keyword(text, pattern)
            if score is not None:
                break
        if score is not None:
            dimensions.append({
                "key": dim["key"],
                "label": dim["label"],
                "label_en": dim["label_en"],
                "score": score,
            })

    # 需要至少 3 个维度才认为解析有效
    if len(dimensions) < 3:
        return None

    overall = _extract_overall(text)
    if overall is None:
        # 如果没有找到总分，取各维度平均（四舍五入到 0.5）
        avg = sum(d["score"] for d in dimensions) / len(dimensions)
        overall = round(avg * 2) / 2

    return {
        "dimensions": dimensions,
        "overall": overall,
        "category": cat_key,
    }


# ── Listening / Reading 得分 → Band Score 转换表 ──────────────────
# 官方标准：https://www.ielts.org/-/media/pdfs/listening-and-reading-band-scores.pdf
LISTENING_BAND_TABLE: list[tuple[int, float]] = [
    (39, 9.0), (37, 8.5), (35, 8.0), (33, 7.5), (30, 7.0),
    (27, 6.5), (23, 6.0), (20, 5.5), (16, 5.0), (13, 4.5),
    (10, 4.0), (6, 3.5), (4, 3.0), (3, 2.5), (2, 2.0),
    (1, 1.0),
]

READING_BAND_TABLE: list[tuple[int, float]] = [
    (39, 9.0), (37, 8.5), (35, 8.0), (33, 7.5), (30, 7.0),
    (27, 6.5), (23, 6.0), (19, 5.5), (15, 5.0), (13, 4.5),
    (10, 4.0), (6, 3.5), (4, 3.0), (3, 2.5), (2, 2.0),
    (1, 1.0),
]


def _raw_to_band(raw: int, table: list[tuple[int, float]]) -> float:
    """原始分转 Band Score。"""
    for threshold, band in table:
        if raw >= threshold:
            return band
    return 0.0


def _parse_listening_reading_scores(text: str, category: str) -> Optional[dict]:
    """从听力/阅读复盘笔记中提取分数。

    识别的格式（大小写/空格宽容）：
      - 总分：`总 17/40`、`总分 26/40`、`总 26/40 分数6`
      - 各 Part：`P1 5/10`、`P2 8/13`、`Part 1: 5/10`、`Section 1 5/10`
      - 显式 Band：`分数6`、`分数 7.5`、`Band 7`
    """
    # 提取 Part 分数
    parts: list[dict] = []
    # 匹配 "P1 5/10" / "Part 1 5/10" / "Section 1 5/10" / "P1: 5/10"
    part_re = re.compile(
        r"(?:P(?:art|assage)?\s*|Section\s*)(\d)\s*[：:\s]\s*(\d+)\s*/\s*(\d+)",
        re.IGNORECASE,
    )
    for m in part_re.finditer(text):
        part_num = int(m.group(1))
        correct = int(m.group(2))
        total = int(m.group(3))
        parts.append({
            "part": part_num,
            "correct": correct,
            "total": total,
            "label": f"Part {part_num}" if category == "reading" else f"Section {part_num}",
        })

    # 去重（同一 part 可能出现多次，取第一次）
    seen_parts: set[int] = set()
    deduped: list[dict] = []
    for p in parts:
        if p["part"] not in seen_parts:
            seen_parts.add(p["part"])
            deduped.append(p)
    parts = deduped

    # 提取总分 "总 17/40" / "总分 26/40"
    total_raw: Optional[int] = None
    total_max: Optional[int] = None
    total_re = re.compile(r"总\s*(?:分)?\s*(\d+)\s*/\s*(\d+)")
    tm = total_re.search(text)
    if tm:
        total_raw = int(tm.group(1))
        total_max = int(tm.group(2))

    # 如果没有"总 X/Y"，尝试从 Parts 求和
    if total_raw is None and parts:
        total_raw = sum(p["correct"] for p in parts)
        total_max = sum(p["total"] for p in parts)

    if total_raw is None:
        return None

    # 提取显式 Band Score
    band: Optional[float] = None
    band_re = re.compile(r"(?:分数|Band|band\s*score)\s*[:：]?\s*(\d+(?:\.\d+)?)")
    bm = band_re.search(text)
    if bm:
        band = float(bm.group(1))

    # 推算 Band Score
    if band is None and total_max and total_max >= 40:
        table = LISTENING_BAND_TABLE if category == "listening" else READING_BAND_TABLE
        band = _raw_to_band(total_raw, table)

    cat_key = category if category in ("listening", "reading") else "listening"

    return {
        "category": cat_key,
        "overall": band,
        "raw_score": total_raw,
        "raw_total": total_max or 40,
        "parts": parts,
    }
