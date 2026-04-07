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
        category: 作业类别 ('speaking' / 'writing')

    Returns:
        评分字典或 None（未找到有效评分时）
    """
    if not text:
        return None

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
