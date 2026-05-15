"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { ScheduleTask, StudyPlanStatus, StudyPlanProgress } from "@/types";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Target, Sparkles, Check,
  Loader2, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_COLORS: Record<string, string> = {
  writing: "bg-blue-500",
  speaking: "bg-green-500",
  reading: "bg-purple-500",
  listening: "bg-orange-500",
  vocabulary: "bg-pink-500",
  other: "bg-gray-500",
};

const CATEGORY_LABELS: Record<string, string> = {
  writing: "写作",
  speaking: "口语",
  reading: "阅读",
  listening: "听力",
  vocabulary: "词汇",
  other: "其他",
};

export default function StudyPlanPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [status, setStatus] = useState<StudyPlanStatus | null>(null);
  const [progress, setProgress] = useState<StudyPlanProgress | null>(null);
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [quote, setQuote] = useState<{ content: string; note: string } | null>(null);

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(-1); // -1 = not initialized yet
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [initialized, setInitialized] = useState(false);

  const PLAN_START_STR = status?.start_date || "2026-05-06";
  const PLAN_END_STR = status?.end_date || "2026-06-28";

  // Use string-based date calc to avoid object identity issues
  const totalWeeks = useMemo(() => {
    const s = new Date(PLAN_START_STR + "T12:00:00Z");
    const e = new Date(PLAN_END_STR + "T12:00:00Z");
    return Math.ceil(((e.getTime() - s.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
  }, [PLAN_START_STR, PLAN_END_STR]);

  const getWeekStartStr = useCallback((offset: number) => {
    // Use UTC to avoid timezone shifts
    const start = new Date(PLAN_START_STR + "T12:00:00Z");
    const dayOfWeek = start.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(start);
    monday.setUTCDate(monday.getUTCDate() + mondayOffset + offset * 7);
    return monday.toISOString().split("T")[0];
  }, [PLAN_START_STR]);

  const effectiveWeekOffset = weekOffset >= 0 ? weekOffset : 0;
  const weekStartStr = useMemo(() => getWeekStartStr(effectiveWeekOffset), [getWeekStartStr, effectiveWeekOffset]);

  const weekDates = useMemo(() => {
    const dates: string[] = [];
    const ws = new Date(weekStartStr + "T12:00:00Z");
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setUTCDate(d.getUTCDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }
    return dates;
  }, [weekStartStr]);

  // Fetch status + progress + all tasks once on mount
  const fetchAll = useCallback(async () => {
    try {
      const [st, pr] = await Promise.all([
        api.getStudyPlanStatus(),
        api.getStudyPlanProgress(),
      ]);
      setStatus(st);
      setProgress(pr);

      if (st.exists) {
        // Fetch ALL plan tasks at once (only ~380 records)
        const data = await api.getScheduleTasks(st.start_date, st.end_date);
        setTasks(data);
      }

      // Set initial week offset based on current day
      if (!initialized && st.exists) {
        const planS = new Date(st.start_date + "T12:00:00Z");
        // Calculate Monday of plan start week
        const planDow = planS.getUTCDay();
        const planMondayOffset = planDow === 0 ? -6 : 1 - planDow;
        const planMonday = new Date(planS);
        planMonday.setUTCDate(planMonday.getUTCDate() + planMondayOffset);

        // Calculate Monday of current week
        const today = new Date();
        const todayStr = today.toISOString().split("T")[0];
        const todayUTC = new Date(todayStr + "T12:00:00Z");
        const todayDow = todayUTC.getUTCDay();
        const todayMondayOffset = todayDow === 0 ? -6 : 1 - todayDow;
        const todayMonday = new Date(todayUTC);
        todayMonday.setUTCDate(todayMonday.getUTCDate() + todayMondayOffset);

        // Week offset = difference in weeks between the two Mondays
        const diff = Math.round((todayMonday.getTime() - planMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
        const tw = Math.ceil(((new Date(st.end_date + "T12:00:00Z").getTime() - planS.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
        setWeekOffset(Math.max(0, Math.min(diff, tw - 1)));
        // Set selectedDate to today if within plan range
        if (todayStr >= st.start_date && todayStr <= st.end_date) {
          setSelectedDate(todayStr);
        } else if (todayStr < st.start_date) {
          setSelectedDate(st.start_date);
        } else {
          setSelectedDate(st.end_date);
        }
        setInitialized(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [initialized]);

  // Scroll week tab into view when weekOffset changes or initialized
  useEffect(() => {
    if (initialized && weekOffset >= 0) {
      setTimeout(() => {
        const el = document.getElementById(`week-tab-${weekOffset}`);
        if (el) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }, 200);
    }
  }, [weekOffset, initialized]);

  useEffect(() => {
    fetchAll();
    // Fetch daily motivational quote via backend proxy + AI translate
    fetch("/api/study-plan/quote", { credentials: "same-origin" })
      .then((r) => { if (!r.ok) throw new Error("quote fetch failed"); return r.json(); })
      .then((data) => {
        if (data?.q) {
          const en = `${data.q} —— ${data.a}`;
          setQuote({ content: en, note: "" });
          // 异步翻译，不阻塞显示
          api.translateText(data.q)
            .then((tr) => { if (tr?.meaning) setQuote({ content: en, note: tr.meaning }); })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Current week index for highlighting "today's week"
  const currentWeekOfPlan = useMemo(() => {
    const today = new Date();
    const todayNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
    const s = new Date(PLAN_START_STR + "T12:00:00Z");
    const diff = Math.floor((todayNoon.getTime() - s.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return Math.max(0, Math.min(diff, totalWeeks - 1));
  }, [PLAN_START_STR, totalWeeks]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await api.generateStudyPlan();
      toast({ description: res.message });
      setInitialized(false);
      await fetchAll();
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "生成失败" });
    } finally {
      setGenerating(false);
    }
  };

  const handleToggle = async (task: ScheduleTask) => {
    // Optimistic update
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, done: !t.done } : t));
    try {
      await api.updateScheduleTask(task.id, { done: !task.done });
      // Refresh status
      const st = await api.getStudyPlanStatus();
      setStatus(st);
    } catch {
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, done: task.done } : t));
    }
  };

  const handleReset = async () => {
    if (!confirm("确定要重置备考计划吗？所有计划任务将被删除。")) return;
    try {
      await api.resetStudyPlan();
      toast({ description: "计划已重置" });
      setStatus(null);
      setProgress(null);
      setTasks([]);
      setInitialized(false);
      setWeekOffset(-1);
      await fetchAll();
    } catch {
      toast({ variant: "destructive", description: "重置失败" });
    }
  };

  // Tasks for selected date
  const dayTasks = useMemo(
    () => tasks.filter((t) => t.scheduled_date === selectedDate)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [tasks, selectedDate],
  );

  // Week stats
  const weekStats = useMemo(() => {
    const weekTasks = tasks.filter((t) => t.source === "plan_phase3");
    const done = weekTasks.filter((t) => t.done).length;
    return { total: weekTasks.length, done };
  }, [tasks]);

  if (status === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not generated yet — show onboarding
  if (!status?.exists) {
    return (
      <div className="min-h-screen bg-background">
        <Header router={router} />
        <main className="container mx-auto px-4 py-12 max-w-xl text-center">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-950/40 dark:to-orange-950/30 mb-6">
            <Target className="h-10 w-10 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold mb-3">生成备考计划</h2>
          <p className="text-muted-foreground mb-2">
            第三阶段：2025年5月6日 → 6月28日（54天）
          </p>
          <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
            系统将根据你的时间安排，自动生成每日学习任务：写作句型背诵、精听复盘、写作/口语交替练习、周末套题等。
            生成后可自由编辑每天的任务。
          </p>
          <Button
            size="lg"
            className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            {generating ? "生成中..." : "生成备考计划"}
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header router={router} onReset={handleReset} />

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Phase Info */}
        <div className="mb-6 rounded-xl border bg-gradient-to-r from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-semibold">Day {status.current_day}/{status.total_days}</span>
              <span className="text-xs text-muted-foreground ml-2">
                {status.days_remaining > 0 ? `距考试 ${status.days_remaining} 天` : "考试日！"}
              </span>
            </div>
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {status.completion_pct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
              style={{ width: `${status.completion_pct}%` }}
            />
          </div>
          {/* Daily Quote */}
          {quote && (
            <div className="mt-3 text-center">
              <p className="text-xs italic text-foreground/60 leading-relaxed">{quote.content}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{quote.note}</p>
            </div>
          )}
        </div>

        {/* Category Progress Pills */}
        {progress && (
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.entries(progress.by_category).map(([cat, data]) => (
              <div key={cat} className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
                <div className={`h-2 w-2 rounded-full ${CATEGORY_COLORS[cat] || "bg-gray-500"}`} />
                <span className="text-xs font-medium">
                  {CATEGORY_LABELS[cat] || cat} {data.done}/{data.total}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Week Tabs */}
        <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1" id="week-tabs-container">
          {Array.from({ length: totalWeeks }, (_, i) => (
            <button
              key={i}
              id={`week-tab-${i}`}
              onClick={() => {
                setWeekOffset(i);
                // If this week contains today, select today; otherwise select first day of that week
                const weekFirstDay = getWeekStartStr(i);
                const todayStr = new Date().toISOString().split("T")[0];
                const weekLastDay = (() => { const d = new Date(weekFirstDay + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 6); return d.toISOString().split("T")[0]; })();
                if (todayStr >= weekFirstDay && todayStr <= weekLastDay) {
                  setSelectedDate(todayStr);
                } else {
                  // Select first day that's within plan range
                  const firstInPlan = weekFirstDay >= PLAN_START_STR ? weekFirstDay : PLAN_START_STR;
                  setSelectedDate(firstInPlan);
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                weekOffset === i
                  ? "bg-primary text-primary-foreground"
                  : i === currentWeekOfPlan
                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              W{i + 1}
              {i === currentWeekOfPlan && weekOffset !== i && " ·"}
            </button>
          ))}
          {totalWeeks > 8 && (
            <button
              onClick={() => { setWeekOffset(totalWeeks - 1); setSelectedDate(getWeekStartStr(totalWeeks - 1)); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300"
            >
              冲刺
            </button>
          )}
        </div>

        {/* Day Selector */}
        <div className="grid grid-cols-7 gap-1 mb-6">
          {weekDates.map((dateStr) => {
            const d = new Date(dateStr + "T00:00:00");
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === new Date().toISOString().split("T")[0];
            const dayTaskCount = tasks.filter((t) => t.scheduled_date === dateStr).length;
            const dayDoneCount = tasks.filter((t) => t.scheduled_date === dateStr && t.done).length;
            const inPlanRange = dateStr >= (status?.start_date || "") && dateStr <= (status?.end_date || "");
            const dayLabel = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`relative rounded-lg p-2 text-center transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : isToday
                      ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700"
                      : inPlanRange
                        ? "hover:bg-accent"
                        : "opacity-40"
                }`}
              >
                <div className="text-[10px] leading-none mb-1">{dayLabel}</div>
                <div className="text-lg font-bold leading-none">{d.getDate()}</div>
                {dayTaskCount > 0 && (
                  <div className={`mx-auto mt-1 h-1.5 w-1.5 rounded-full ${
                    dayDoneCount === dayTaskCount ? "bg-emerald-500" :
                    dayDoneCount > 0 ? "bg-amber-500" : "bg-muted-foreground/30"
                  }`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Date Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("zh-CN", {
              month: "long", day: "numeric", weekday: "short",
            })}
            {selectedDate === new Date().toISOString().split("T")[0] && (
              <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">今天</span>
            )}
          </h3>
          <span className="text-xs text-muted-foreground">
            {dayTasks.filter((t) => t.done).length}/{dayTasks.length} 完成
          </span>
        </div>

        {/* Task List */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm animate-pulse">加载中...</div>
        ) : dayTasks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            该日暂无任务
          </div>
        ) : (
          <div className="space-y-2">
            {dayTasks.map((task) => (
              <div
                key={task.id}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
                  task.done ? "opacity-60 bg-muted/30" : "bg-card hover:shadow-sm"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleToggle(task)}
                  className={`h-5 w-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-colors ${
                    task.done
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "border-muted-foreground/30 hover:border-emerald-500"
                  }`}
                >
                  {task.done && <Check className="h-3 w-3" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${task.done ? "line-through" : ""}`}>
                    {task.title}
                  </div>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {task.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {task.category && (
                    <span className={`h-2 w-2 rounded-full ${CATEGORY_COLORS[task.category] || "bg-gray-400"}`} />
                  )}
                  {task.start_time && (
                    <span className="text-xs text-muted-foreground">{task.start_time}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Week Summary */}
        <div className="mt-8 rounded-xl border bg-card p-4">
          <h4 className="text-sm font-semibold mb-3">本周概览</h4>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              完成 {weekStats.done}/{weekStats.total} 项
            </span>
            <span className="font-medium">
              {weekStats.total > 0 ? Math.round((weekStats.done / weekStats.total) * 100) : 0}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${weekStats.total > 0 ? (weekStats.done / weekStats.total) * 100 : 0}%` }}
            />
          </div>

          {/* Milestones */}
          {progress?.milestones && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <MilestonePill
                label="大作文"
                done={progress.milestones.writing_big_done || 0}
                total={progress.milestones.writing_big_total || 0}
              />
              <MilestonePill
                label="小作文"
                done={progress.milestones.writing_small_done || 0}
                total={progress.milestones.writing_small_total || 0}
              />
              <MilestonePill
                label="口语录音"
                done={progress.milestones.speaking_done || 0}
                total={progress.milestones.speaking_total || 0}
              />
              <MilestonePill
                label="听力套题"
                done={progress.milestones.listening_done || 0}
                total={progress.milestones.listening_total || 0}
              />
              <MilestonePill
                label="阅读套题"
                done={progress.milestones.reading_done || 0}
                total={progress.milestones.reading_total || 0}
              />
              <MilestonePill
                label="句型背诵"
                done={progress.milestones.templates_done || 0}
                total={progress.milestones.templates_total || 0}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Header({ router, onReset }: { router: ReturnType<typeof useRouter>; onReset?: () => void }) {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-amber-500" />
            备考计划
          </h1>
        </div>
        {onReset && (
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={onReset}>
            <RefreshCw className="h-3 w-3" />
            重置
          </Button>
        )}
      </div>
    </header>
  );
}

function MilestonePill({ label, done, total }: { label: string; done: number; total: number }) {
  if (total === 0) return null;
  return (
    <div className="rounded-lg bg-muted/50 p-2 text-center">
      <div className="font-semibold">{done}/{total}</div>
      <div className="text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
