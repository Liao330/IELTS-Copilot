"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type {
  ListeningSessionDetail,
  ListeningSentence,
  ListeningBlockerWord,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Headphones,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  BookOpen,
  RefreshCw,
  MessageSquare,
  Pencil,
  Check,
  Eye,
  EyeOff,
  Zap,
  X,
  ArrowRight,
  List,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SentenceEditor } from "@/components/listening/SentenceEditor";
import { GenerateResultCard } from "@/components/listening/GenerateResultCard";
import { PlayButton } from "@/components/listening/PlayButton";
import { useBlindModeStore } from "@/lib/blind-mode-store";

export default function ListeningPracticeDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const sessionId = params.sessionId;

  const [session, setSession] = useState<ListeningSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // 每个句子的 loading 状态
  const [generatingMap, setGeneratingMap] = useState<Record<string, boolean>>({});
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});

  // 一键生成全部
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  // 延伸障碍词列表
  const [discoveredWords, setDiscoveredWords] = useState<string[]>([]);
  const [showDiscoveredPanel, setShowDiscoveredPanel] = useState(false);
  const [creatingExtSession, setCreatingExtSession] = useState(false);

  // 追加答案句
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addSentences, setAddSentences] = useState("");
  const [adding, setAdding] = useState(false);

  // 编辑会话标题/备注
  const [showEditSessionDialog, setShowEditSessionDialog] = useState(false);
  const [editSessionTitle, setEditSessionTitle] = useState("");
  const [editSessionNote, setEditSessionNote] = useState("");
  const [savingSession, setSavingSession] = useState(false);

  // 删除句子
  const [deletingSentence, setDeletingSentence] = useState<ListeningSentence | null>(null);

  const addDiscoveredWord = useCallback((word: string) => {
    const lower = word.toLowerCase();
    setDiscoveredWords((prev) => {
      if (prev.some((w) => w.toLowerCase() === lower)) {
        toast({ description: `「${word}」已在延伸障碍词列表中` });
        return prev;
      }
      toast({ description: `「${word}」已加入延伸障碍词列表` });
      return [...prev, word];
    });
    setShowDiscoveredPanel(true);
  }, [toast]);

  const removeDiscoveredWord = useCallback((word: string) => {
    setDiscoveredWords((prev) => prev.filter((w) => w !== word));
  }, []);

  const fetchSession = useCallback(async () => {
    try {
      const data = await api.getListeningSession(sessionId);
      setSession(data);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "加载失败" });
    } finally {
      setLoading(false);
    }
  }, [sessionId, toast]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // 乐观更新 + 远端持久化
  const toggleBlocker = async (
    sentence: ListeningSentence,
    token: { word: string; start: number; end: number },
  ) => {
    if (session?.is_demo) {
      toast({
        description: "示例会话不可修改，请点击右上角返回并「新建练习」创建你自己的会话",
      });
      return;
    }
    const key = `${token.start}-${token.end}`;
    const currentBlockers = sentence.blocker_words;
    const exists = currentBlockers.some(
      (b) => `${b.start}-${b.end}` === key,
    );

    const newBlockers: ListeningBlockerWord[] = exists
      ? currentBlockers.filter((b) => `${b.start}-${b.end}` !== key)
      : [
          ...currentBlockers,
          {
            word: token.word,
            start: token.start,
            end: token.end,
            vocab_word_id: null,
          },
        ];

    // 乐观更新本地
    setSession((prev) =>
      prev
        ? {
            ...prev,
            sentences: prev.sentences.map((s) =>
              s.id === sentence.id ? { ...s, blocker_words: newBlockers } : s,
            ),
          }
        : prev,
    );

    setSavingMap((m) => ({ ...m, [sentence.id]: true }));
    try {
      const updated = await api.updateListeningBlockers(sentence.id, newBlockers);
      setSession((prev) =>
        prev
          ? {
              ...prev,
              sentences: prev.sentences.map((s) =>
                s.id === sentence.id
                  ? {
                      ...s,
                      blocker_words: updated.blocker_words,
                      generated_blocks: updated.generated_blocks,
                    }
                  : s,
              ),
            }
          : prev,
      );
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "保存标记失败，已还原" });
      // 回滚
      setSession((prev) =>
        prev
          ? {
              ...prev,
              sentences: prev.sentences.map((s) =>
                s.id === sentence.id ? { ...s, blocker_words: currentBlockers } : s,
              ),
            }
          : prev,
      );
    } finally {
      setSavingMap((m) => {
        const rest = { ...m };
        delete rest[sentence.id];
        return rest;
      });
    }
  };

  // 编辑句子备注（AI 生成时会被作为上下文提示）
  const handleUpdateNote = async (sentence: ListeningSentence, nextNote: string) => {
    if (isDemo) {
      toast({ description: "示例会话不可编辑备注" });
      return;
    }
    const trimmed = nextNote.trim();
    const payload = trimmed || null;
    // 乐观更新
    setSession((prev) =>
      prev
        ? {
            ...prev,
            sentences: prev.sentences.map((s) =>
              s.id === sentence.id ? { ...s, note: payload } : s,
            ),
          }
        : prev,
    );
    try {
      await api.updateListeningSentenceNote(sentence.id, payload);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "备注保存失败" });
      // 回滚
      setSession((prev) =>
        prev
          ? {
              ...prev,
              sentences: prev.sentences.map((s) =>
                s.id === sentence.id ? { ...s, note: sentence.note } : s,
              ),
            }
          : prev,
      );
    }
  };

  const handleGenerate = async (sentence: ListeningSentence, forceRefresh = false) => {
    if (sentence.blocker_words.length === 0) {
      toast({ description: "请先标记障碍词" });
      return;
    }
    setGeneratingMap((m) => ({ ...m, [sentence.id]: true }));
    try {
      const res = await api.generateListeningPractice(sentence.id, {
        force_refresh: forceRefresh,
      });
      setSession((prev) =>
        prev
          ? {
              ...prev,
              sentences: prev.sentences.map((s) =>
                s.id === sentence.id ? { ...s, generated_blocks: res.blocks } : s,
              ),
            }
          : prev,
      );
      toast({ description: `已生成 ${res.blocks.length} 组精听练习` });
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "生成失败";
      toast({ variant: "destructive", description: msg });
    } finally {
      setGeneratingMap((m) => {
        const rest = { ...m };
        delete rest[sentence.id];
        return rest;
      });
    }
  };

  // 一键生成全部
  const handleBatchGenerate = async () => {
    if (!session) return;
    const needGen = session.sentences.filter(
      (s) =>
        s.blocker_words.length > 0 &&
        (s.generated_blocks.length === 0 ||
          s.blocker_words.some(
            (b) => !s.generated_blocks.some((g) => g.blocker_word === b.word.toLowerCase()),
          )),
    );
    if (needGen.length === 0) {
      toast({ description: "所有句子都已生成练习 ✓" });
      return;
    }
    setBatchGenerating(true);
    setBatchProgress({ done: 0, total: needGen.length });
    for (let i = 0; i < needGen.length; i++) {
      const s = needGen[i];
      try {
        const res = await api.generateListeningPractice(s.id, { force_refresh: false });
        setSession((prev) =>
          prev
            ? {
                ...prev,
                sentences: prev.sentences.map((ps) =>
                  ps.id === s.id ? { ...ps, generated_blocks: res.blocks } : ps,
                ),
              }
            : prev,
        );
      } catch (err) {
        console.error(err);
      }
      setBatchProgress({ done: i + 1, total: needGen.length });
    }
    setBatchGenerating(false);
    toast({ description: `一键生成完成 🎉 共 ${needGen.length} 句` });
  };

  // 创建延伸障碍词 session
  const handleCreateExtendSession = async () => {
    if (!session || discoveredWords.length === 0) return;
    setCreatingExtSession(true);
    try {
      const newSession = await api.createListeningSession({
        title: `从「${session.title}」延伸的障碍词`,
        note: `包含在精听练习中发现的 ${discoveredWords.length} 个新障碍词：${discoveredWords.join("、")}`,
        sentences: [],
      });
      toast({ description: "已创建延伸练习，即将跳转" });
      router.push(`/listening-practice/${newSession.id}`);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "创建失败" });
    } finally {
      setCreatingExtSession(false);
    }
  };

  const handleAddSentences = async () => {
    const list = addSentences
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (list.length === 0) return;
    setAdding(true);
    try {
      const updated = await api.addListeningSentences(sessionId, list);
      setSession(updated);
      toast({ description: `已追加 ${list.length} 句` });
      setAddSentences("");
      setShowAddDialog(false);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "追加失败" });
    } finally {
      setAdding(false);
    }
  };

  const openEditSessionDialog = () => {
    if (!session) return;
    setEditSessionTitle(session.title);
    setEditSessionNote(session.note || "");
    setShowEditSessionDialog(true);
  };

  const handleSaveSession = async () => {
    if (!session) return;
    const title = editSessionTitle.trim();
    if (!title) {
      toast({ variant: "destructive", description: "标题不能为空" });
      return;
    }
    setSavingSession(true);
    try {
      const updated = await api.updateListeningSession(session.id, {
        title,
        note: editSessionNote.trim(),
      });
      // updateListeningSession 返回 SessionDetailOut，替换全部
      setSession(updated);
      toast({ description: "已更新会话信息" });
      setShowEditSessionDialog(false);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "保存失败" });
    } finally {
      setSavingSession(false);
    }
  };

  // 编辑句子原文
  const handleUpdateSentenceText = async (
    sentence: ListeningSentence,
    nextText: string,
  ): Promise<boolean> => {
    if (isDemo) {
      toast({ description: "示例会话不可编辑原文" });
      return false;
    }
    const trimmed = nextText.trim();
    if (!trimmed) {
      toast({ variant: "destructive", description: "原句不能为空" });
      return false;
    }
    if (trimmed === sentence.original_text) return true;
    try {
      const updated = await api.updateListeningSentenceText(sentence.id, trimmed);
      setSession((prev) =>
        prev
          ? {
              ...prev,
              sentences: prev.sentences.map((s) =>
                s.id === sentence.id ? updated : s,
              ),
            }
          : prev,
      );
      if (updated.blocker_words.length < sentence.blocker_words.length) {
        const lost =
          sentence.blocker_words.length - updated.blocker_words.length;
        toast({
          description: `原文已更新，${lost} 个障碍词在新原文中找不到已被剔除；AI 例句缓存已清空`,
        });
      } else {
        toast({ description: "原文已更新，AI 例句缓存已清空" });
      }
      return true;
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "保存失败" });
      return false;
    }
  };

  const handleDeleteSentence = async () => {
    if (!deletingSentence) return;
    try {
      await api.deleteListeningSentence(deletingSentence.id);
      setSession((prev) =>
        prev
          ? {
              ...prev,
              sentences: prev.sentences.filter((s) => s.id !== deletingSentence.id),
            }
          : prev,
      );
      toast({ description: "已删除该句" });
      setDeletingSentence(null);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "删除失败" });
    }
  };

  const totalBlockers = useMemo(
    () =>
      session?.sentences.reduce((sum, s) => sum + s.blocker_words.length, 0) ?? 0,
    [session],
  );

  // 需要生成的句子数
  const needGenCount = useMemo(() => {
    if (!session) return 0;
    return session.sentences.filter(
      (s) =>
        s.blocker_words.length > 0 &&
        (s.generated_blocks.length === 0 ||
          s.blocker_words.some(
            (b) => !s.generated_blocks.some((g) => g.blocker_word === b.word.toLowerCase()),
          )),
    ).length;
  }, [session]);

  const isDemo = !!session?.is_demo;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">会话不存在</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/listening-practice")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            {isDemo ? (
              <Sparkles className="h-5 w-5 text-amber-500 shrink-0" />
            ) : (
              <Headphones className="h-5 w-5 text-sky-500 shrink-0" />
            )}
            <h1 className="text-lg font-semibold truncate">{session.title}</h1>
            {!isDemo && (
              <button
                type="button"
                onClick={openEditSessionDialog}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
                title="编辑标题和备注"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 延伸障碍词列表按钮 */}
            {!isDemo && discoveredWords.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDiscoveredPanel(!showDiscoveredPanel)}
                className="gap-1.5 relative"
              >
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">延伸词</span>
                <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-rose-500 text-white text-[10px] font-bold px-1">
                  {discoveredWords.length}
                </span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/vocabulary")}
              className="gap-1.5 hidden sm:flex"
            >
              <BookOpen className="h-4 w-4" />
              单词本
            </Button>
            {isDemo ? (
              <Button
                size="sm"
                onClick={() => router.push("/listening-practice/new")}
                className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
              >
                <Plus className="h-4 w-4" />
                新建练习
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setShowAddDialog(true)}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                追加
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 flex gap-6">
        {/* 主内容区 */}
        <main className="flex-1 max-w-3xl mx-auto min-w-0">
          {/* 示例会话说明 banner */}
          {isDemo && (
            <div className="mb-4 rounded-lg border-2 border-amber-300/80 dark:border-amber-700/60 bg-gradient-to-br from-amber-50 to-orange-50/70 dark:from-amber-950/40 dark:to-orange-950/30 p-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="flex-1 text-sm leading-relaxed">
                  <p className="font-semibold mb-1">这是 AI 示例会话 · 仅供预览效果</p>
                  <p className="text-xs text-muted-foreground">
                    答案句和障碍词已预先标好，下方每组「精听练习」都是 AI 根据难点类型真实生成的梯度例句。
                    体验完成后，请点击右上「新建练习」创建属于你的精听复盘。
                    <br />
                    <span className="text-amber-700 dark:text-amber-400">
                      ⚠️ 本会话不支持修改障碍词、追加/删除句子、重新生成。
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 统计 + 说明 */}
          <div className="mb-5 rounded-lg border bg-gradient-to-br from-sky-50/60 to-cyan-50/40 dark:from-sky-950/20 dark:to-cyan-950/10 p-4">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-white/10 px-2.5 py-1 font-medium border">
                  📝 {session.sentences.length} 句
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-white/10 px-2.5 py-1 font-medium border">
                  🎯 {totalBlockers} 障碍词
                </span>
              </div>
              {/* 语速 + 音色控制（全局偏好） */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <BlindDefaultToggle />
                <span className="text-muted-foreground/40">·</span>
                <span>🎧 朗读设置</span>
                <PlayButton text="" gearOnly size="sm" />
              </div>
            </div>
            {!isDemo && session.note && (
              <div className="mb-2 flex items-start gap-1.5 text-xs rounded-md bg-white/70 dark:bg-white/5 border px-2 py-1.5">
                <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-sky-500 shrink-0" />
                <span className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {session.note}
                </span>
              </div>
            )}

            {/* 一键生成按钮 */}
            {!isDemo && totalBlockers > 0 && (
              <div className="mb-2 flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleBatchGenerate}
                  disabled={batchGenerating || needGenCount === 0}
                  className="gap-1.5 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white"
                >
                  {batchGenerating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      生成中 {batchProgress.done}/{batchProgress.total}...
                    </>
                  ) : (
                    <>
                      <Zap className="h-3.5 w-3.5" />
                      {needGenCount > 0
                        ? `一键生成全部（${needGenCount} 句待生成）`
                        : "全部已生成 ✓"}
                    </>
                  )}
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground leading-relaxed">
              点击答案句中的任意单词来标记/取消「障碍词」。标记后点击「生成精听练习」由 AI
              根据难点类型产出 3-5 句梯度练习。每句旁的 ▶️ 可用拟人语音播放（雅思英音默认，可切美/澳音）。
            </p>
          </div>

          {session.sentences.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              暂无答案句，点击右上「追加」按钮开始。
            </div>
          ) : (
            <div className="space-y-5">
              {session.sentences.map((sentence, idx) => (
                <SentenceBlock
                  key={sentence.id}
                  sentence={sentence}
                  index={idx}
                  saving={!!savingMap[sentence.id]}
                  generating={!!generatingMap[sentence.id]}
                  onToggleBlocker={(token) => toggleBlocker(sentence, token)}
                  onGenerate={(force) => handleGenerate(sentence, force)}
                  onUpdateNote={(next) => handleUpdateNote(sentence, next)}
                  onUpdateText={(next) => handleUpdateSentenceText(sentence, next)}
                  onDelete={() => setDeletingSentence(sentence)}
                  isDemo={isDemo}
                  onNewBlockerWord={addDiscoveredWord}
                  onAddMissedWord={addDiscoveredWord}
                />
              ))}
            </div>
          )}
        </main>

        {/* 右侧延伸障碍词面板 (lg 以上屏幕 sticky) */}
        {!isDemo && showDiscoveredPanel && discoveredWords.length > 0 && (
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-20">
              <DiscoveredWordsPanel
                words={discoveredWords}
                sessionTitle={session.title}
                onRemove={removeDiscoveredWord}
                onCreate={handleCreateExtendSession}
                creating={creatingExtSession}
                onClose={() => setShowDiscoveredPanel(false)}
              />
            </div>
          </aside>
        )}
      </div>

      {/* 小屏幕：底部浮动延伸障碍词面板 */}
      {!isDemo && showDiscoveredPanel && discoveredWords.length > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur shadow-lg max-h-[50vh] overflow-y-auto">
          <DiscoveredWordsPanel
            words={discoveredWords}
            sessionTitle={session.title}
            onRemove={removeDiscoveredWord}
            onCreate={handleCreateExtendSession}
            creating={creatingExtSession}
            onClose={() => setShowDiscoveredPanel(false)}
          />
        </div>
      )}

      {/* 追加答案句对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>追加答案句</DialogTitle>
          </DialogHeader>
          <Textarea
            value={addSentences}
            onChange={(e) => setAddSentences(e.target.value)}
            placeholder="每行一个答案句..."
            rows={6}
            className="font-mono text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              取消
            </Button>
            <Button onClick={handleAddSentences} disabled={adding || !addSentences.trim()}>
              {adding ? "添加中..." : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑会话（标题 + 备注） */}
      <Dialog open={showEditSessionDialog} onOpenChange={setShowEditSessionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑会话</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                标题 <span className="text-rose-500">*</span>
              </label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={editSessionTitle}
                onChange={(e) => setEditSessionTitle(e.target.value)}
                placeholder="例如：C18 Test 2 Section 3 错题精听"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                备注（可选）
              </label>
              <Textarea
                value={editSessionNote}
                onChange={(e) => setEditSessionNote(e.target.value)}
                placeholder="例如：今天下午的套题，Section 3 错了 4 题"
                rows={3}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditSessionDialog(false)}
              disabled={savingSession}
            >
              取消
            </Button>
            <Button
              onClick={handleSaveSession}
              disabled={savingSession || !editSessionTitle.trim()}
            >
              {savingSession ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除句子确认 */}
      <Dialog
        open={!!deletingSentence}
        onOpenChange={(open) => !open && setDeletingSentence(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除这一句？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground break-words">
            &quot;{deletingSentence?.original_text}&quot;
          </p>
          <p className="text-xs text-muted-foreground">
            标记的障碍词对应的单词本条目（若来源于本会话）会一并删除。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingSentence(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteSentence}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ==================== 延伸障碍词面板 ====================

function DiscoveredWordsPanel({
  words,
  sessionTitle,
  onRemove,
  onCreate,
  creating,
  onClose,
}: {
  words: string[];
  sessionTitle: string;
  onRemove: (word: string) => void;
  onCreate: () => void;
  creating: boolean;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border bg-background p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <List className="h-4 w-4 text-rose-500" />
          延伸障碍词
          <span className="text-xs text-muted-foreground font-normal">({words.length})</span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {words.map((w) => (
          <span
            key={w}
            className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-medium px-2 py-0.5"
          >
            {w}
            <button
              type="button"
              onClick={() => onRemove(w)}
              className="hover:text-rose-900 dark:hover:text-rose-100 cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        这些词在精听练习中被发现为潜在障碍词。可创建新练习专门攻克它们。
      </p>

      <Button
        size="sm"
        onClick={onCreate}
        disabled={creating}
        className="w-full gap-1.5 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white"
      >
        {creating ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            创建中...
          </>
        ) : (
          <>
            <ArrowRight className="h-3.5 w-3.5" />
            前往练习这些词
          </>
        )}
      </Button>
      <p className="text-[10px] text-muted-foreground text-center">
        将创建「从「{sessionTitle}」延伸的障碍词」
      </p>
    </div>
  );
}


// ==================== 单个答案句块 ====================

interface SentenceBlockProps {
  sentence: ListeningSentence;
  index: number;
  saving: boolean;
  generating: boolean;
  onToggleBlocker: (token: { word: string; start: number; end: number }) => void;
  onGenerate: (forceRefresh: boolean) => void;
  onUpdateNote: (next: string) => void;
  onUpdateText: (next: string) => Promise<boolean>;
  onDelete: () => void;
  isDemo?: boolean;
  onNewBlockerWord?: (word: string) => void;
  onAddMissedWord?: (word: string) => void;
}

function SentenceBlock({
  sentence,
  index,
  saving,
  generating,
  onToggleBlocker,
  onGenerate,
  onUpdateNote,
  onUpdateText,
  onDelete,
  isDemo = false,
  onNewBlockerWord,
  onAddMissedWord,
}: SentenceBlockProps) {
  const [showGenerated, setShowGenerated] = useState(true);
  // 盲听信号（按钮点击时变动，触发所有 ExampleRow 统一 blind/reveal）
  const [blindSignal, setBlindSignal] = useState<"blind" | "reveal" | undefined>(undefined);
  const [blindPulse, setBlindPulse] = useState(0);
  const emitBlind = (kind: "blind" | "reveal") => {
    setBlindSignal(kind);
    setBlindPulse((n) => n + 1);
  };
  // 编辑原文弹窗
  const [editingText, setEditingText] = useState(false);
  const [draftText, setDraftText] = useState(sentence.original_text);
  const [savingText, setSavingText] = useState(false);

  const openEditText = () => {
    setDraftText(sentence.original_text);
    setEditingText(true);
  };
  const submitEditText = async () => {
    setSavingText(true);
    try {
      const ok = await onUpdateText(draftText);
      if (ok) setEditingText(false);
    } finally {
      setSavingText(false);
    }
  };

  const tooltipMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const g of sentence.generated_blocks) {
      m[g.blocker_word] = `${g.difficulty_type} · 点击取消标记`;
    }
    return m;
  }, [sentence.generated_blocks]);

  const hasGenerated = sentence.generated_blocks.length > 0;
  const needsRegen =
    hasGenerated &&
    sentence.blocker_words.some(
      (b) =>
        !sentence.generated_blocks.some(
          (g) => g.blocker_word === b.word.toLowerCase(),
        ),
    );

  return (
    <div className="rounded-xl border bg-background overflow-hidden">
      {/* 答案句区 */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <span className="inline-flex items-center justify-center h-6 min-w-[24px] rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 text-xs font-bold px-2">
            {index + 1}
          </span>
          <div className="flex items-center gap-1.5">
            {saving && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                保存中
              </span>
            )}
            <PlayButton text={sentence.original_text} size="sm" />
            {!isDemo && (
              <>
                <button
                  type="button"
                  onClick={openEditText}
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-amber-600 transition-colors cursor-pointer"
                  title="编辑原文"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                  title="删除该句"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* 提醒：点击单词可新增障碍词 */}
        {!isDemo && sentence.blocker_words.length === 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2 italic">
            💡 点击下方单词可标记为障碍词
          </p>
        )}

        <SentenceEditor
          text={sentence.original_text}
          blockers={sentence.blocker_words}
          onToggle={onToggleBlocker}
          tooltipMap={tooltipMap}
        />

        <SentenceNoteEditor
          value={sentence.note || ""}
          onCommit={onUpdateNote}
          readOnly={isDemo}
        />

        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-muted-foreground">
            {isDemo ? (
              <>
                已预标 <span className="font-bold text-amber-600">{sentence.blocker_words.length}</span> 个障碍词（示例不可修改）
              </>
            ) : sentence.blocker_words.length > 0 ? (
              <>
                已标记 <span className="font-bold text-sky-600">{sentence.blocker_words.length}</span> 个障碍词
              </>
            ) : (
              "点击上方单词标记障碍词"
            )}
          </div>
          {!isDemo && (
            <div className="flex items-center gap-2">
              {hasGenerated && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onGenerate(true)}
                  disabled={generating}
                  className="gap-1.5 text-xs"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`} />
                  重新生成
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => onGenerate(false)}
                disabled={generating || sentence.blocker_words.length === 0}
                className="gap-1.5 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    {hasGenerated && needsRegen ? "补充生成" : hasGenerated ? "查看练习" : "生成精听练习"}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 生成结果区 */}
      {hasGenerated && showGenerated && (
        <div className="border-t bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              🎧 <span className="font-medium">盲听训练</span>：默认隐藏英文和翻译，先用耳朵听
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => emitBlind("blind")}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
                title="把所有例句重新遮起来"
              >
                <EyeOff className="h-3 w-3" />
                全部遮盖
              </button>
              <button
                type="button"
                onClick={() => emitBlind("reveal")}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer"
                title="揭晓所有例句"
              >
                <Eye className="h-3 w-3" />
                全部揭晓
              </button>
            </div>
          </div>
          {sentence.generated_blocks.map((block) => (
            <GenerateResultCard
              key={`${block.id}-${blindPulse}`}
              block={block}
              blindSignal={blindSignal}
              onNewBlockerWord={!isDemo ? onNewBlockerWord : undefined}
              onAddMissedWord={!isDemo ? onAddMissedWord : undefined}
            />
          ))}
        </div>
      )}

      {hasGenerated && (
        <button
          type="button"
          onClick={() => setShowGenerated(!showGenerated)}
          className="w-full border-t py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer"
        >
          {showGenerated ? "折叠练习" : `展开 ${sentence.generated_blocks.length} 组练习`}
        </button>
      )}

      {/* 编辑原文 Dialog */}
      <Dialog open={editingText} onOpenChange={(open) => !savingText && setEditingText(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑答案原文</DialogTitle>
          </DialogHeader>
          <Textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={4}
            className="text-sm"
            placeholder="答案原句（英文）"
            disabled={savingText}
          />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>💡 保存后：</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>原有障碍词会按「词形」自动在新原文中重新定位</li>
              <li>定位不到的障碍词会被剔除（含对应单词本条目）</li>
              <li>AI 生成的梯度例句缓存将清空，需重新生成</li>
            </ul>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingText(false)}
              disabled={savingText}
            >
              取消
            </Button>
            <Button
              onClick={submitEditText}
              disabled={savingText || !draftText.trim() || draftText.trim() === sentence.original_text}
            >
              {savingText ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ==================== 句子备注编辑（上下文） ====================

interface SentenceNoteEditorProps {
  value: string;
  onCommit: (next: string) => void;
  readOnly?: boolean;
}

function SentenceNoteEditor({ value, onCommit, readOnly = false }: SentenceNoteEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  // 外部值变化时（例如切会话、回滚）同步本地 draft
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const hasNote = value.trim().length > 0;

  // 只读模式下：有备注显示；无备注不占空间
  if (readOnly) {
    if (!hasNote) return null;
    return (
      <div className="mt-3 flex items-start gap-2 text-xs rounded-md bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 px-2.5 py-1.5">
        <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-amber-800 dark:text-amber-200 leading-relaxed whitespace-pre-wrap">
          {value}
        </span>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="mt-3">
        <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 px-2 py-1.5">
          <MessageSquare className="h-3.5 w-3.5 mt-1 text-amber-600 dark:text-amber-400 shrink-0" />
          <Textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onCommit(draft);
                setEditing(false);
              } else if (e.key === "Escape") {
                setDraft(value);
                setEditing(false);
              }
            }}
            onBlur={() => {
              if (draft !== value) onCommit(draft);
              setEditing(false);
            }}
            placeholder="备注这条句子的情况（例如：听成了 camb / 拼写错了 October）…AI 生成梯度例句时会作为提示"
            rows={2}
            className="text-xs flex-1 resize-none border-0 focus-visible:ring-0 bg-transparent p-0 min-h-[20px]"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onCommit(draft);
              setEditing(false);
            }}
            className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-600 dark:text-amber-400 shrink-0"
            title="保存 (Cmd/Ctrl + Enter)"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 ml-1">
          Cmd/Ctrl+Enter 保存 · Esc 取消
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`mt-3 w-full flex items-start gap-2 text-xs rounded-md px-2.5 py-1.5 transition-colors text-left cursor-pointer group ${
        hasNote
          ? "bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 hover:bg-amber-100/70 dark:hover:bg-amber-900/30"
          : "border border-dashed border-muted-foreground/20 text-muted-foreground hover:border-amber-300 hover:text-amber-600 dark:hover:text-amber-400"
      }`}
    >
      <MessageSquare
        className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
          hasNote ? "text-amber-600 dark:text-amber-400" : ""
        }`}
      />
      <span
        className={`flex-1 leading-relaxed whitespace-pre-wrap ${
          hasNote ? "text-amber-800 dark:text-amber-200" : ""
        }`}
      >
        {hasNote ? value : "添加上下文备注（AI 生成例句时会参考）"}
      </span>
      <Pencil className="h-3 w-3 mt-0.5 opacity-0 group-hover:opacity-60 shrink-0" />
    </button>
  );
}


// ==================== 盲听默认偏好开关 ====================

function BlindDefaultToggle() {
  const blindByDefault = useBlindModeStore((s) => s.blindByDefault);
  const setBlindByDefault = useBlindModeStore((s) => s.setBlindByDefault);
  return (
    <button
      type="button"
      onClick={() => setBlindByDefault(!blindByDefault)}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors cursor-pointer ${
        blindByDefault
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
          : "hover:bg-accent text-muted-foreground"
      }`}
      title={blindByDefault ? "默认盲听已开启（推荐）" : "默认盲听已关闭"}
    >
      {blindByDefault ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      <span>默认{blindByDefault ? "盲听" : "显示"}</span>
    </button>
  );
}
