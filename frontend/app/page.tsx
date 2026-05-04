"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Agent, Conversation, ScheduleTask } from "@/types";
import { AgentCard } from "@/components/agent/AgentCard";
import {
  Settings, BookMarked, Library, BookOpen,
  ChevronRight, Headphones,
  Calendar, Plus, Check, Pencil, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function HomePage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

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

  const todayStr = new Date().toISOString().split("T")[0];

  const fetchTodos = useCallback(async () => {
    try {
      // Fetch recent 30 days (covers overdue + history)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const allData = await api.getScheduleTasks(thirtyDaysAgo.toISOString().split("T")[0], todayStr);
      // Today's undone
      setTodos(allData.filter((t) => t.scheduled_date === todayStr && !t.done));
      // Past days' undone (overdue)
      setOverdueTasks(allData.filter((t) => t.scheduled_date < todayStr && !t.done));
      // All done
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

    fetchTodos();
  }, [fetchTodos]);

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
    // Optimistic: move between lists
    const toggled = { ...task, done: !task.done };
    const removeFrom = (list: ScheduleTask[]) => list.filter((t) => t.id !== task.id);
    if (task.done) {
      // un-complete: move from history back to active
      setHistoryTasks(removeFrom);
      if (task.scheduled_date === todayStr) setTodos((prev) => [...prev, toggled]);
      else setOverdueTasks((prev) => [...prev, toggled]);
    } else {
      // complete: move to history
      setTodos(removeFrom);
      setOverdueTasks(removeFrom);
      setHistoryTasks((prev) => [...prev, toggled]);
    }
    try {
      await api.updateScheduleTask(task.id, { done: !task.done });
    } catch {
      fetchTodos(); // rollback
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
        {/* ====== 今日待办 ====== */}
        <div className="mb-8 rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">今日待办</h3>
            {(todos.length > 0 || overdueTasks.length > 0) && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {todos.length + overdueTasks.length} 项待完成
              </span>
            )}
          </div>

          {/* Today's active tasks */}
          {todos.length > 0 && (
            <div className="space-y-1.5">
              {todos.map((task) => (
                <div key={task.id} className="flex items-center gap-2.5 group">
                  <button
                    type="button"
                    onClick={() => handleToggleTodo(task)}
                    className="h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors border-muted-foreground/30 hover:border-emerald-500"
                  />
                  {editingId === task.id ? (
                    <Input
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleEditTodo(task.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => handleEditTodo(task.id)}
                      autoFocus
                      className="text-sm h-6 py-0 flex-1"
                    />
                  ) : (
                    <span className="text-sm flex-1">{task.title}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => { setEditingId(task.id); setEditingText(task.title); }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary text-xs transition-opacity"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTodo(task.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive text-xs transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Overdue tasks (past days' undone) */}
          {overdueTasks.length > 0 && (
            <div className="pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowOverdue(!showOverdue)}
                className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 transition-colors flex items-center gap-1 mb-1.5"
              >
                <ChevronRight className={`h-3 w-3 transition-transform ${showOverdue ? "rotate-90" : ""}`} />
                历史遗留（{overdueTasks.length} 项未完成）
              </button>
              {showOverdue && (
                <div className="space-y-1.5 pl-1">
                  {overdueTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2.5 group">
                      <button
                        type="button"
                        onClick={() => handleToggleTodo(task)}
                        className="h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors border-amber-400/50 hover:border-emerald-500"
                      />
                      {editingId === task.id ? (
                        <Input
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleEditTodo(task.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          onBlur={() => handleEditTodo(task.id)}
                          autoFocus
                          className="text-sm h-6 py-0 flex-1"
                        />
                      ) : (
                        <span className="text-sm flex-1">{task.title}</span>
                      )}
                      <span className="text-[10px] text-amber-500/70 shrink-0">
                        {new Date(task.scheduled_date + "T00:00:00").toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setEditingId(task.id); setEditingText(task.title); }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary text-xs transition-opacity"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTodo(task.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive text-xs transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick add */}
          <div className="flex gap-2">
            <Input
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddTodo(); }}
              placeholder="添加今日任务..."
              className="text-sm h-8"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2.5 shrink-0"
              onClick={handleAddTodo}
              disabled={!newTodo.trim() || addingTodo}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* History (completed) */}
          {historyTasks.length > 0 && (
            <div className="pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <ChevronRight className={`h-3 w-3 transition-transform ${showHistory ? "rotate-90" : ""}`} />
                历史记录（{historyTasks.length} 项已完成）
              </button>
              {showHistory && (
                <div className="mt-2 space-y-3 max-h-60 overflow-y-auto">
                  {(() => {
                    const grouped: Record<string, ScheduleTask[]> = {};
                    historyTasks.forEach((t) => {
                      if (!grouped[t.scheduled_date]) grouped[t.scheduled_date] = [];
                      grouped[t.scheduled_date].push(t);
                    });
                    const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
                    return dates.map((date) => (
                      <div key={date}>
                        <p className="text-[10px] font-medium text-muted-foreground mb-1">
                          {new Date(date + "T00:00:00").toLocaleDateString("zh-CN", {
                            month: "short", day: "numeric", weekday: "short",
                          })}
                          {date === todayStr && " (今天)"}
                        </p>
                        <div className="space-y-0.5 pl-2 border-l-2 border-emerald-200 dark:border-emerald-800">
                          {grouped[date].map((task) => (
                            <div key={task.id} className="flex items-center gap-2 text-xs text-muted-foreground/70 group">
                              <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                              <span className="line-through flex-1">{task.title}</span>
                              <button
                                type="button"
                                onClick={() => handleToggleTodo(task)}
                                className="opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground hover:text-amber-500 transition-opacity"
                                title="标记为未完成"
                              >
                                撤回
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          )}
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
            onClick={() => router.push("/listening-practice")}
          >
            <Headphones className="h-5 w-5" />
            🎧 听力精听复盘
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
    </div>
  );
}
