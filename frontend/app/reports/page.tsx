"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type {
  HomeworkSummaryResponse,
  DailyReportResponse,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  RefreshCw,
  TrendingUp,
  Calendar,
  Target,
  AlertTriangle,
  CheckCircle2,
  Repeat,
  ArrowRight,
  Loader2,
  BookMarked,
  FileText,
  Mic,
  BookOpen,
  Headphones,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_OPTIONS = [
  { value: "", label: "全部科目" },
  { value: "writing", label: "写作" },
  { value: "speaking", label: "口语" },
  { value: "reading", label: "阅读" },
  { value: "listening", label: "听力" },
] as const;

const CATEGORY_ICONS: Record<string, typeof FileText> = {
  写作: FileText,
  口语: Mic,
  阅读: BookOpen,
  听力: Headphones,
};

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  icon: Icon,
  children,
  className = "",
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border bg-card p-5 ${className}`}>
      <h3 className="font-semibold flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function BulletList({
  items,
  icon: Icon,
  emptyText = "暂无",
  iconClass = "text-muted-foreground",
}: {
  items: string[];
  icon: React.ElementType;
  emptyText?: string;
  iconClass?: string;
}) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconClass}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md border px-3 py-2 bg-muted/30">
      <span className="text-lg font-bold">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const router = useRouter();
  const { toast } = useToast();

  // Daily report state
  const [dailyReport, setDailyReport] = useState<DailyReportResponse | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [includeNotes, setIncludeNotes] = useState(false);

  // Summary state
  const [summary, setSummary] = useState<HomeworkSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryCategory, setSummaryCategory] = useState("");

  // Fetch daily report
  const fetchDaily = useCallback(async (force = false) => {
    setDailyLoading(true);
    setDailyError(null);
    try {
      const data = await api.getDailyReport({
        date: reportDate,
        include_notes: includeNotes,
        force,
      });
      setDailyReport(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载日报失败";
      setDailyError(msg);
      toast({ variant: "destructive", description: msg });
    } finally {
      setDailyLoading(false);
    }
  }, [reportDate, includeNotes, toast]);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const data = await api.getHomeworkSummary({
        limit: 5,
        category: summaryCategory || undefined,
      });
      setSummary(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载趋势总结失败";
      setSummaryError(msg);
      toast({ variant: "destructive", description: msg });
    } finally {
      setSummaryLoading(false);
    }
  }, [summaryCategory, toast]);

  // Auto-load on mount
  useEffect(() => {
    fetchDaily();
  }, [fetchDaily]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold flex-1">学习日报 & AI 总结</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-8">
        {/* ============================================================ */}
        {/* SECTION 1: Daily Report                                       */}
        {/* ============================================================ */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              每日学习回顾
            </h2>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fetchDaily(true)}
              disabled={dailyLoading}
            >
              {dailyLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {dailyLoading ? "生成中..." : "重新生成"}
            </Button>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="rounded-md border px-3 py-1.5 text-sm bg-background"
            />
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={includeNotes}
                onChange={(e) => setIncludeNotes(e.target.checked)}
                className="rounded"
              />
              <BookMarked className="h-3.5 w-3.5 text-muted-foreground" />
              包含笔记
            </label>
          </div>

          {/* Daily report content */}
          {dailyLoading && (
            <div className="flex items-center justify-center py-12 rounded-lg border border-dashed">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>AI 正在生成日报...</span>
              </div>
            </div>
          )}

          {dailyError && !dailyLoading && (
            <div className="flex items-center justify-center py-8 rounded-lg border border-destructive/30 bg-destructive/5">
              <span className="text-sm text-destructive">{dailyError}</span>
            </div>
          )}

          {dailyReport && !dailyLoading && (
            <div className="space-y-4">
              {/* Stats bar */}
              <div className="flex flex-wrap gap-3">
                <StatBadge label="日期" value={formatDate(dailyReport.date)} />
                <StatBadge label="完成作业" value={dailyReport.stats.homework_count} />
                <StatBadge label="新增反馈" value={dailyReport.stats.feedback_count} />
                {dailyReport.stats.categories.length > 0 && (
                  <div className="flex flex-col items-center gap-0.5 rounded-md border px-3 py-2 bg-muted/30">
                    <div className="flex gap-1">
                      {dailyReport.stats.categories.map((cat) => {
                        const CatIcon = CATEGORY_ICONS[cat] || FileText;
                        return (
                          <Badge key={cat} variant="secondary" className="text-xs gap-1 px-1.5 py-0">
                            <CatIcon className="h-3 w-3" />
                            {cat}
                          </Badge>
                        );
                      })}
                    </div>
                    <span className="text-xs text-muted-foreground">涉及科目</span>
                  </div>
                )}
              </div>

              {/* AI Report */}
              <SectionCard title="今日概览" icon={Calendar}>
                <p className="text-sm leading-relaxed">
                  {dailyReport.ai_report.overview || "暂无概览信息"}
                </p>
              </SectionCard>

              {dailyReport.ai_report.today_focus && dailyReport.ai_report.today_focus.length > 0 && (
                <SectionCard title="今日重点" icon={Target}>
                  <BulletList
                    items={dailyReport.ai_report.today_focus}
                    icon={CheckCircle2}
                    iconClass="text-green-600"
                  />
                </SectionCard>
              )}

              {dailyReport.ai_report.today_issues && dailyReport.ai_report.today_issues.length > 0 && (
                <SectionCard title="今日问题" icon={AlertTriangle}>
                  <BulletList
                    items={dailyReport.ai_report.today_issues}
                    icon={AlertTriangle}
                    iconClass="text-amber-500"
                  />
                </SectionCard>
              )}

              {dailyReport.ai_report.comparison_to_recent && (
                <SectionCard title="与近期对比" icon={TrendingUp}>
                  <p className="text-sm leading-relaxed">
                    {dailyReport.ai_report.comparison_to_recent}
                  </p>
                </SectionCard>
              )}

              {dailyReport.ai_report.tomorrow_actions && dailyReport.ai_report.tomorrow_actions.length > 0 && (
                <SectionCard title="明日建议行动" icon={ArrowRight}>
                  <BulletList
                    items={dailyReport.ai_report.tomorrow_actions}
                    icon={Target}
                    iconClass="text-primary"
                  />
                </SectionCard>
              )}
            </div>
          )}
        </section>

        {/* Divider */}
        <div className="border-t" />

        {/* ============================================================ */}
        {/* SECTION 2: Homework Trend Summary                             */}
        {/* ============================================================ */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              作业趋势总结
            </h2>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={fetchSummary}
              disabled={summaryLoading}
            >
              {summaryLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {summaryLoading ? "生成中..." : "重新生成"}
            </Button>
          </div>

          {/* Category filter */}
          <div className="flex flex-wrap gap-2 mb-4">
            {CATEGORY_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={summaryCategory === opt.value ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => setSummaryCategory(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          {/* Summary content */}
          {summaryLoading && (
            <div className="flex items-center justify-center py-12 rounded-lg border border-dashed">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>AI 正在分析最近作业趋势...</span>
              </div>
            </div>
          )}

          {summaryError && !summaryLoading && (
            <div className="flex items-center justify-center py-8 rounded-lg border border-destructive/30 bg-destructive/5">
              <span className="text-sm text-destructive">{summaryError}</span>
            </div>
          )}

          {summary && !summaryLoading && (
            <div className="space-y-4">
              {/* Stats bar */}
              <div className="flex flex-wrap gap-3">
                <StatBadge label="分析作业数" value={summary.source_count} />
                <StatBadge label="总反馈数" value={summary.stats.total_feedbacks} />
                {Object.entries(summary.stats.categories).map(([cat, count]) => (
                  <StatBadge key={cat} label={cat} value={count} />
                ))}
                {summary.stats.date_range && (
                  <StatBadge
                    label="时间跨度"
                    value={`${summary.stats.date_range.start.slice(5)} ~ ${summary.stats.date_range.end.slice(5)}`}
                  />
                )}
              </div>

              {/* AI Analysis */}
              <SectionCard title="总体概览" icon={TrendingUp}>
                <p className="text-sm leading-relaxed">
                  {summary.ai_summary.overview || "暂无概览信息"}
                </p>
                {summary.ai_summary.trend && (
                  <div className="mt-2">
                    <Badge variant="outline" className="text-xs">
                      趋势：{summary.ai_summary.trend}
                    </Badge>
                  </div>
                )}
              </SectionCard>

              {summary.ai_summary.strengths && summary.ai_summary.strengths.length > 0 && (
                <SectionCard title="近期进步点" icon={CheckCircle2}>
                  <BulletList
                    items={summary.ai_summary.strengths}
                    icon={CheckCircle2}
                    iconClass="text-green-600"
                  />
                </SectionCard>
              )}

              {summary.ai_summary.weaknesses && summary.ai_summary.weaknesses.length > 0 && (
                <SectionCard title="薄弱环节" icon={AlertTriangle}>
                  <BulletList
                    items={summary.ai_summary.weaknesses}
                    icon={AlertTriangle}
                    iconClass="text-amber-500"
                  />
                </SectionCard>
              )}

              {summary.ai_summary.repeated_issues && summary.ai_summary.repeated_issues.length > 0 && (
                <SectionCard title="反复出现的问题" icon={Repeat}>
                  <BulletList
                    items={summary.ai_summary.repeated_issues}
                    icon={Repeat}
                    iconClass="text-red-500"
                  />
                </SectionCard>
              )}

              {summary.ai_summary.next_actions && summary.ai_summary.next_actions.length > 0 && (
                <SectionCard title="下一步行动建议" icon={Target}>
                  <BulletList
                    items={summary.ai_summary.next_actions}
                    icon={ArrowRight}
                    iconClass="text-primary"
                  />
                </SectionCard>
              )}

              {/* Source reference */}
              {summary.source_homework_ids.length > 0 && (
                <div className="text-xs text-muted-foreground pt-2">
                  数据来源：基于最近 {summary.source_count} 次作业分析
                  {summary.stats.date_range && (
                    <span>（{summary.stats.date_range.start} ~ {summary.stats.date_range.end}）</span>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
