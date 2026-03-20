"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Agent, Conversation, DailyReportResponse, StudyPlanCurrentDayOut } from "@/types";
import { AgentCard } from "@/components/agent/AgentCard";
import {
  Settings, BookMarked, Library, BookOpen, TrendingUp, ArrowRight,
  Target, Loader2, Sparkles, ChevronRight, CheckCircle2, Circle,
  CalendarCheck, FileText, Mic, Headphones, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { DailyBriefContent } from "@/components/reports/DailyBriefContent";

const SUBJECT_META: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  listening: { label: "听力", icon: Headphones, color: "text-orange-600 dark:text-orange-400" },
  speaking: { label: "口语", icon: Mic, color: "text-green-600 dark:text-green-400" },
  reading: { label: "阅读", icon: BookOpen, color: "text-purple-600 dark:text-purple-400" },
  writing: { label: "写作", icon: FileText, color: "text-blue-600 dark:text-blue-400" },
};

export default function HomePage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  // Daily brief state
  const [dailyReport, setDailyReport] = useState<DailyReportResponse | null>(null);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [dailyError, setDailyError] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Study plan state
  const [planDay, setPlanDay] = useState<StudyPlanCurrentDayOut | null>(null);
  const [planLoading, setPlanLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getAgents(),
      api.getConversations({ page_size: 5 }),
    ])
      .then(([agentsData, convsData]) => {
        setAgents(agentsData);
        setRecentConversations(convsData.conversations);
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    // Load today's daily report for the card
    api.getDailyReport()
      .then(setDailyReport)
      .catch(() => setDailyError(true))
      .finally(() => setDailyLoading(false));

    // Load current study plan day
    api.getCurrentDay()
      .then(setPlanDay)
      .catch(() => {})
      .finally(() => setPlanLoading(false));
  }, []);

  // Force-regenerate daily report
  const handleRegenDaily = async () => {
    setDailyLoading(true);
    setDailyError(false);
    try {
      const data = await api.getDailyReport({ force: true });
      setDailyReport(data);
    } catch {
      setDailyError(true);
    } finally {
      setDailyLoading(false);
    }
  };

  const handleStartChat = async (agentId: string) => {
    try {
      const conv = await api.createConversation({ agent_id: agentId });
      router.push(`/chat/${conv.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">加载中...</div>
      </div>
    );
  }

  // Extract brief info from daily report for the card
  const briefOverview = dailyReport?.ai_report?.overview;
  const briefActions = dailyReport?.ai_report?.tomorrow_actions?.slice(0, 2);
  const todayCount = dailyReport?.stats?.homework_count ?? 0;
  const todayFeedback = dailyReport?.stats?.feedback_count ?? 0;

  // Build task items from plan day
  const planTasks = planDay?.day
    ? (["listening", "speaking", "reading", "writing"] as const)
        .filter((subj) => planDay.day![subj])
        .map((subj) => ({
          subject: subj,
          task: planDay.day![subj]!,
          completed: !!planDay.day![`${subj}_homework_id` as keyof typeof planDay.day],
        }))
    : [];
  const completedCount = planTasks.filter((t) => t.completed).length;
  const progressPercent = planTasks.length > 0 ? Math.round((completedCount / planTasks.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            🎓 IELTS Copilot
          </h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/settings")}
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* ====== Study Plan - Today's Tasks Card ====== */}
        {!planLoading && planDay && planTasks.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => router.push("/study-plan")}
              className="w-full rounded-xl border-2 border-emerald-300/40 bg-gradient-to-br from-emerald-50 via-teal-50/60 to-cyan-50 dark:from-emerald-950/30 dark:via-teal-950/20 dark:to-cyan-950/20 dark:border-emerald-700/30 hover:shadow-lg hover:shadow-emerald-100/50 dark:hover:shadow-emerald-900/20 transition-all duration-300 p-5 text-left group"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm">
                    <CalendarCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                      今日任务 · Day {planDay.current_day}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {planDay.plan_title} · 共 {planDay.total_days} 天
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  管理计划
                  <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </div>

              {/* Progress bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">今日进度</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {completedCount}/{planTasks.length} 完成
                  </span>
                </div>
                <div className="h-2 rounded-full bg-emerald-100 dark:bg-emerald-900/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Task list */}
              <div className="space-y-1.5">
                {planTasks.map((t) => {
                  const meta = SUBJECT_META[t.subject];
                  const Icon = meta.icon;
                  return (
                    <div
                      key={t.subject}
                      className={`flex items-start gap-2 text-sm rounded-lg px-2.5 py-1.5 ${
                        t.completed
                          ? "bg-emerald-100/60 dark:bg-emerald-900/20"
                          : "bg-white/60 dark:bg-white/5"
                      }`}
                    >
                      {t.completed ? (
                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/40" />
                      )}
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.color}`} />
                      <span className={`flex-1 line-clamp-1 ${t.completed ? "line-through text-muted-foreground" : "text-foreground/80"}`}>
                        <span className="font-medium">{meta.label}</span>
                        <span className="mx-1 text-muted-foreground/40">|</span>
                        {t.task}
                      </span>
                    </div>
                  );
                })}
              </div>
            </button>
          </div>
        )}

        {/* No active plan — subtle prompt */}
        {!planLoading && !planDay && (
          <div className="mb-6">
            <button
              onClick={() => router.push("/study-plan")}
              className="w-full rounded-xl border border-dashed border-muted-foreground/20 hover:border-emerald-400/50 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10 transition-all duration-300 p-4 text-left group flex items-center gap-3"
            >
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-muted/50 group-hover:bg-gradient-to-br group-hover:from-emerald-400 group-hover:to-teal-500 group-hover:text-white transition-all">
                <CalendarCheck className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                  上传学习计划 PDF，开始每日打卡
                </p>
                <p className="text-xs text-muted-foreground">
                  支持解析老师的 40 天雅思备考计划
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-emerald-500 transition-colors" />
            </button>
          </div>
        )}

        {/* ====== Daily Brief Card — 首页亮点区域 ====== */}
        <div className="mb-8">
          <button
            onClick={() => setSheetOpen(true)}
            className="w-full rounded-xl border-2 border-amber-300/40 bg-gradient-to-br from-amber-50 via-orange-50/60 to-yellow-50 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-yellow-950/20 dark:border-amber-700/30 hover:shadow-lg hover:shadow-amber-100/50 dark:hover:shadow-amber-900/20 transition-all duration-300 p-5 text-left group"
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                    今日学习回顾
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                查看完整报告
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>

            {/* Content area */}
            {dailyLoading ? (
              <div className="flex items-center gap-2 py-3 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">AI 正在生成今日回顾...</span>
              </div>
            ) : dailyError ? (
              <p className="text-sm text-muted-foreground py-2">
                日报加载失败，点击查看详情
              </p>
            ) : dailyReport ? (
              <div className="space-y-2.5">
                {/* Mini stats */}
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-white/10 px-2.5 py-1 font-medium">
                    📝 作业 {todayCount}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-white/10 px-2.5 py-1 font-medium">
                    💬 反馈 {todayFeedback}
                  </span>
                  {dailyReport.stats.categories.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-white/10 px-2.5 py-1 font-medium">
                      📚 {dailyReport.stats.categories.join(" · ")}
                    </span>
                  )}
                </div>

                {/* Overview */}
                {briefOverview && (
                  <p className="text-sm leading-relaxed text-foreground/80 line-clamp-2">
                    {briefOverview}
                  </p>
                )}

                {/* Tomorrow actions preview */}
                {briefActions && briefActions.length > 0 && (
                  <div className="flex flex-col gap-1 pt-1">
                    <span className="text-xs font-semibold text-amber-700/70 dark:text-amber-400/70 flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      明日建议
                    </span>
                    {briefActions.map((action, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-foreground/70">
                        <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-amber-600/60" />
                        <span className="line-clamp-1">{action}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </button>
        </div>

        {/* ====== IELTS Copilot 主助手 ====== */}
        <div className="mb-8">
          <button
            onClick={() => handleStartChat("ielts-copilot")}
            className="w-full rounded-xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 hover:from-primary/10 hover:to-primary/20 transition-all duration-300 p-6 text-left group"
          >
            <div className="flex items-center gap-4">
              <span className="text-4xl">🎓</span>
              <div className="flex-1">
                <h2 className="text-xl font-bold mb-1 group-hover:text-primary transition-colors">
                  IELTS Copilot
                </h2>
                <p className="text-sm text-muted-foreground">
                  智能全能助手 — 直接提问或发送材料，自动调用最合适的专项助手为你解答
                </p>
              </div>
              <div className="text-primary opacity-0 group-hover:opacity-100 transition-opacity text-2xl">
                →
              </div>
            </div>
          </button>
        </div>

        <h2 className="text-lg font-semibold mb-4 text-muted-foreground">或选择专项助手</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {agents.filter(a => a.id !== "ielts-copilot").map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onStart={() => handleStartChat(agent.id)}
            />
          ))}
        </div>

        {recentConversations.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <span className="inline-block w-1 h-5 bg-primary rounded-full" />
              最近对话
            </h3>
            <div className="space-y-2">
              {recentConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => router.push(`/chat/${conv.id}`)}
                  className="w-full text-left p-3 rounded-lg hover:bg-accent transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">📝</span>
                    <span className="truncate text-sm font-medium">
                      {conv.title || "新对话"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {new Date(conv.updated_at).toLocaleDateString("zh-CN")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 space-y-3">
          <Button
            variant="outline"
            className="w-full h-12 text-base gap-2"
            onClick={() => router.push("/study-plan")}
          >
            <CalendarCheck className="h-5 w-5" />
            📋 学习计划
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 text-base gap-2"
            onClick={() => router.push("/reports")}
          >
            <TrendingUp className="h-5 w-5" />
            📊 完整报告 & 趋势分析
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 text-base gap-2"
            onClick={() => router.push("/vocabulary")}
          >
            <BookOpen className="h-5 w-5" />
            📖 单词本
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 text-base gap-2"
            onClick={() => router.push("/homeworks")}
          >
            <Library className="h-5 w-5" />
            📚 作业库
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 text-base gap-2"
            onClick={() => router.push("/notes")}
          >
            <BookMarked className="h-5 w-5" />
            📒 我的笔记
          </Button>
        </div>
      </main>

      {/* ====== Sheet: Full Daily Brief ====== */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              今日学习回顾
            </SheetTitle>
            <SheetDescription className="flex items-center justify-between">
              <span>
                {new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs h-7"
                onClick={handleRegenDaily}
                disabled={dailyLoading}
              >
                {dailyLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                重新生成
              </Button>
            </SheetDescription>
          </SheetHeader>
          <DailyBriefContent
            report={dailyReport}
            loading={dailyLoading}
            error={dailyError}
            onViewFull={() => { setSheetOpen(false); router.push("/reports"); }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
