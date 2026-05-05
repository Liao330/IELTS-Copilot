"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Agent, Conversation, DailyReportResponse, ScheduleTask } from "@/types";
import { AgentCard } from "@/components/agent/AgentCard";
import {
  Settings, Target, Loader2, Sparkles, ChevronRight, ChevronDown, RefreshCw,
  Calendar, Plus, Check, Pencil, Trash2, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { DailyBriefContent } from "@/components/reports/DailyBriefContent";

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

  // Today's todo
  const [todos, setTodos] = useState<ScheduleTask[]>([]);       // today's undone
  const [overdueTasks, setOverdueTasks] = useState<ScheduleTask[]>([]); // past days' undone
  const [historyTasks, setHistoryTasks] = useState<ScheduleTask[]>([]); // all done
  const [newTodo, setNewTodo] = useState("");
  const [addingTodo, setAddingTodo] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showOverdue, setShowOverdue] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  // Agent cards folded
  const [agentsFolded, setAgentsFolded] = useState(true);

  const todayStr = new Date().toISOString().split("T")[0];

  const fetchTodos = useCallback(async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const allData = await api.getScheduleTasks(thirtyDaysAgo.toISOString().split("T")[0], todayStr);
      setTodos(allData.filter((t) => t.scheduled_date === todayStr && !t.done));
      setOverdueTasks(allData.filter((t) => t.scheduled_date < todayStr && !t.done));
      setHistoryTasks(allData.filter((t) => t.done));
    } catch {}
  }, [todayStr]);

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

    // Load yesterday's daily report
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    api.getDailyReport({ date: yesterdayStr })
      .then(setDailyReport)
      .catch(() => setDailyError(true))
      .finally(() => setDailyLoading(false));

    fetchTodos();
  }, [fetchTodos]);

  // Force-regenerate daily report
  const handleRegenDaily = async () => {
    setDailyLoading(true);
    setDailyError(false);
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      const data = await api.getDailyReport({ date: yesterdayStr, force: true });
      setDailyReport(data);
    } catch {
      setDailyError(true);
    } finally {
      setDailyLoading(false);
    }
  };

  const handleAddTodo = async () => {
    if (!newTodo.trim()) return;
    setAddingTodo(true);
    try {
      const created = await api.createScheduleTask({
        title: newTodo.trim(),
        scheduled_date: todayStr,
      });
      setTodos((prev) => [...prev, created]);
      setNewTodo("");
    } catch {}
    setAddingTodo(false);
  };

  const handleToggleTodo = async (task: ScheduleTask) => {
    const toggled = { ...task, done: !task.done };
    const removeFrom = (list: ScheduleTask[]) => list.filter((t) => t.id !== task.id);
    if (task.done) {
      setHistoryTasks(removeFrom);
      if (task.scheduled_date === todayStr) setTodos((prev) => [...prev, toggled]);
      else setOverdueTasks((prev) => [...prev, toggled]);
    } else {
      setTodos(removeFrom);
      setOverdueTasks(removeFrom);
      setHistoryTasks((prev) => [...prev, toggled]);
    }
    try {
      await api.updateScheduleTask(task.id, { done: !task.done });
    } catch {
      fetchTodos();
    }
  };

  const handleDeleteTodo = async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    setOverdueTasks((prev) => prev.filter((t) => t.id !== id));
    setHistoryTasks((prev) => prev.filter((t) => t.id !== id));
    try { await api.deleteScheduleTask(id); } catch { fetchTodos(); }
  };

  const handleEditTodo = async (id: string) => {
    if (!editingText.trim()) return;
    const updateList = (list: ScheduleTask[]) =>
      list.map((t) => t.id === id ? { ...t, title: editingText.trim() } : t);
    setTodos(updateList);
    setOverdueTasks(updateList);
    setEditingId(null);
    try {
      await api.updateScheduleTask(id, { title: editingText.trim() });
    } catch { fetchTodos(); }
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
  const yesterdayCount = dailyReport?.stats?.homework_count ?? 0;
  const yesterdayFeedback = dailyReport?.stats?.feedback_count ?? 0;

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

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {/* ====== 顶部：功能模块入口 ====== */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
          {[
            { icon: "📋", label: "备考计划", path: "/study-plan", color: "border-amber-200 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/30" },
            { icon: "🎧", label: "听力精听", path: "/listening-practice", color: "border-orange-200 hover:bg-orange-50 dark:border-orange-800 dark:hover:bg-orange-950/30" },
            { icon: "✏️", label: "句型&素材", path: "/writing-practice", color: "border-purple-200 hover:bg-purple-50 dark:border-purple-800 dark:hover:bg-purple-950/30" },
            { icon: "📚", label: "作业库", path: "/homeworks", color: "border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950/30" },
            { icon: "📖", label: "单词本", path: "/vocabulary", color: "border-sky-200 hover:bg-sky-50 dark:border-sky-800 dark:hover:bg-sky-950/30" },
            { icon: "📒", label: "笔记", path: "/notes", color: "border-rose-200 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-950/30" },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border transition-all ${item.color}`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
        </div>

        {/* ====== 左右两栏：昨日回顾 + 今日待办 ====== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* 左：昨日学习回顾 */}
          <button
            onClick={() => setSheetOpen(true)}
            className="w-full rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50/80 to-orange-50/60 dark:from-amber-950/20 dark:to-orange-950/10 hover:shadow-md transition-all p-4 text-left group"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-bold">昨日学习回顾</h2>
                <p className="text-[10px] text-muted-foreground">
                  {(() => { const y = new Date(); y.setDate(y.getDate() - 1); return y.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" }); })()}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            {dailyLoading ? (
              <div className="flex items-center gap-2 py-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-xs">生成中...</span>
              </div>
            ) : dailyError ? (
              <p className="text-xs text-muted-foreground">加载失败，点击查看</p>
            ) : dailyReport ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="rounded-full bg-white/70 dark:bg-white/10 px-2 py-0.5">📝 {yesterdayCount}</span>
                  <span className="rounded-full bg-white/70 dark:bg-white/10 px-2 py-0.5">💬 {yesterdayFeedback}</span>
                </div>
                {briefOverview && (
                  <p className="text-xs leading-relaxed text-foreground/80 line-clamp-3">{briefOverview}</p>
                )}
                {briefActions && briefActions.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] font-semibold text-amber-700/70 dark:text-amber-400/70 flex items-center gap-1">
                      <Target className="h-3 w-3" /> 今日建议
                    </span>
                    {briefActions.map((action, i) => (
                      <div key={i} className="flex items-start gap-1 text-[10px] text-foreground/70">
                        <ArrowRight className="h-2.5 w-2.5 mt-0.5 shrink-0 text-amber-600/60" />
                        <span className="line-clamp-1">{action}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </button>

          {/* 右：今日待办 */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">今日待办</h3>
              {(todos.length > 0 || overdueTasks.length > 0) && (
                <span className="text-[10px] text-muted-foreground ml-auto">{todos.length + overdueTasks.length} 项待完成</span>
              )}
            </div>

            {todos.length > 0 && (
              <div className="space-y-1.5">
                {todos.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 group">
                    <button type="button" onClick={() => handleToggleTodo(task)}
                      className="h-4 w-4 rounded border shrink-0 border-muted-foreground/30 hover:border-emerald-500" />
                    {editingId === task.id ? (
                      <Input value={editingText} onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) handleEditTodo(task.id); if (e.key === "Escape") setEditingId(null); }}
                        onBlur={() => handleEditTodo(task.id)} autoFocus className="text-xs h-6 py-0 flex-1" />
                    ) : (
                      <span className="text-sm flex-1">
                        {task.source && <span className="inline-block text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded px-1 mr-1.5 align-middle">计划</span>}
                        {task.title}
                      </span>
                    )}
                    <button type="button" onClick={() => { setEditingId(task.id); setEditingText(task.title); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => handleDeleteTodo(task.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {overdueTasks.length > 0 && (
              <div className="pt-2 border-t">
                <button type="button" onClick={() => setShowOverdue(!showOverdue)}
                  className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mb-1.5">
                  <ChevronRight className={`h-3 w-3 transition-transform ${showOverdue ? "rotate-90" : ""}`} />
                  历史遗留（{overdueTasks.length}项）
                </button>
                {showOverdue && (
                  <div className="space-y-1.5">
                    {overdueTasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-2 group">
                        <button type="button" onClick={() => handleToggleTodo(task)}
                          className="h-4 w-4 rounded border shrink-0 border-amber-400/50 hover:border-emerald-500" />
                        {editingId === task.id ? (
                          <Input value={editingText} onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) handleEditTodo(task.id); if (e.key === "Escape") setEditingId(null); }}
                            onBlur={() => handleEditTodo(task.id)} autoFocus className="text-xs h-6 py-0 flex-1" />
                        ) : (
                          <span className="text-sm flex-1">{task.title}</span>
                        )}
                        <span className="text-[9px] text-amber-500/70 shrink-0">
                          {new Date(task.scheduled_date + "T00:00:00").toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Input value={newTodo} onChange={(e) => setNewTodo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAddTodo(); }}
                placeholder="添加任务..." className="text-sm h-8" />
              <Button size="sm" variant="outline" className="h-8 px-2.5 shrink-0" onClick={handleAddTodo} disabled={!newTodo.trim() || addingTodo}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {historyTasks.length > 0 && (
              <div className="pt-2 border-t">
                <button type="button" onClick={() => setShowHistory(!showHistory)}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <ChevronRight className={`h-3 w-3 transition-transform ${showHistory ? "rotate-90" : ""}`} />
                  已完成（{historyTasks.length}）
                </button>
                {showHistory && (
                  <div className="mt-1.5 space-y-0.5 max-h-40 overflow-y-auto">
                    {historyTasks.slice(0, 20).map((task) => (
                      <div key={task.id} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 group">
                        <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                        <span className="line-through flex-1 truncate">{task.title}</span>
                        <button type="button" onClick={() => handleToggleTodo(task)}
                          className="opacity-0 group-hover:opacity-100 text-[9px] hover:text-amber-500">撤回</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ====== IELTS Copilot 主助手 ====== */}
        <div className="mb-6">
          <button
            onClick={() => handleStartChat("ielts-copilot")}
            className="w-full rounded-xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 hover:from-primary/10 hover:to-primary/20 transition-all duration-300 p-5 text-left group"
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">🎓</span>
              <div className="flex-1">
                <h2 className="text-lg font-bold mb-0.5 group-hover:text-primary transition-colors">IELTS Copilot</h2>
                <p className="text-xs text-muted-foreground">智能全能助手 — 直接提问或发送材料，自动调用专项助手</p>
              </div>
              <ChevronRight className="h-5 w-5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
        </div>

        {/* ====== 专项助手 ====== */}
        <div className="mb-6">
          <button type="button" onClick={() => setAgentsFolded(!agentsFolded)}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-3">
            {agentsFolded ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            专项助手 <span className="text-xs font-normal">({agents.filter(a => a.id !== "ielts-copilot").length})</span>
          </button>
          {!agentsFolded && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {agents.filter(a => a.id !== "ielts-copilot").map((agent) => (
                <AgentCard key={agent.id} agent={agent} onStart={() => handleStartChat(agent.id)} />
              ))}
            </div>
          )}
        </div>

        {/* ====== 最近对话 ====== */}
        {recentConversations.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <span className="inline-block w-1 h-4 bg-primary rounded-full" />
              最近对话
            </h3>
            <div className="space-y-1">
              {recentConversations.map((conv) => (
                <button key={conv.id} onClick={() => router.push(`/chat/${conv.id}`)}
                  className="w-full text-left p-2.5 rounded-lg hover:bg-accent transition-colors flex items-center justify-between">
                  <span className="truncate text-sm">{conv.title || "新对话"}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{new Date(conv.updated_at).toLocaleDateString("zh-CN")}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ====== Sheet: Full Daily Brief ====== */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              昨日学习回顾
            </SheetTitle>
            <SheetDescription className="flex items-center justify-between">
              <span>
                {(() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  return y.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
                })()}
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
            onViewFull={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
