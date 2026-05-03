"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { ScheduleTask, ScheduleTaskCreate } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Plus, ChevronLeft, ChevronRight, Check,  Trash2,
  Clock, Calendar as CalendarIcon,
} from "lucide-react";

const CATEGORY_OPTIONS = [
  { value: "writing", label: "写作", color: "bg-blue-500", lightBg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-300" },
  { value: "speaking", label: "口语", color: "bg-green-500", lightBg: "bg-green-50 dark:bg-green-950/30", text: "text-green-700 dark:text-green-300" },
  { value: "reading", label: "阅读", color: "bg-purple-500", lightBg: "bg-purple-50 dark:bg-purple-950/30", text: "text-purple-700 dark:text-purple-300" },
  { value: "listening", label: "听力", color: "bg-orange-500", lightBg: "bg-orange-50 dark:bg-orange-950/30", text: "text-orange-700 dark:text-orange-300" },
  { value: "vocabulary", label: "词汇", color: "bg-pink-500", lightBg: "bg-pink-50 dark:bg-pink-950/30", text: "text-pink-700 dark:text-pink-300" },
  { value: "other", label: "其他", color: "bg-gray-500", lightBg: "bg-gray-50 dark:bg-gray-950/30", text: "text-gray-700 dark:text-gray-300" },
];

function getCategoryInfo(cat: string | null) {
  return CATEGORY_OPTIONS.find((c) => c.value === cat) || CATEGORY_OPTIONS[5];
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getWeekDays(baseDate: Date): Date[] {
  const start = new Date(baseDate);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday first
  start.setDate(start.getDate() + diff);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

export default function SchedulePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(formatDate(new Date()));
  const [showAddForm, setShowAddForm] = useState(false);

  const weekDays = getWeekDays(currentDate);

  const fetchTasks = useCallback(async () => {
    try {
      const from = formatDate(weekDays[0]);
      const to = formatDate(weekDays[6]);
      const data = await api.getScheduleTasks(from, to);
      setTasks(data);
    } catch {
      toast({ variant: "destructive", description: "加载日程失败" });
    } finally {
      setLoading(false);
    }
  }, [currentDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const goWeek = (delta: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + delta * 7);
    setCurrentDate(d);
    setSelectedDate(formatDate(d));
  };

  const goToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(formatDate(new Date()));
  };

  const handleToggle = async (task: ScheduleTask) => {
    // Optimistic update
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, done: !t.done } : t));
    try {
      await api.updateScheduleTask(task.id, { done: !task.done });
    } catch {
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, done: task.done } : t));
    }
  };

  const handleDelete = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await api.deleteScheduleTask(id);
    } catch {
      fetchTasks();
    }
  };

  const handleAdd = async (data: ScheduleTaskCreate) => {
    try {
      const created = await api.createScheduleTask(data);
      setTasks((prev) => [...prev, created]);
      setShowAddForm(false);
    } catch {
      toast({ variant: "destructive", description: "添加失败" });
    }
  };

  const todayStr = formatDate(new Date());
  const selectedTasks = tasks
    .filter((t) => t.scheduled_date === selectedDate)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
      if (a.start_time) return -1;
      if (b.start_time) return 1;
      return a.sort_order - b.sort_order;
    });

  // Count per day for the week
  const dayCountMap: Record<string, { total: number; done: number }> = {};
  tasks.forEach((t) => {
    if (!dayCountMap[t.scheduled_date]) dayCountMap[t.scheduled_date] = { total: 0, done: 0 };
    dayCountMap[t.scheduled_date].total++;
    if (t.done) dayCountMap[t.scheduled_date].done++;
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <CalendarIcon className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold flex-1">学习日程</h1>
          <Button size="sm" variant="outline" onClick={goToday} className="text-xs">
            今天
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 max-w-2xl space-y-4">
        {/* Week navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => goWeek(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-sm font-medium">
            {weekDays[0].toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
            {" — "}
            {weekDays[6].toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
          </span>
          <Button variant="ghost" size="icon" onClick={() => goWeek(1)}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Week day selector */}
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((d, i) => {
            const ds = formatDate(d);
            const isToday = ds === todayStr;
            const isSelected = ds === selectedDate;
            const counts = dayCountMap[ds];
            return (
              <button
                key={ds}
                type="button"
                onClick={() => setSelectedDate(ds)}
                className={`flex flex-col items-center gap-0.5 rounded-lg py-2 transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : isToday
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-accent"
                }`}
              >
                <span className="text-[10px] font-medium opacity-70">{WEEKDAY_LABELS[i]}</span>
                <span className={`text-lg font-bold leading-none ${isSelected ? "" : ""}`}>
                  {d.getDate()}
                </span>
                {counts && counts.total > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {counts.done === counts.total ? (
                      <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-primary-foreground/60" : "bg-emerald-500"}`} />
                    ) : (
                      <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-primary-foreground/60" : "bg-amber-500"}`} />
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected day header */}
        <div className="flex items-center justify-between pt-2">
          <h2 className="font-semibold text-sm">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("zh-CN", {
              month: "long", day: "numeric", weekday: "short",
            })}
            {selectedDate === todayStr && (
              <span className="ml-1.5 text-xs font-normal text-primary">今天</span>
            )}
          </h2>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 h-7 text-xs"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="h-3 w-3" />
            添加
          </Button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <AddTaskForm
            date={selectedDate}
            onAdd={handleAdd}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {/* Task list */}
        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm animate-pulse">加载中...</div>
        ) : selectedTasks.length === 0 && !showAddForm ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-muted-foreground text-sm">这天还没有安排</p>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAddForm(true)}>
              <Plus className="h-3.5 w-3.5" />
              添加学习任务
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={() => handleToggle(task)}
                onDelete={() => handleDelete(task.id)}
              />
            ))}
          </div>
        )}

        {/* Week summary */}
        {tasks.length > 0 && (
          <div className="pt-4 border-t">
            <WeekSummary tasks={tasks} />
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Task Card ────────────────────────────────────────────

function TaskCard({
  task, onToggle, onDelete,
}: {
  task: ScheduleTask; onToggle: () => void; onDelete: () => void;
}) {
  const cat = getCategoryInfo(task.category);

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 transition-all group ${
      task.done ? "opacity-60 bg-muted/30" : "bg-card"
    }`}>
      {/* Checkbox */}
      <button
        type="button"
        onClick={onToggle}
        className={`mt-0.5 h-5 w-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-colors ${
          task.done
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "border-muted-foreground/30 hover:border-emerald-500"
        }`}
      >
        {task.done && <Check className="h-3 w-3" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${task.done ? "line-through text-muted-foreground" : ""}`}>
            {task.title}
          </span>
          {task.category && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cat.lightBg} ${cat.text}`}>
              {cat.label}
            </span>
          )}
        </div>
        {task.description && (
          <p className={`text-xs text-muted-foreground ${task.done ? "line-through" : ""}`}>
            {task.description}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {task.start_time && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {task.start_time}
            </span>
          )}
          {task.duration_minutes && (
            <span>{task.duration_minutes} 分钟</span>
          )}
        </div>
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 mt-0.5"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Add Task Form ────────────────────────────────────────

function AddTaskForm({
  date, onAdd, onCancel,
}: {
  date: string;
  onAdd: (data: ScheduleTaskCreate) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onAdd({
      title: title.trim(),
      description: description.trim() || undefined,
      category: category || undefined,
      scheduled_date: date,
      start_time: startTime || undefined,
      duration_minutes: duration ? parseInt(duration) : undefined,
    });
    setSaving(false);
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 animate-in fade-in-0 slide-in-from-top-2 duration-200">
      <Input
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) handleSubmit(); }}
        placeholder='任务名称，如"完成口语 Part 2 练习"'
        className="text-sm"
      />

      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_OPTIONS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(category === c.value ? "" : c.value)}
            className={`text-xs px-2.5 py-1 rounded-full transition-all ${
              category === c.value
                ? `${c.color} text-white`
                : `${c.lightBg} ${c.text} hover:opacity-80`
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="text-xs h-8"
            placeholder="开始时间"
          />
        </div>
        <div className="w-24">
          <Input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="分钟"
            className="text-xs h-8"
            min={5}
            step={5}
          />
        </div>
      </div>

      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="备注（可选）"
        className="text-xs"
      />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          取消
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!title.trim() || saving}>
          {saving ? "添加中..." : "添加"}
        </Button>
      </div>
    </div>
  );
}

// ─── Week Summary ─────────────────────────────────────────

function WeekSummary({ tasks }: { tasks: ScheduleTask[] }) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Category breakdown
  const catCounts: Record<string, number> = {};
  tasks.forEach((t) => {
    const cat = t.category || "other";
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });

  // Total minutes planned
  const totalMinutes = tasks.reduce((sum, t) => sum + (t.duration_minutes || 0), 0);

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        本周概览
      </h3>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <div className="text-2xl font-bold">{done}/{total}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">完成任务</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <div className="text-2xl font-bold">{pct}%</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">完成率</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <div className="text-2xl font-bold">
            {totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)}h${totalMinutes % 60 > 0 ? totalMinutes % 60 : ""}` : `${totalMinutes}m`}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">规划时长</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Category dots */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(catCounts).map(([cat, count]) => {
          const info = getCategoryInfo(cat);
          return (
            <span key={cat} className={`text-[10px] px-2 py-0.5 rounded-full ${info.lightBg} ${info.text}`}>
              {info.label} ×{count}
            </span>
          );
        })}
      </div>
    </div>
  );
}
