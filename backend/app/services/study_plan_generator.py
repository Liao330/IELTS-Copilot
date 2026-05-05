"""
Phase 3 Study Plan Generator (May 6 → June 28, 54 days)

Generates daily study tasks based on the user's schedule:
- Workdays: office time (句型+精听), gym (单词), evening (写作/口语交替)
- Weekends: full sessions (套题+复盘+写作+口语)
- Sprint (last 10 days): intensive full-day schedule
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import List, Dict, Any

PLAN_SOURCE = "plan_phase3"

# 2026年调休安排：周末变工作日 / 工作日变休息日
# 周六日上班（按工作日安排）
WORKDAY_OVERRIDES: set[date] = {
    date(2026, 5, 9),   # 五一调休，周六上班
}
# 工作日放假（按周末安排）
HOLIDAY_OVERRIDES: set[date] = set()


def generate_phase3_tasks(
    start: date = date(2026, 5, 6),
    end: date = date(2026, 6, 28),
) -> List[Dict[str, Any]]:
    """生成第三阶段备考计划的所有任务。返回 ScheduleTaskCreate 兼容的字典列表。"""
    tasks: List[Dict[str, Any]] = []

    # Counters
    essay_big = 0       # target 25
    essay_small = 0     # target 12
    speaking_rec = 0
    speaking_part = 1   # start from Part 1 (increments weekly on Monday)
    listening_test = 0
    reading_test = 0
    template_day = 0    # workday counter for sentence templates (target ~18)

    sprint_start = end - timedelta(days=9)  # June 19

    current = start
    day_num = 0

    while current <= end:
        day_num += 1
        weekday = current.weekday()  # 0=Mon, 6=Sun
        # 调休判断：覆盖默认的周末/工作日
        if current in WORKDAY_OVERRIDES:
            is_weekend = False  # 调休上班，按工作日排
        elif current in HOLIDAY_OVERRIDES:
            is_weekend = True   # 放假，按周末排
        else:
            is_weekend = weekday >= 5
        is_sprint = current >= sprint_start
        is_monday = weekday == 0
        date_str = current.isoformat()

        day_tasks: List[Dict[str, Any]] = []
        sort_order = 0

        def add(title: str, category: str, start_time: str | None,
                duration: int | None, description: str | None = None,
                tag: str | None = None):
            nonlocal sort_order
            sort_order += 1
            day_tasks.append({
                "title": title,
                "category": category,
                "scheduled_date": date_str,
                "start_time": start_time,
                "duration_minutes": duration,
                "description": description,
                "sort_order": sort_order,
                "source": PLAN_SOURCE,
                "plan_tag": tag,
            })

        if is_monday:
            speaking_part += 1

        # ─── SPRINT PERIOD (last 10 days, full-time) ───
        if is_sprint:
            sprint_day = (current - sprint_start).days + 1
            _generate_sprint_day(
                add, current, weekday, day_num,
                essay_big, essay_small, speaking_rec,
                listening_test, reading_test, speaking_part,
            )
            # Update counters based on sprint day pattern
            if sprint_day in (1, 4, 7):
                # Mock day: L + R + W + S (no new numbered essays, just timed practice)
                pass
            elif sprint_day in (2, 5, 8):
                # L+W day
                listening_test += 1
                if essay_big < 25:
                    essay_big += 1
                elif essay_small < 12:
                    essay_small += 1
            elif sprint_day in (3, 6, 9):
                # R+S day
                reading_test += 1
                speaking_rec += 1

        # ─── WEEKEND ───
        elif is_weekend:
            if weekday == 5:  # Saturday
                # Morning: listening test + review
                listening_test += 1
                add(f"听力套题练习 #{listening_test}", "listening", "09:00", 60,
                    "完整套题计时，重点看 P1+P4 正确率 (目标14/20+)",
                    f"听力套题#{listening_test}")
                add("听力精听复盘", "listening", "10:00", 90,
                    "复盘错题答案句 → 标记障碍词 → 生成练习")

                # Afternoon: writing
                _wt = _add_writing_task(add, essay_big, essay_small, "14:00", 90, template_day)
                if _wt == "big":
                    essay_big += 1
                elif _wt == "small":
                    essay_small += 1
                add("写作完成 & 上传作业库", "writing", "15:30", 60,
                    "上传作业库存档，发给老师等批改反馈")

                # Evening: speaking
                speaking_rec += 1
                part_num = ((speaking_part - 1) % 3) + 1
                add(f"口语准备 + 录音 #{speaking_rec}", "speaking", "19:00", 90,
                    f"Part {part_num}，先列关键词，尝试脱稿",
                    f"口语录音#{speaking_rec}")

            else:  # Sunday
                # Morning: reading test
                reading_test += 1
                add(f"阅读套题练习 #{reading_test}", "reading", "09:00", 60,
                    "完整套题，目标7分拉分项",
                    f"阅读套题#{reading_test}")
                add("阅读错题分析", "reading", "10:00", 60,
                    "分析错误原因，积累同义替换")

                # Afternoon: reading intensive + some listening
                add("阅读薄弱题型专项", "reading", "14:00", 90,
                    "针对错误率高的题型集中练习")
                add("听力精听 + 练习句听写", "listening", "15:30", 90,
                    "复盘本周精听障碍词，做听写练习")

                # Evening: review + writing
                add("本周学习回顾", "other", "19:00", 60,
                    "查看完成情况，调整下周计划")
                _wt = _add_writing_task(add, essay_big, essay_small, "20:00", 60, template_day)
                if _wt == "big":
                    essay_big += 1
                elif _wt == "small":
                    essay_small += 1

            # Both weekend days: vocabulary
            add("背单词", "vocabulary", None, 60, "手机 APP 刷词")

        # ─── WORKDAY ───
        else:
            template_day += 1

            # Morning office (10:20-10:50) — 到工位后
            if template_day <= 18:
                add(f"写作句型背诵 (Day {template_day})", "writing", "10:20", 15,
                    "新学5条 + 复习到期句型，打开写作句型背诵模块",
                    f"句型Day{template_day}")
            else:
                add("写作句型复习", "writing", "10:20", 15,
                    "全量复习巩固，默写测试")
            add("精听练习句听写", "listening", "10:35", 15,
                "对已生成的练习句做听写训练")

            # Lunch break (12:30-13:00) — 看着学习
            add("午间学习", "listening", "12:30", 30,
                "精听复盘 / 看错题笔记 / 背单词")

            # Afternoon office (14:00-15:00)
            add("精听复盘", "listening", "14:00", 60,
                "复盘错句，标记障碍词，AI生成梯度练习")

            # Dinner (19:00-19:20) — 晚餐背诵
            add("晚餐背诵", "vocabulary", "19:00", 20,
                "吃饭时手机背单词或复习句型")

            # Gym: vocabulary
            add("背单词 (健身房)", "vocabulary", None, 60, "手机 APP 刷词")

            # Late evening (23:00-24:00): alternating
            if weekday in (0, 2, 4):  # Mon/Wed/Fri — writing
                _wt = _add_writing_task(add, essay_big, essay_small, "23:00", 60, template_day)
                if _wt == "big":
                    essay_big += 1
                elif _wt == "small":
                    essay_small += 1
            else:  # Tue/Thu — speaking
                speaking_rec += 1
                part_num = ((speaking_part - 1) % 3) + 1
                add(f"口语录音练习 #{speaking_rec}", "speaking", "23:00", 60,
                    f"Part {part_num}，关键词法→脱稿",
                    f"口语录音#{speaking_rec}")

        tasks.extend(day_tasks)
        current += timedelta(days=1)

    return tasks


def _add_writing_task(add, essay_big: int, essay_small: int,
                      start_time: str, duration: int,
                      template_day: int = 0) -> str:
    """根据阶段决定写大作文还是小作文。返回 "big"/"small"/"none"。
    策略：前4周（template_day<=20）集中练大作文，之后穿插小作文。
    """
    if template_day <= 18:
        phase_hint = "对照句型库写，边抄边熟悉句型"
    elif template_day <= 36:
        phase_hint = "先默写不看句型库，写完对照检查"
    else:
        phase_hint = "限时练习，不翻句型库"

    # 阶段集中：前20个写作日全大作文，之后穿插小作文
    if essay_big < 25 and (template_day <= 20 or essay_small >= 12):
        num = essay_big + 1
        add(f"写作大作文 #{num}", "writing", start_time, duration,
            f"{phase_hint}，同时积累素材",
            f"大作文#{num}")
        return "big"
    elif essay_small < 12:
        num = essay_small + 1
        add(f"写作小作文 #{num}", "writing", start_time, duration,
            f"{phase_hint}",
            f"小作文#{num}")
        return "small"
    elif essay_big < 25:
        num = essay_big + 1
        add(f"写作大作文 #{num}", "writing", start_time, duration,
            f"{phase_hint}",
            f"大作文#{num}")
        return "big"
    else:
        add("写作加练", "writing", start_time, duration,
            "自选题目，尝试限时练习")
        return "none"


def _generate_sprint_day(
    add, current: date, weekday: int, day_num: int,
    essay_big: int, essay_small: int, speaking_rec: int,
    listening_test: int, reading_test: int, speaking_part: int,
):
    """冲刺期每日安排（全职备考，6/19-6/28）"""
    sprint_day = (current - date(2026, 6, 19)).days + 1  # 1-10

    if sprint_day == 10:
        # 考前最后一天：轻松复习
        add("回顾所有错题笔记", "other", "09:00", 90, "浏览作业库中的复盘笔记")
        add("写作句型快速过一遍", "writing", "10:30", 60, "全部89条快速闪卡")
        add("听力单词复习", "vocabulary", "14:00", 60, "单词本中听力分类")
        add("口语关键词回顾", "speaking", "15:00", 60, "过一遍所有Part话题关键词")
        add("早睡准备考试", "other", "21:00", None, "放松心态，22:00前睡觉")
        return

    if sprint_day in (1, 4, 7):
        # 模考日：上午全科
        add("模考 - 听力", "listening", "09:00", 40, "完整套题计时")
        add("模考 - 阅读", "reading", "09:45", 60, "完整套题计时")
        add("模考 - 写作", "writing", "11:00", 60, "Task1(20min) + Task2(40min) 严格限时!")
        add("午休", "other", "12:00", 60)
        add("模考复盘 - 听力精听", "listening", "14:00", 90, "错题精听复盘")
        add("模考复盘 - 阅读错题", "reading", "15:30", 60, "分析错题原因")
        add("模考复盘 - 写作反馈", "writing", "17:00", 60, "上传作业库，发老师批改")
        add("口语模拟", "speaking", "19:00", 60, "完整Part1+2+3模拟")
    elif sprint_day in (2, 5, 8):
        # 专项突破日：听力+写作
        lt = listening_test + 1
        add(f"听力专项 - 薄弱题型 #{lt}", "listening", "09:00", 90,
            "P1填空/P4填空 专项",
            f"听力套题#{lt}")
        add("听力精听复盘", "listening", "10:30", 90, "精听+障碍词+听写")
        # Sprint writing uses numbered essays (限时)
        if essay_big < 25:
            n = essay_big + 1
            add(f"写作大作文 #{n} (限时)", "writing", "14:00", 60,
                "严格限时40min，不翻句型库",
                f"大作文#{n}")
        elif essay_small < 12:
            n = essay_small + 1
            add(f"写作小作文 #{n} (限时)", "writing", "14:00", 60,
                "严格限时20min，不翻句型库",
                f"小作文#{n}")
        else:
            add("写作限时加练", "writing", "14:00", 60, "自选题目严格限时")
        add("写作反馈分析", "writing", "15:00", 60, "上传作业库，复盘+句型巩固")
        add("句型默写测试", "writing", "16:30", 30, "随机抽10条默写")
        add("口语录音", "speaking", "19:00", 60, "每题2遍: 关键词→脱稿")
    else:  # sprint_day in (3, 6, 9)
        # 专项突破日：阅读+口语
        rt = reading_test + 1
        add(f"阅读专项 #{rt}", "reading", "09:00", 60,
            "套题/薄弱题型",
            f"阅读套题#{rt}")
        add("阅读错题精读", "reading", "10:00", 60, "同义替换+长难句")
        add("听力练习句听写", "listening", "11:00", 60, "复习所有障碍词")
        add("口语全真模拟", "speaking", "14:00", 90,
            "Part1+2+3 完整模拟，录音+回听")
        add("口语反馈复盘", "speaking", "15:30", 60, "整理常见错误")
        add("写作句型复习", "writing", "17:00", 60, "重点句型默写")
        add("单词总复习", "vocabulary", "19:00", 60, "高频错词+听力生词")

    # All sprint days: vocabulary
    add("背单词", "vocabulary", None, 60, "手机 APP 刷词 + 单词本复习")
