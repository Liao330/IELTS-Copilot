"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Homework, HomeworkDateGroup } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Plus, ChevronLeft, ChevronRight, Upload,
  FileText, Mic, BookOpen, Headphones, Calendar, Trash2, Pencil,
  MessageSquarePlus, Star, Search, Loader2, Sparkles, X,
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
  const [minScore, setMinScore] = useState<number | undefined>(undefined);

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ homework_id: string; title: string; category: string; homework_date: string; relevance_reason: string }[] | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.searchHomeworks(searchQuery.trim(), category || undefined);
      setSearchResults(res.results);
      if (res.results.length === 0) {
        toast({ description: `在 ${res.total_searched} 份作业中未找到相关内容` });
      }
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "搜索失败" });
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
  };

  // 日历导航状态
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [calViewYear, setCalViewYear] = useState(currentYear);
  // null = 未选月份（年视图），非 null = 已选月份（日视图）
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<number | null>(null);

  // 每月作业计数（年视图用）
  const [monthCounts, setMonthCounts] = useState<Record<number, number>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let startDate: string | undefined;
      let endDate: string | undefined;

      if (filterYear !== null && filterMonth !== null) {
        startDate = `${filterYear}-${String(filterMonth).padStart(2, "0")}-01`;
        const endM = filterMonth === 12 ? 1 : filterMonth + 1;
        const endY = filterMonth === 12 ? filterYear + 1 : filterYear;
        endDate = `${endY}-${String(endM).padStart(2, "0")}-01`;
      }

      const hwPromise = api.getHomeworks({ category: category || undefined, start_date: startDate, end_date: endDate, min_score: minScore });

      if (filterYear !== null && filterMonth !== null) {
        const [hw, cal] = await Promise.all([
          hwPromise,
          api.getHomeworkCalendar(filterYear, filterMonth),
        ]);
        setHomeworks(hw);
        setCalendarData(cal);
      } else {
        const hw = await hwPromise;
        setHomeworks(hw);
        setCalendarData([]);
      }
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "加载失败" });
    } finally {
      setLoading(false);
    }
  }, [category, filterYear, filterMonth, minScore, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 获取年视图下每月的作业计数
  useEffect(() => {
    const fetchMonthCounts = async () => {
      const counts: Record<number, number> = {};
      const promises = Array.from({ length: 12 }, (_, i) => i + 1).map(async (m) => {
        try {
          const cal = await api.getHomeworkCalendar(calViewYear, m);
          const total = cal.reduce((sum, d) => sum + d.total, 0);
          if (total > 0) counts[m] = total;
        } catch { /* ignore */ }
      });
      await Promise.all(promises);
      setMonthCounts(counts);
    };
    fetchMonthCounts();
  }, [calViewYear]);

  const handleSelectMonth = (month: number) => {
    setFilterYear(calViewYear);
    setFilterMonth(month);
    setSelectedDate(null);
  };

  const handleBackToYear = () => {
    setFilterYear(null);
    setFilterMonth(null);
    setSelectedDate(null);
  };

  const prevMonth = () => {
    if (filterMonth === null || filterYear === null) return;
    if (filterMonth === 1) {
      setFilterYear(filterYear - 1);
      setFilterMonth(12);
      setCalViewYear(filterYear - 1);
    } else {
      setFilterMonth(filterMonth - 1);
    }
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (filterMonth === null || filterYear === null) return;
    if (filterMonth === 12) {
      setFilterYear(filterYear + 1);
      setFilterMonth(1);
      setCalViewYear(filterYear + 1);
    } else {
      setFilterMonth(filterMonth + 1);
    }
    setSelectedDate(null);
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

  // Calendar grid (only when month is selected)
  const calendarMap = new Map(calendarData.map((d) => [d.date, d]));
  const firstDay = filterYear !== null && filterMonth !== null ? new Date(filterYear, filterMonth - 1, 1) : null;
  const daysInMonth = filterYear !== null && filterMonth !== null ? new Date(filterYear, filterMonth, 0).getDate() : 0;
  const startDow = firstDay ? firstDay.getDay() : 0;
  const today = new Date().toISOString().slice(0, 10);

  const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

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
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => router.push("/homeworks/batch-feedback")}>
            <MessageSquarePlus className="h-4 w-4" />
            批量反馈
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            添加作业
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {/* AI 语义搜索 */}
        <div className="mb-4 rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                placeholder="AI 搜索：描述你想找的内容，如「口语中道歉相关的练习」「听力 Section 3 学术讨论」"
                className="w-full rounded-md border bg-background px-9 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              size="sm"
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="gap-1.5 shrink-0"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              搜索
            </Button>
          </div>

          {/* 搜索结果 */}
          {searchResults !== null && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">
                  找到 {searchResults.length} 份相关作业
                </span>
                <button type="button" onClick={clearSearch} className="text-xs text-muted-foreground hover:text-foreground">
                  清除搜索
                </button>
              </div>
              {searchResults.map((r) => {
                const CatIcon = CATEGORY_ICONS[r.category] || FileText;
                return (
                  <button
                    key={r.homework_id}
                    type="button"
                    onClick={() => router.push(`/homeworks/${r.homework_id}`)}
                    className="w-full flex items-start gap-3 rounded-md border p-3 text-left hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center justify-center h-8 w-8 rounded-md bg-gradient-to-br from-violet-400 to-purple-500 text-white shrink-0 mt-0.5">
                      <CatIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm truncate">{r.title}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {CATEGORY_LABELS[r.category] || r.category}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground shrink-0">{r.homework_date}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{r.relevance_reason}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 两级日历导航 */}
        <div className="mb-6 rounded-lg border bg-card p-4">
          {filterMonth === null ? (
            /* ===== 年视图：年份切换 + 12 月份网格 ===== */
            <>
              <div className="flex items-center justify-between mb-4">
                <Button variant="ghost" size="icon" onClick={() => setCalViewYear(calViewYear - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-medium text-base">{calViewYear}年</span>
                <Button variant="ghost" size="icon" onClick={() => setCalViewYear(calViewYear + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {MONTH_LABELS.map((label, i) => {
                  const month = i + 1;
                  const count = monthCounts[month] || 0;
                  const isCurrentMonth = calViewYear === currentYear && month === currentMonth;
                  const isFuture = calViewYear > currentYear || (calViewYear === currentYear && month > currentMonth);

                  return (
                    <button
                      key={month}
                      onClick={() => handleSelectMonth(month)}
                      className={`relative flex flex-col items-center py-3 rounded-lg text-sm font-medium transition-all ${
                        isCurrentMonth
                          ? "bg-primary/10 text-primary font-bold ring-1 ring-primary/30"
                          : isFuture
                          ? "text-muted-foreground/40 cursor-default"
                          : count > 0
                          ? "hover:bg-muted cursor-pointer"
                          : "text-muted-foreground hover:bg-muted/50 cursor-pointer"
                      }`}
                    >
                      <span>{label}</span>
                      {count > 0 && (
                        <span className={`mt-1 text-xs px-1.5 py-0.5 rounded-full ${
                          isCurrentMonth
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {count}篇
                        </span>
                      )}
                      {isCurrentMonth && !count && (
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 筛选状态提示 */}
              <div className="mt-3 text-center text-xs text-muted-foreground">
                点击月份查看详情，当前显示全部作业
              </div>
            </>
          ) : (
            /* ===== 月视图：月份切换 + 日期日历 ===== */
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground" onClick={handleBackToYear}>
                    <ChevronLeft className="h-3 w-3" />
                    返回年视图
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-medium min-w-[5rem] text-center">{filterYear}年{filterMonth}月</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="w-[5.5rem]" /> {/* 占位平衡 */}
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
                  const dateStr = `${filterYear}-${String(filterMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
            </>
          )}
        </div>

        {/* 分类筛选 */}
        <div className="flex flex-wrap gap-2 mb-3">
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

        {/* 分数趋势图（仅子类 tab 时显示） */}
        {category && <ScoreTrendChart homeworks={homeworks} category={category} />}

        {/* 高分筛选 */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Star className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs text-muted-foreground mr-1">按得分筛选:</span>
          {[
            { label: "不限", value: undefined },
            { label: "≥6.0", value: 6.0 },
            { label: "≥6.5", value: 6.5 },
            { label: "≥7.0", value: 7.0 },
            { label: "≥7.5", value: 7.5 },
          ].map((opt) => (
            <button
              key={opt.label}
              onClick={() => setMinScore(opt.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                minScore === opt.value
                  ? "bg-amber-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 作业列表，按日期分组 */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground animate-pulse">加载中...</div>
        ) : sortedDates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-2">还没有作业记录</p>
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
                    // 写作/口语分数来自 ai_report，听力/阅读来自 auto_scores
                    const aiScore = hw.feedbacks.find(
                      (fb) => fb.feedback_type === "ai_report" && fb.scores
                    )?.scores;
                    const autoScore = hw.feedbacks.find(
                      (fb) => fb.feedback_type === "auto_scores" && fb.scores
                    )?.scores as { overall?: number; raw_score?: number; raw_total?: number } | undefined;
                    const displayScore = aiScore?.overall ?? autoScore?.overall;
                    const displayRaw = autoScore ? `${autoScore.raw_score}/${autoScore.raw_total}` : null;
                    const visibleFbCount = hw.feedbacks.filter(
                      (fb) => fb.feedback_type !== "auto_scores"
                    ).length;
                    return (
                      <div
                        key={hw.id}
                        className="rounded-lg border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer group relative"
                        onClick={() => router.push(`/homeworks/${hw.id}`)}
                      >
                        <div className="absolute top-2 right-2 flex items-center gap-0.5">
                          {displayScore != null && (
                            <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold mr-1 ${
                              displayScore >= 7 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
                              displayScore >= 6 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" :
                              "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                            }`}>
                              <Star className="h-3 w-3" />
                              {displayScore % 1 === 0 ? displayScore.toFixed(0) : displayScore.toFixed(1)}
                              {displayRaw && (
                                <span className="text-[10px] font-normal ml-0.5 opacity-75">
                                  ({displayRaw})
                                </span>
                              )}
                            </span>
                          )}
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
                              {visibleFbCount > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  💬 {visibleFbCount}条反馈
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


// ==================== 分数趋势图 ====================

function ScoreTrendChart({ homeworks, category }: { homeworks: Homework[]; category: string }) {
  const router = useRouter();
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; date: string; score: number } | null>(null);

  // 提取该类别下有分数的作业，按日期排序
  const dataPoints = useMemo(() => {
    const points: { id: string; date: string; score: number; title: string }[] = [];
    for (const hw of homeworks) {
      if (hw.category !== category) continue;
      for (const fb of hw.feedbacks) {
        if (fb.scores?.overall) {
          points.push({
            id: hw.id,
            date: hw.homework_date,
            score: fb.scores.overall,
            title: hw.title,
          });
          break;
        }
      }
    }
    points.sort((a, b) => a.date.localeCompare(b.date));
    return points;
  }, [homeworks, category]);

  if (dataPoints.length < 2) {
    return null; // 至少 2 个数据点才显示图表
  }

  const scores = dataPoints.map((d) => d.score);
  const minScore = Math.floor(Math.min(...scores) - 0.5);
  const maxScore = Math.ceil(Math.max(...scores) + 0.5);
  const range = maxScore - minScore || 1;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  // SVG 尺寸
  const W = 600;
  const H = 160;
  const PAD_L = 35;
  const PAD_R = 15;
  const PAD_T = 15;
  const PAD_B = 30;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const toX = (i: number) => PAD_L + (i / (dataPoints.length - 1)) * chartW;
  const toY = (s: number) => PAD_T + chartH - ((s - minScore) / range) * chartH;

  // 折线路径
  const linePath = dataPoints.map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(d.score).toFixed(1)}`).join(" ");

  // Y 轴刻度
  const yTicks: number[] = [];
  for (let s = minScore; s <= maxScore; s += 0.5) {
    if (s === Math.round(s) || s === Math.round(s) + 0.5) yTicks.push(s);
  }

  const CATEGORY_COLORS_LINE: Record<string, string> = {
    writing: "#3b82f6",
    speaking: "#22c55e",
    reading: "#a855f7",
    listening: "#f97316",
  };
  const lineColor = CATEGORY_COLORS_LINE[category] || "#3b82f6";

  return (
    <div className="mb-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground">
          📈 {CATEGORY_LABELS[category] || category}分数趋势
        </h3>
        <span className="text-[10px] text-muted-foreground">
          平均 {avg.toFixed(1)} · {dataPoints.length} 次
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 180 }}>
        {/* Y 轴刻度线 */}
        {yTicks.map((s) => (
          <g key={s}>
            <line x1={PAD_L} x2={W - PAD_R} y1={toY(s)} y2={toY(s)} stroke="currentColor" strokeOpacity={0.08} />
            <text x={PAD_L - 5} y={toY(s) + 3} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.4}>
              {s}
            </text>
          </g>
        ))}

        {/* 平均线 */}
        <line x1={PAD_L} x2={W - PAD_R} y1={toY(avg)} y2={toY(avg)} stroke={lineColor} strokeOpacity={0.25} strokeDasharray="4 4" />

        {/* 折线 */}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {/* 数据点（可点击 + 悬浮提示） */}
        {dataPoints.map((d, i) => (
          <g
            key={i}
            className="cursor-pointer"
            onClick={() => router.push(`/homeworks/${d.id}`)}
            onMouseEnter={(e) => {
              const svg = e.currentTarget.closest("svg");
              if (!svg) return;
              const rect = svg.getBoundingClientRect();
              const scaleX = rect.width / W;
              const scaleY = rect.height / H;
              setTooltip({
                x: rect.left + toX(i) * scaleX,
                y: rect.top + toY(d.score) * scaleY - 10,
                title: d.title,
                date: d.date,
                score: d.score,
              });
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            <circle cx={toX(i)} cy={toY(d.score)} r={4} fill={lineColor} />
            <circle cx={toX(i)} cy={toY(d.score)} r={8} fill={lineColor} fillOpacity={0} className="hover:fill-opacity-15" />
            {/* 分数标签 */}
            <text x={toX(i)} y={toY(d.score) - 8} textAnchor="middle" fontSize={9} fontWeight={600} fill={lineColor}>
              {d.score}
            </text>
          </g>
        ))}

        {/* X 轴日期（只显示首尾和间隔的） */}
        {dataPoints.map((d, i) => {
          if (dataPoints.length <= 6 || i === 0 || i === dataPoints.length - 1 || i % Math.ceil(dataPoints.length / 5) === 0) {
            return (
              <text key={i} x={toX(i)} y={H - 5} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.4}>
                {d.date.slice(5)} {/* MM-DD */}
              </text>
            );
          }
          return null;
        })}
      </svg>

      {/* 悬浮提示框 */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none animate-in fade-in-0 duration-100"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="bg-popover border rounded-lg shadow-lg px-3 py-2 text-xs whitespace-nowrap">
            <p className="font-semibold">{tooltip.title}</p>
            <p className="text-muted-foreground">{tooltip.date} · {tooltip.score} 分</p>
          </div>
        </div>
      )}
    </div>
  );
}
