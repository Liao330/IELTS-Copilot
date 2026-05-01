"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Headphones,
  Sparkles,
  Loader2,
  Wand2,
  X,
  Tag,
  RefreshCw,
  Pencil,
  Check,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ListeningCleanupItem } from "@/types";
import { cn } from "@/lib/utils";

type EditableItem = ListeningCleanupItem;

/**
 * 新建精听会话
 * ------------------------------------
 * 流程是严格的两步：
 *   Step 1（compose）：用户粘贴任意格式的听力复盘笔记 → 点"AI 整理"
 *   Step 2（review）：看 AI 抽取的结构化结果，可编辑 → 点"保存并开始精听"
 *
 * 不提供"按换行符拆句"的 fallback，避免粘贴的原始笔记被误当作答案句。
 */
export default function NewListeningPracticePageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><span className="text-muted-foreground">加载中...</span></div>}>
      <NewListeningPracticePage />
    </Suspense>
  );
}

function NewListeningPracticePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const homeworkId = searchParams.get("homework_id") || undefined;
  const homeworkTitle = searchParams.get("title") || "";

  const [title, setTitle] = useState(homeworkTitle ? `${homeworkTitle}-精听` : "");
  const [note, setNote] = useState("");
  const [rawText, setRawText] = useState("");
  const [cleaning, setCleaning] = useState(false);
  const [items, setItems] = useState<EditableItem[] | null>(null);
  const [cleanupSummary, setCleanupSummary] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const stage: "compose" | "review" = items ? "review" : "compose";

  const canCleanup = rawText.trim().length > 0 && !cleaning && !submitting;
  const canSubmit =
    title.trim().length > 0 && !!items && items.length > 0 && !submitting;

  const handleCleanup = async () => {
    if (!canCleanup) return;
    setCleaning(true);
    try {
      const res = await api.cleanupListeningNote(rawText);
      if (!res.sentences.length) {
        toast({
          variant: "destructive",
          description:
            "AI 没识别到答案句，请确认笔记里包含英文原文（用引号或「答案句」前缀标出）",
        });
      } else {
        setItems(res.sentences);
        setCleanupSummary(res.summary || "");
        toast({ description: `AI 整理出 ${res.sentences.length} 条答案句` });
      }
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "AI 整理失败",
      });
    } finally {
      setCleaning(false);
    }
  };

  const updateItem = (idx: number, patch: Partial<EditableItem>) => {
    setItems((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const removeItem = (idx: number) => {
    setItems((prev) => {
      if (!prev) return prev;
      const next = prev.filter((_, i) => i !== idx);
      // 全删光就回到 compose 阶段
      return next.length ? next : null;
    });
  };

  const backToCompose = () => {
    // 保留 rawText，清空 items，让用户改文本后重新整理
    setItems(null);
  };

  const handleSubmit = async () => {
    if (!canSubmit || !items) return;
    setSubmitting(true);
    try {
      const session = await api.createListeningSession({
        title: title.trim(),
        note: note.trim() || undefined,
        homework_id: homeworkId,
        sentences_with_context: items.map((it) => ({
          text: it.text,
          note: it.note || undefined,
          blocker_words: it.prefilled_blockers,
        })),
      });
      toast({ description: "创建成功，AI 已为你预标记障碍词" });
      router.push(`/listening-practice/${session.id}`);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "创建失败，请重试" });
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="container mx-auto px-4 h-14 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Headphones className="h-5 w-5 text-sky-500" />
            新建听力精听
          </h1>
          <div className="ml-auto">
            <StageIndicator stage={stage} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium block mb-1.5">
              练习标题 <span className="text-rose-500">*</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：C18 Test 2 Section 3 错题精听"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">备注（可选）</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：今天下午的套题，Section 3 错了 4 题"
            />
          </div>

          {/* ==================== Step 1：粘贴 + AI 整理 ==================== */}
          {stage === "compose" && (
            <ComposeStage
              rawText={rawText}
              setRawText={setRawText}
              cleaning={cleaning}
              canCleanup={canCleanup}
              onCleanup={handleCleanup}
            />
          )}

          {/* ==================== Step 2：预览编辑 ==================== */}
          {stage === "review" && items && (
            <>
              {cleanupSummary && (
                <div className="mb-4 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20 p-4">
                  <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">📊 本次听力复盘总结</p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{cleanupSummary}</p>
                </div>
              )}
              <ReviewStage
                items={items}
                updateItem={updateItem}
                removeItem={removeItem}
                onBack={backToCompose}
              />
            </>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="flex-1"
              disabled={submitting}
            >
              取消
            </Button>
            {stage === "compose" ? (
              <Button
                onClick={handleCleanup}
                disabled={!canCleanup}
                className="flex-[2] bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white gap-2"
              >
                {cleaning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    AI 整理中…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    AI 整理笔记
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-[2] bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white"
              >
                {submitting ? "创建中…" : `保存并开始精听（${items?.length ?? 0} 句）`}
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}


// ============ 子组件：阶段指示器 ============

function StageIndicator({ stage }: { stage: "compose" | "review" }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          "inline-flex items-center justify-center h-5 w-5 rounded-full font-bold",
          stage === "compose"
            ? "bg-amber-500 text-white"
            : "bg-emerald-500 text-white",
        )}
      >
        {stage === "compose" ? "1" : "✓"}
      </span>
      <span
        className={cn(
          "hidden sm:inline",
          stage === "compose" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
        )}
      >
        粘贴笔记
      </span>
      <span className="text-muted-foreground/50">→</span>
      <span
        className={cn(
          "inline-flex items-center justify-center h-5 w-5 rounded-full font-bold",
          stage === "review"
            ? "bg-sky-500 text-white"
            : "bg-muted text-muted-foreground",
        )}
      >
        2
      </span>
      <span
        className={cn(
          "hidden sm:inline",
          stage === "review" ? "text-sky-700 dark:text-sky-300" : "text-muted-foreground",
        )}
      >
        确认并保存
      </span>
    </div>
  );
}


// ============ 子组件：Compose 阶段 ============

function ComposeStage({
  rawText,
  setRawText,
  cleaning,
  canCleanup,
  onCleanup,
}: {
  rawText: string;
  setRawText: (v: string) => void;
  cleaning: boolean;
  canCleanup: boolean;
  onCleanup: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium">
          粘贴听力复盘笔记 <span className="text-rose-500">*</span>
        </label>
        <span className="text-xs text-muted-foreground">
          {rawText.trim().length} 字符
        </span>
      </div>
      <Textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        placeholder={`格式不限，直接把你的错题复盘原文粘进来即可。AI 会自动剥离序号/吐槽，抽取"答案原句 + 目标词 + 上下文备注"；没有答案原句的条目会被跳过。\n\n例如：\n1、cab 出租车 我第二次听听成camb了\n答案句'Ok. In that case the quickest and most comfortable is a cab and of course there are always plenty available.'\n2、city center 我听成centre city 而且有拼写错误\n3、wait 我没听到要填啥只能根据录音意思填个hour\n答案句'Hmmm, too bad, the bus leaves at 3:45, so you would have quite a wait - more than 4 hours.'`}
        rows={14}
        className="font-mono text-sm"
        disabled={cleaning}
      />
      <div className="flex items-center gap-2 mt-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">下一步 →</strong>{" "}
          点下面的「AI 整理笔记」后，你会看到每条答案句的预览，可以删改备注、调整文字，确认后再保存。
        </p>
      </div>
      {/* 顶部也放一个快捷触发，方便笔记很长时不用滚到底部 */}
      <div className="sr-only">
        <button onClick={onCleanup} disabled={!canCleanup}>
          AI 整理
        </button>
      </div>
    </div>
  );
}


// ============ 子组件：Review 阶段 ============

function ReviewStage({
  items,
  updateItem,
  removeItem,
  onBack,
}: {
  items: EditableItem[];
  updateItem: (idx: number, patch: Partial<EditableItem>) => void;
  removeItem: (idx: number) => void;
  onBack: () => void;
}) {
  return (
    <div className="rounded-lg border bg-gradient-to-br from-amber-50/60 via-orange-50/40 to-white dark:from-amber-950/30 dark:via-orange-950/20 dark:to-background p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-amber-500" />
          AI 整理结果
          <span className="text-xs font-normal text-muted-foreground">
            共 {items.length} 句 · 悬浮显示 ✏️ 可编辑
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-xs h-7 gap-1 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" />
          重新整理
        </Button>
      </div>

      <div className="space-y-2.5">
        {items.map((item, idx) => (
          <CleanupItemRow
            key={idx}
            item={item}
            index={idx}
            onChange={(patch) => updateItem(idx, patch)}
            onRemove={() => removeItem(idx)}
          />
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground pt-1 leading-relaxed">
        💡 AI 已从笔记里提取答案句并预选目标词；保存后，目标词会作为默认障碍词直接展示在详情页，你可以随时调整。「上下文备注」会在 AI 生成梯度例句时作为针对性提示（例如「听成了 camb」会引导 AI 生成相近发音易混训练）。
      </p>
    </div>
  );
}


// ============ 子组件：单条整理结果行（只读 / 编辑双态） ============

/**
 * 简单的本地障碍词位置定位：按出现顺序在 text 中 find 每个词的原样/小写位置。
 * 不覆盖复杂短语/重复词 —— 前端编辑时够用；完整逻辑仍以后端 cleanup 为准。
 */
function relocateBlockers(text: string, words: string[]): { word: string; start: number; end: number }[] {
  const out: { word: string; start: number; end: number }[] = [];
  const used: [number, number][] = [];
  const tryFind = (w: string): number => {
    // 先原样
    let idx = text.indexOf(w);
    while (idx >= 0) {
      const end = idx + w.length;
      const overlap = used.some(([s, e]) => !(end <= s || idx >= e));
      if (!overlap) return idx;
      idx = text.indexOf(w, end);
    }
    // 小写
    const low = text.toLowerCase();
    idx = low.indexOf(w.toLowerCase());
    while (idx >= 0) {
      const end = idx + w.length;
      const overlap = used.some(([s, e]) => !(end <= s || idx >= e));
      if (!overlap) return idx;
      idx = low.indexOf(w.toLowerCase(), end);
    }
    return -1;
  };
  for (const w of words) {
    const trimmed = w.trim();
    if (!trimmed) continue;
    const idx = tryFind(trimmed);
    if (idx < 0) continue;
    out.push({ word: text.slice(idx, idx + trimmed.length), start: idx, end: idx + trimmed.length });
    used.push([idx, idx + trimmed.length]);
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

function CleanupItemRow({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: EditableItem;
  index: number;
  onChange: (patch: Partial<EditableItem>) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  // 本地 draft：编辑时不直接改父级，确认后一次提交
  const [draftText, setDraftText] = useState(item.text);
  const [draftNote, setDraftNote] = useState(item.note || "");
  const [draftWords, setDraftWords] = useState<string[]>(item.target_words);
  const [newWord, setNewWord] = useState("");

  const enterEdit = () => {
    setDraftText(item.text);
    setDraftNote(item.note || "");
    setDraftWords(item.target_words);
    setNewWord("");
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const commitEdit = () => {
    // 对最终的目标词做本地 find 预定位（保证后续详情页直接可用）
    const prefilled = relocateBlockers(draftText, draftWords);
    // 同步把在 text 里找不到的词从 target_words 剔除，避免展示"预标 0 处"
    const validWords = prefilled.map((p) => p.word);
    onChange({
      text: draftText,
      note: draftNote.trim() || null,
      target_words: validWords,
      prefilled_blockers: prefilled,
    });
    setEditing(false);
  };

  const addWord = () => {
    const w = newWord.trim();
    if (!w) return;
    if (draftWords.some((x) => x.toLowerCase() === w.toLowerCase())) {
      setNewWord("");
      return;
    }
    setDraftWords((prev) => [...prev, w]);
    setNewWord("");
  };

  const removeWord = (w: string) => {
    setDraftWords((prev) => prev.filter((x) => x !== w));
  };

  // ============ 编辑态 ============
  if (editing) {
    const previewPrefilled = relocateBlockers(draftText, draftWords);
    const invalidWords = draftWords.filter(
      (w) => !previewPrefilled.some((p) => p.word.toLowerCase() === w.toLowerCase()),
    );

    return (
      <div className="rounded-md border-2 border-amber-300 dark:border-amber-700 bg-background p-3 space-y-2.5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono text-muted-foreground">#{index + 1} 编辑中</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelEdit}
              className="h-7 px-2 text-xs gap-1"
            >
              <X className="h-3 w-3" />
              取消
            </Button>
            <Button
              size="sm"
              onClick={commitEdit}
              className="h-7 px-2 text-xs gap-1 bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              <Check className="h-3 w-3" />
              保存
            </Button>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">答案原句（英文）</label>
          <Textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={3}
            className="text-sm resize-none font-medium"
            placeholder="答案原句（英文）"
          />
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">
            上下文备注（AI 生成例句时参考）
          </label>
          <Input
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder="例如：听成了 camb / 拼写错误"
            className="text-xs h-8"
          />
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">
            目标词（障碍词，将作为精听默认标记）
          </label>
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            {draftWords.length === 0 && (
              <span className="text-[11px] text-muted-foreground italic">
                暂无；可在下方输入框追加
              </span>
            )}
            {draftWords.map((w) => {
              const valid = previewPrefilled.some(
                (p) => p.word.toLowerCase() === w.toLowerCase(),
              );
              return (
                <span
                  key={w}
                  className={cn(
                    "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded",
                    valid
                      ? "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                      : "bg-rose-100 text-rose-700 line-through dark:bg-rose-950/50 dark:text-rose-300",
                  )}
                  title={valid ? "已在原句中定位" : "该词在原句中找不到，保存后会被剔除"}
                >
                  {w}
                  <button
                    type="button"
                    onClick={() => removeWord(w)}
                    className="hover:bg-black/10 dark:hover:bg-white/10 rounded p-0.5"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addWord();
                }
              }}
              placeholder="追加目标词（回车或点 +）"
              className="text-xs h-7 flex-1"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addWord}
              disabled={!newWord.trim()}
              className="h-7 px-2"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          {invalidWords.length > 0 && (
            <p className="text-[10px] text-rose-500 mt-1">
              红色划线词不在原句里，保存时会被剔除：{invalidWords.join("、")}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">
            保存后会根据最终答案句自动重新定位 {previewPrefilled.length} 处标记
          </p>
        </div>
      </div>
    );
  }

  // ============ 只读态 ============
  const targetWords = item.target_words;
  return (
    <div className="rounded-md border bg-background/80 backdrop-blur p-3 space-y-1.5 group">
      <div className="flex items-start gap-2">
        <span className="text-xs font-mono text-muted-foreground mt-1 shrink-0">
          #{index + 1}
        </span>
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-sm font-medium leading-relaxed break-words">{item.text}</p>
          {item.note && (
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed flex items-start gap-1">
              <span className="text-amber-500">💭</span>
              <span>{item.note}</span>
            </p>
          )}
          {targetWords.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Tag className="h-3 w-3 text-sky-500 shrink-0" />
              {targetWords.map((w) => (
                <span
                  key={w}
                  className={cn(
                    "text-xs px-1.5 py-0.5 rounded",
                    "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
                  )}
                >
                  {w}
                </span>
              ))}
              <span className="text-[10px] text-muted-foreground">
                · 已预标 {item.prefilled_blockers.length} 处
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={enterEdit}
            className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-950/40 text-muted-foreground hover:text-amber-600 opacity-60 group-hover:opacity-100 transition-opacity"
            title="编辑此句"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/40 text-muted-foreground hover:text-rose-600 opacity-60 group-hover:opacity-100 transition-opacity"
            title="移除此句"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
