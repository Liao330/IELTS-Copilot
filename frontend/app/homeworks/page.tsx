"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Homework, HomeworkDateGroup } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Plus, ChevronLeft, ChevronRight, Upload,
  FileText, Mic, BookOpen, Headphones, Calendar, Trash2, Pencil,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CreateHomeworkDialog } from "@/components/homework/CreateHomeworkDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CATEGORIES = [
  { value: "", label: "全部", icon: Calendar },
  { value: "writing", label: "写作", icon: FileText },
  { value: "speaking", label: "口语", icon: Mic },
  { value: "reading", label: "阅读", icon: BookOpen },
  { value: "listening", label: "听力", icon: Headphones },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  writing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  speaking: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  reading: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  listening: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const CATEGORY_LABELS: Record<string, string> = {
  writing: "写作", speaking: "口语", reading: "阅读", listening: "听力",
};

const CATEGORY_ICONS: Record<string, typeof FileText> = {
  writing: FileText, speaking: Mic, reading: BookOpen, listening: Headphones,
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
}

export default function HomeworksPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [category, setCategory] = useState("");
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [calendarData, setCalendarData] = useState<HomeworkDateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = `${viewYear}-${String(viewMonth).padStart(2, "0")}-01`;
      const endMonth = viewMonth === 12 ? 1 : viewMonth + 1;
      const endYear = viewMonth === 12 ? viewYear + 1 : viewYear;
      const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

      const [hw, cal] = await Promise.all([
        api.getHomeworks({ category: category || undefined, start_date: startDate, end_date: endDate }),
        api.getHomeworkCalendar(viewYear, viewMonth),
      ]);
      setHomeworks(hw);
      setCalendarData(cal);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "加载失败" });
    } finally {
      setLoading(false);
    }
  }, [category, viewYear, viewMonth, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(viewYear - 1); setViewMonth(12); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(viewYear + 1); setViewMonth(1); }
    else setViewMonth(viewMonth + 1);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.deleteHomework(deleteId);
      toast({ description: "作业已删除" });
      fetchData();
    } catch {
      toast({ variant: "destructive", description: "删除失败" });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  // Reset selectedDate when month changes
  useEffect(() => { setSelectedDate(null); }, [viewYear, viewMonth]);

  // Group homeworks by date
  const groupedByDate: Record<string, Homework[]> = {};
  for (const hw of homeworks) {
    const d = hw.homework_date;
    if (!groupedByDate[d]) groupedByDate[d] = [];
    groupedByDate[d].push(hw);
  }
  const filteredDates = selectedDate
    ? Object.keys(groupedByDate).filter((d) => d === selectedDate)
    : Object.keys(groupedByDate);
  const sortedDates = filteredDates.sort((a, b) => b.localeCompare(a));

  // Calendar grid
  const calendarMap = new Map(calendarData.map((d) => [d.date, d]));
  const firstDay = new Date(viewYear, viewMonth - 1, 1);
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const startDow = firstDay.getDay(); // 0=Sun
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">📚 作业库</h1>
          <div className="flex-1" />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => router.push("/homeworks/batch-upload")}>
            <Upload className="h-4 w-4" />
            批量上传
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            添加作业
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {/* 月份切换 + 日历 */}
        <div className="mb-6 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="icon" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium">{viewYear}年{viewMonth}月</span>
            <Button variant="ghost" size="icon" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
            {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startDow }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const data = calendarMap.get(dateStr);
              const isToday = dateStr === today;
              const isSelected = dateStr === selectedDate;
              const hasData = !!data;

              return (
                <div
                  key={day}
                  onClick={() => {
                    if (!hasData) return;
                    setSelectedDate(isSelected ? null : dateStr);
                  }}
                  className={`relative flex flex-col items-center py-1.5 rounded-md text-sm transition-colors ${
                    isSelected ? "bg-primary text-primary-foreground font-bold ring-2 ring-primary" :
                    isToday ? "bg-primary/10 font-bold" : ""
                  } ${hasData ? "cursor-pointer hover:bg-muted" : "text-muted-foreground cursor-default"}`}
                >
                  <span className={isSelected ? "" : isToday ? "text-primary" : ""}>{day}</span>
                  {data && (
                    <div className="flex gap-0.5 mt-0.5">
                      {Object.keys(data.categories).map((cat) => (
                        <span
                          key={cat}
                          className={`w-1.5 h-1.5 rounded-full ${
                            cat === "writing" ? "bg-blue-500" :
                            cat === "speaking" ? "bg-green-500" :
                            cat === "reading" ? "bg-purple-500" :
                            "bg-orange-500"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-4 mt-3 justify-center text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />写作</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />口语</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" />阅读</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" />听力</span>
          </div>
          {selectedDate && (
            <div className="mt-2 text-center">
              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setSelectedDate(null)}>
                已筛选: {formatDate(selectedDate)}
                <span className="ml-1">✕</span>
              </Button>
            </div>
          )}
        </div>

        {/* 分类筛选 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                category === c.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <c.icon className="h-3.5 w-3.5" />
              {c.label}
            </button>
          ))}
        </div>

        {/* 作业列表，按日期分组 */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground animate-pulse">加载中...</div>
        ) : sortedDates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-2">本月还没有作业记录</p>
            <p className="text-sm text-muted-foreground">点击右上角「添加作业」开始记录</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedDates.map((dateStr) => (
              <div key={dateStr}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {formatDate(dateStr)}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {groupedByDate[dateStr].map((hw) => {
                    const CatIcon = CATEGORY_ICONS[hw.category] || FileText;
                    return (
                      <div
                        key={hw.id}
                        className="rounded-lg border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer group relative"
                        onClick={() => router.push(`/homeworks/${hw.id}`)}
                      >
                        <div className="absolute top-2 right-2 flex items-center gap-0.5">
                          <button
                            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            onClick={(e) => { e.stopPropagation(); router.push(`/homeworks/${hw.id}?edit=1`); }}
                            title="编辑作业"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            onClick={(e) => { e.stopPropagation(); setDeleteId(hw.id); }}
                            title="删除作业"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${CATEGORY_COLORS[hw.category] || "bg-gray-100"}`}>
                            <CatIcon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-sm truncate">{hw.title}</h4>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" className="text-xs">
                                {CATEGORY_LABELS[hw.category]}
                              </Badge>
                              {hw.file_name && (
                                <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                  📎 {hw.file_name}
                                </span>
                              )}
                              {hw.feedbacks.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  💬 {hw.feedbacks.length}条反馈
                                </span>
                              )}
                            </div>
                            {hw.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{hw.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <CreateHomeworkDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => { fetchData(); setCreateOpen(false); }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除后无法恢复，确定要删除这份作业吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
