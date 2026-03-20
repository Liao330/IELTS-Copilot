"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { StudyPlanOut, StudyPlanDayOut } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Upload, Loader2, CheckCircle2, Circle, ChevronDown, ChevronUp,
  CalendarCheck, FileText, Mic, BookOpen, Headphones, Trash2, SkipForward,
  Link2, Unlink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SUBJECT_META: Record<string, { label: string; icon: typeof FileText; color: string; bgColor: string }> = {
  listening: { label: "听力", icon: Headphones, color: "text-orange-600 dark:text-orange-400", bgColor: "bg-orange-100 dark:bg-orange-900/30" },
  speaking: { label: "口语", icon: Mic, color: "text-green-600 dark:text-green-400", bgColor: "bg-green-100 dark:bg-green-900/30" },
  reading: { label: "阅读", icon: BookOpen, color: "text-purple-600 dark:text-purple-400", bgColor: "bg-purple-100 dark:bg-purple-900/30" },
  writing: { label: "写作", icon: FileText, color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
};

const SUBJECTS = ["listening", "speaking", "reading", "writing"] as const;

export default function StudyPlanPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [plan, setPlan] = useState<StudyPlanOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadPlan = useCallback(async () => {
    try {
      const data = await api.getActivePlan();
      setPlan(data);
      // Auto-expand current day
      if (data) setExpandedDay(data.current_day);
    } catch {
      // no plan
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  const handleUpload = async () => {
    // Use the existing file upload flow
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setParsing(true);
      try {
        // Step 1: Upload file
        const uploaded = await api.uploadFile(file);
        // Step 2: Parse into study plan
        const newPlan = await api.parsePlanPdf(uploaded.id);
        setPlan(newPlan);
        setExpandedDay(newPlan.current_day);
        toast({ title: "解析成功", description: `${newPlan.title} — ${newPlan.total_days} 天计划已创建` });
      } catch (err: unknown) {
        toast({ title: "解析失败", description: (err as Error).message, variant: "destructive" });
      } finally {
        setParsing(false);
      }
    };
    input.click();
  };

  const handleAdvance = async () => {
    if (!plan) return;
    setAdvancing(true);
    try {
      const result = await api.advanceDay();
      // Reload full plan to update state
      await loadPlan();
      toast({ title: `已进入 Day ${result.current_day}` });
    } catch (err: unknown) {
      toast({ title: "操作失败", description: (err as Error).message, variant: "destructive" });
    } finally {
      setAdvancing(false);
    }
  };

  const handleSetDay = async (dayNum: number) => {
    try {
      await api.setCurrentDay(dayNum);
      await loadPlan();
      toast({ title: `已跳转到 Day ${dayNum}` });
    } catch (err: unknown) {
      toast({ title: "操作失败", description: (err as Error).message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!plan) return;
    setDeleting(true);
    try {
      await api.deletePlan(plan.id);
      setPlan(null);
      setDeleteOpen(false);
      toast({ title: "计划已删除" });
    } catch (err: unknown) {
      toast({ title: "删除失败", description: (err as Error).message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleUnlink = async (dayNumber: number, subject: string) => {
    try {
      await api.unlinkHomework(dayNumber, subject);
      await loadPlan();
      toast({ title: "已取消关联" });
    } catch (err: unknown) {
      toast({ title: "操作失败", description: (err as Error).message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Helper: get tasks for a day
  const getDayTasks = (day: StudyPlanDayOut) =>
    SUBJECTS.filter((s) => day[s]).map((s) => ({
      subject: s,
      task: day[s]!,
      homeworkId: day[`${s}_homework_id` as keyof StudyPlanDayOut] as string | null,
      imageId: day[`${s}_image_id` as keyof StudyPlanDayOut] as string | null,
      completed: !!(day[`${s}_homework_id` as keyof StudyPlanDayOut]),
    }));

  // Compute overall progress
  const totalTasks = plan?.days.reduce((sum, d) => sum + SUBJECTS.filter((s) => d[s]).length, 0) ?? 0;
  const completedTasks = plan?.days.reduce(
    (sum, d) => sum + SUBJECTS.filter((s) => d[`${s}_homework_id` as keyof StudyPlanDayOut]).length, 0
  ) ?? 0;
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <CalendarCheck className="h-5 w-5" />
            学习计划
          </h1>
          <div className="flex-1" />
          {plan && (
            <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {/* No plan — upload prompt */}
        {!plan && (
          <div className="flex flex-col items-center justify-center py-20 gap-6">
            <div className="flex items-center justify-center h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg">
              <CalendarCheck className="h-10 w-10" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold">还没有学习计划</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                上传老师提供的打卡计划 PDF，AI 自动解析为结构化的每日任务列表
              </p>
            </div>
            <Button size="lg" onClick={handleUpload} disabled={parsing} className="gap-2">
              {parsing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI 解析中...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  上传计划 PDF
                </>
              )}
            </Button>
          </div>
        )}

        {/* Has plan */}
        {plan && (
          <>
            {/* Plan header card */}
            <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-teal-50/50 dark:from-emerald-950/20 dark:to-teal-950/10 p-5 mb-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold">{plan.title}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    当前进度：Day {plan.current_day} / {plan.total_days}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleAdvance}
                  disabled={advancing || plan.current_day >= plan.total_days}
                  className="gap-1.5"
                >
                  {advancing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <SkipForward className="h-3.5 w-3.5" />
                  )}
                  下一天
                </Button>
              </div>

              {/* Overall progress */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">总体进度</span>
                  <span className="font-medium">
                    Day {plan.current_day}/{plan.total_days} · {completedTasks}/{totalTasks} 任务
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500"
                    style={{ width: `${Math.round((plan.current_day / plan.total_days) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Upload new plan button */}
              <div className="mt-4 pt-3 border-t border-emerald-200/50 dark:border-emerald-800/30">
                <Button variant="ghost" size="sm" onClick={handleUpload} disabled={parsing} className="gap-1.5 text-xs">
                  {parsing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  上传新计划（替换当前）
                </Button>
              </div>
            </div>

            {/* Day list */}
            <div className="space-y-2">
              {plan.days
                .sort((a, b) => a.day_number - b.day_number)
                .map((day) => {
                  const tasks = getDayTasks(day);
                  const doneCount = tasks.filter((t) => t.completed).length;
                  const isCurrent = day.day_number === plan.current_day;
                  const isPast = day.day_number < plan.current_day;
                  const isExpanded = expandedDay === day.day_number;
                  const allDone = tasks.length > 0 && doneCount === tasks.length;

                  return (
                    <div
                      key={day.id}
                      className={`rounded-lg border transition-all ${
                        isCurrent
                          ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/10 shadow-sm"
                          : isPast
                          ? "border-muted bg-muted/20 opacity-70"
                          : "border-border"
                      }`}
                    >
                      {/* Day header - clickable to expand */}
                      <button
                        onClick={() => setExpandedDay(isExpanded ? null : day.day_number)}
                        className="w-full flex items-center gap-3 p-3 text-left"
                      >
                        {/* Day number badge */}
                        <div
                          className={`flex items-center justify-center h-8 w-8 rounded-lg text-xs font-bold shrink-0 ${
                            allDone
                              ? "bg-emerald-500 text-white"
                              : isCurrent
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {allDone ? <CheckCircle2 className="h-4 w-4" /> : day.day_number}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              Day {day.day_number}
                            </span>
                            {isCurrent && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                                当前
                              </Badge>
                            )}
                            {allDone && !isCurrent && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                已完成
                              </Badge>
                            )}
                          </div>
                          {/* Task summary icons */}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {tasks.map((t) => {
                              const meta = SUBJECT_META[t.subject];
                              const Icon = meta.icon;
                              return (
                                <span
                                  key={t.subject}
                                  className={`inline-flex items-center gap-0.5 text-[10px] ${
                                    t.completed ? "text-emerald-500" : "text-muted-foreground/60"
                                  }`}
                                >
                                  <Icon className="h-3 w-3" />
                                </span>
                              );
                            })}
                            <span className="text-[10px] text-muted-foreground ml-1">
                              {doneCount}/{tasks.length}
                            </span>
                          </div>
                        </div>

                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                      </button>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-2 border-t border-border/50 pt-2">
                          {/* Jump-to button if not current */}
                          {!isCurrent && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs gap-1 mb-2"
                              onClick={() => handleSetDay(day.day_number)}
                            >
                              <CalendarCheck className="h-3 w-3" />
                              跳转到此天
                            </Button>
                          )}

                          {tasks.map((t) => {
                            const meta = SUBJECT_META[t.subject];
                            const Icon = meta.icon;
                            return (
                              <div key={t.subject} className={`rounded-lg p-3 ${meta.bgColor}`}>
                                <div className="flex items-center gap-2 mb-1.5">
                                  {t.completed ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                  ) : (
                                    <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                                  )}
                                  <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
                                  <span className={`text-sm font-medium ${meta.color}`}>
                                    {meta.label}
                                  </span>
                                  {t.completed && t.homeworkId && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUnlink(day.day_number, t.subject);
                                      }}
                                      className="ml-auto text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                                      title="取消关联"
                                    >
                                      <Unlink className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                                <p className={`text-sm leading-relaxed pl-6 ${t.completed ? "text-muted-foreground" : ""}`}>
                                  {t.task}
                                </p>
                                {t.imageId && (
                                  <div className="pl-6 mt-2">
                                    <img
                                      src={api.getFilePreviewUrl(t.imageId)}
                                      alt={`${meta.label} 图表`}
                                      className="rounded-lg border max-w-full h-auto shadow-sm"
                                      loading="lazy"
                                    />
                                  </div>
                                )}
                                {t.completed && t.homeworkId && (
                                  <div className="pl-6 mt-1.5">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/homeworks/${t.homeworkId}`);
                                      }}
                                      className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                                    >
                                      <Link2 className="h-3 w-3" />
                                      查看关联作业
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {tasks.length === 0 && (
                            <p className="text-sm text-muted-foreground py-2 text-center">
                              此天没有任务
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </main>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除学习计划？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后所有进度和关联数据将被清除，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
