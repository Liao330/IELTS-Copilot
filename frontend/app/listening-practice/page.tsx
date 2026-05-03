"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { ListeningSessionSummary } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Headphones, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SessionCard } from "@/components/listening/SessionCard";

export default function ListeningPracticeListPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [sessions, setSessions] = useState<ListeningSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // edit dialog (rename + date)
  const [renamingSession, setRenamingSession] = useState<ListeningSessionSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editDate, setEditDate] = useState("");
  const [renaming, setRenaming] = useState(false);

  // delete confirm
  const [deletingSession, setDeletingSession] = useState<ListeningSessionSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listListeningSessions();
      setSessions(data);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "加载练习列表失败" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRename = async () => {
    if (!renamingSession || !renameValue.trim()) return;
    setRenaming(true);
    try {
      const updateData: { title: string; created_at?: string } = { title: renameValue.trim() };
      if (editDate) {
        updateData.created_at = new Date(editDate + "T00:00:00").toISOString();
      }
      await api.updateListeningSession(renamingSession.id, updateData);
      toast({ description: "已保存" });
      setRenamingSession(null);
      setRenameValue("");
      setEditDate("");
      fetchSessions();
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "保存失败" });
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingSession) return;
    setDeleting(true);
    try {
      await api.deleteListeningSession(deletingSession.id);
      toast({ description: "已删除" });
      setDeletingSession(null);
      fetchSessions();
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "删除失败" });
    } finally {
      setDeleting(false);
    }
  };

  const totalSentences = sessions.reduce((sum, s) => sum + s.sentence_count, 0);
  const totalBlockers = sessions.reduce((sum, s) => sum + s.blocker_count, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Headphones className="h-5 w-5 text-sky-500" />
              听力精听复盘
            </h1>
          </div>
          <Button
            onClick={() => router.push("/listening-practice/new")}
            className="gap-1.5 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white"
          >
            <Plus className="h-4 w-4" />
            新建练习
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {/* 统计条 */}
        <div className="mb-6 grid grid-cols-4 gap-3">
          <StatBadge icon="🎧" label="练习套数" value={sessions.length} />
          <StatBadge icon="📝" label="答案句数" value={totalSentences} />
          <StatBadge icon="🎯" label="障碍词累计" value={totalBlockers} />
          <StatBadge icon="⏱" label="总学习时长" value={(() => {
            const total = sessions.reduce((sum, s) => sum + (s.study_duration_seconds || 0), 0);
            if (total >= 3600) return `${Math.floor(total / 3600)}h${Math.floor((total % 3600) / 60)}m`;
            return `${Math.floor(total / 60)}min`;
          })()} />
        </div>

        {loading ? (
          <div className="text-center py-20 text-muted-foreground animate-pulse">加载中...</div>
        ) : sessions.length === 0 ? (
          <EmptyState onStart={() => router.push("/listening-practice/new")} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onClick={() => router.push(`/listening-practice/${s.id}`)}
                onRename={() => {
                  setRenamingSession(s);
                  setRenameValue(s.title);
                  setEditDate(s.created_at.split("T")[0]);
                }}
                onDelete={() => setDeletingSession(s)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Edit Dialog */}
      <Dialog
        open={!!renamingSession}
        onOpenChange={(open) => !open && setRenamingSession(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑练习</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">标题</label>
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="输入标题"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) handleRename();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">练习日期</label>
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingSession(null)}>
              取消
            </Button>
            <Button onClick={handleRename} disabled={renaming || !renameValue.trim()}>
              {renaming ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog
        open={!!deletingSession}
        onOpenChange={(open) => !open && setDeletingSession(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            即将删除「{deletingSession?.title}」及其全部答案句、障碍词标记与生成结果。
            <br />
            该会话关联的单词本条目（category=listening）也会一并清理。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingSession(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatBadge({ icon, label, value }: { icon: string; label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-gradient-to-br from-sky-50/60 to-cyan-50/40 dark:from-sky-950/20 dark:to-cyan-950/10 p-3 flex items-center gap-2">
      <span className="text-xl">{icon}</span>
      <div>
        <div className="text-lg font-bold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-center py-20">
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-sky-100 to-cyan-100 dark:from-sky-950/40 dark:to-cyan-950/30 mb-4">
        <Sparkles className="h-7 w-7 text-sky-500" />
      </div>
      <h3 className="text-lg font-semibold mb-2">开始你的第一次精听复盘</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
        粘贴练习中出错题目的答案句，手动高亮影响你听懂的障碍词，
        <br />
        AI 将为每个障碍词生成梯度练习，帮你精准攻克听力薄弱点。
      </p>
      <Button
        onClick={onStart}
        className="gap-1.5 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white"
      >
        <Plus className="h-4 w-4" />
        新建练习
      </Button>
    </div>
  );
}
