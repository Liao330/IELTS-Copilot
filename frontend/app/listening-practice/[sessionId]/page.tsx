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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SentenceEditor } from "@/components/listening/SentenceEditor";
import { GenerateResultCard } from "@/components/listening/GenerateResultCard";
import { PlayButton } from "@/components/listening/PlayButton";

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

  // 追加答案句
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addSentences, setAddSentences] = useState("");
  const [adding, setAdding] = useState(false);

  // 删除句子
  const [deletingSentence, setDeletingSentence] = useState<ListeningSentence | null>(null);

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
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
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

      <main className="container mx-auto px-4 py-6 max-w-3xl">
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
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>🎧 朗读设置</span>
              <PlayButton text="" gearOnly size="sm" />
            </div>
          </div>
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
                onDelete={() => setDeletingSentence(sentence)}
                isDemo={isDemo}
              />
            ))}
          </div>
        )}
      </main>

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

// ==================== 单个答案句块 ====================

interface SentenceBlockProps {
  sentence: ListeningSentence;
  index: number;
  saving: boolean;
  generating: boolean;
  onToggleBlocker: (token: { word: string; start: number; end: number }) => void;
  onGenerate: (forceRefresh: boolean) => void;
  onDelete: () => void;
  isDemo?: boolean;
}

function SentenceBlock({
  sentence,
  index,
  saving,
  generating,
  onToggleBlocker,
  onGenerate,
  onDelete,
  isDemo = false,
}: SentenceBlockProps) {
  const [showGenerated, setShowGenerated] = useState(true);

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
              <button
                type="button"
                onClick={onDelete}
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                title="删除该句"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <SentenceEditor
          text={sentence.original_text}
          blockers={sentence.blocker_words}
          onToggle={onToggleBlocker}
          tooltipMap={tooltipMap}
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
          {sentence.generated_blocks.map((block) => (
            <GenerateResultCard key={block.id} block={block} />
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
    </div>
  );
}
