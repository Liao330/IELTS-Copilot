"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  Check,
  Eye,
  EyeOff,
  PenLine,
  Lightbulb,
} from "lucide-react";
import type { ListeningGeneratedBlock, ListeningGeneratedExample } from "@/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PlayButton } from "./PlayButton";
import { useBlindModeStore } from "@/lib/blind-mode-store";

interface Props {
  block: ListeningGeneratedBlock;
  defaultOpen?: boolean;
  readOnly?: boolean;
  blindSignal?: "blind" | "reveal" | undefined;
  externalOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  连读: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900",
  弱读: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  不熟词: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  吞音: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  相近发音: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  其他: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-800",
};

const LEVEL_STYLES: Record<number, { label: string; bg: string }> = {
  1: { label: "Easy", bg: "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/10" },
  2: { label: "Medium", bg: "border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/10" },
  3: { label: "Hard", bg: "border-rose-200 bg-rose-50/40 dark:border-rose-900/50 dark:bg-rose-950/10" },
};

export function GenerateResultCard({
  block,
  defaultOpen = true,
  readOnly = false,
  blindSignal,
  externalOpen,
  onOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = externalOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setInternalOpen(v);
  };

  const color = DIFFICULTY_COLORS[block.difficulty_type] ?? DIFFICULTY_COLORS["其他"];

  return (
    <div className="rounded-xl border bg-background overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center justify-center h-8 w-8 rounded-md bg-gradient-to-br from-sky-400 to-cyan-500 text-white shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 text-left flex items-center gap-2 min-w-0 flex-wrap">
          <span className="font-bold text-lg">{block.blocker_word}</span>
          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", color)}>
            {block.difficulty_type}
          </span>
          <span className="text-xs text-muted-foreground truncate">· {block.examples.length} 句练习</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm leading-relaxed">
            💡 {block.explanation}
          </div>
          <div className="space-y-2">
            {block.examples
              .slice()
              .sort((a, b) => a.difficulty_level - b.difficulty_level)
              .map((ex, i) => (
                <ExampleRow key={i} example={ex} word={block.blocker_word} readOnly={readOnly} blindSignal={blindSignal} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ==================== 逐词 diff ====================

interface DiffToken {
  type: "correct" | "wrong" | "missing" | "extra";
  expected?: string; // 原文里的词
  actual?: string;   // 用户打的词
}

function diffWords(expected: string, actual: string): DiffToken[] {
  const expWords = expected.replace(/[^\w'\-]/g, " ").split(/\s+/).filter(Boolean);
  const actWords = actual.replace(/[^\w'\-]/g, " ").split(/\s+/).filter(Boolean);

  // 简单的贪心对齐（不做 LCS，够用）
  const result: DiffToken[] = [];
  let ei = 0;
  let ai = 0;

  while (ei < expWords.length && ai < actWords.length) {
    if (expWords[ei].toLowerCase() === actWords[ai].toLowerCase()) {
      result.push({ type: "correct", expected: expWords[ei], actual: actWords[ai] });
      ei++;
      ai++;
    } else {
      // 看用户的下一个词是否匹配当前 expected（用户多打了）
      if (ai + 1 < actWords.length && actWords[ai + 1].toLowerCase() === expWords[ei].toLowerCase()) {
        result.push({ type: "extra", actual: actWords[ai] });
        ai++;
      }
      // 看 expected 的下一个词是否匹配当前 actual（用户漏了）
      else if (ei + 1 < expWords.length && expWords[ei + 1].toLowerCase() === actWords[ai].toLowerCase()) {
        result.push({ type: "missing", expected: expWords[ei] });
        ei++;
      } else {
        result.push({ type: "wrong", expected: expWords[ei], actual: actWords[ai] });
        ei++;
        ai++;
      }
    }
  }
  // 剩余的 expected
  while (ei < expWords.length) {
    result.push({ type: "missing", expected: expWords[ei] });
    ei++;
  }
  // 剩余的 actual
  while (ai < actWords.length) {
    result.push({ type: "extra", actual: actWords[ai] });
    ai++;
  }
  return result;
}


// ==================== ExampleRow ====================

function ExampleRow({
  example,
  word,
  readOnly = false,
  blindSignal,
}: {
  example: ListeningGeneratedExample;
  word: string;
  readOnly?: boolean;
  blindSignal?: "blind" | "reveal";
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const blindByDefault = useBlindModeStore((s) => s.blindByDefault);

  const initialRevealed = readOnly ? true : !blindByDefault;
  const [revealed, setRevealed] = useState(initialRevealed);
  const [hintRevealed, setHintRevealed] = useState(initialRevealed);

  // 听写输入
  const [showDictation, setShowDictation] = useState(false);
  const [dictInput, setDictInput] = useState("");
  const [dictResult, setDictResult] = useState<DiffToken[] | null>(null);

  // 响应父级信号
  useEffect(() => {
    if (readOnly) return;
    if (blindSignal === "blind") {
      setRevealed(false);
      setHintRevealed(false);
      // 遮盖时也清掉听写结果，回到"干净"状态
      setDictResult(null);
      setDictInput("");
    } else if (blindSignal === "reveal") {
      setRevealed(true);
      setHintRevealed(true);
    }
  }, [blindSignal, readOnly]);

  const { toast } = useToast();
  const style = LEVEL_STYLES[example.difficulty_level] ?? LEVEL_STYLES[1];

  const handleSave = useCallback(async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      await api.createSentence({
        content: example.text,
        translation: example.translation,
        note: example.hint,
        category: "listening",
      });
      setSaved(true);
      toast({ description: "已加入好词佳句 📌" });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "保存失败，请重试" });
    } finally {
      setSaving(false);
    }
  }, [saving, saved, example, toast]);

  const highlighted = revealed ? renderHighlighted(example.text, word) : null;

  const handleDictationSubmit = () => {
    if (!dictInput.trim()) return;
    const result = diffWords(example.text, dictInput);
    setDictResult(result);
  };

  // 听写 diff 中漏掉 / 错了的词（推荐为潜在障碍词）
  const missedWords = useMemo(() => {
    if (!dictResult) return [];
    const missed = new Set<string>();
    for (const t of dictResult) {
      if ((t.type === "wrong" || t.type === "missing") && t.expected) {
        const w = t.expected.toLowerCase().replace(/[^a-z'-]/g, "");
        // 过滤掉太短的虚词
        if (w.length >= 3) missed.add(w);
      }
    }
    return Array.from(missed);
  }, [dictResult]);

  const handleToggleRevealed = () => {
    const next = !revealed;
    setRevealed(next);
    // 隐藏时同步关闭 hint
    if (!next) {
      setHintRevealed(false);
    }
  };

  return (
    <div className={cn("rounded-lg border px-3 py-2.5", style.bg)}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Level {example.difficulty_level} · {style.label}
        </span>
        <div className="flex items-center gap-1">
          {!readOnly && <PlayButton text={example.text} size="sm" />}
          {!readOnly && (
            <button
              type="button"
              onClick={handleToggleRevealed}
              className={cn(
                "inline-flex items-center gap-1 text-xs rounded-md px-2 py-0.5 transition-colors cursor-pointer",
                revealed
                  ? "text-muted-foreground hover:text-foreground hover:bg-accent"
                  : "text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40",
              )}
              title={revealed ? "隐藏句子（盲听）" : "揭晓句子"}
            >
              {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {revealed ? "隐藏" : "揭晓"}
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || saved}
              className={cn(
                "inline-flex items-center gap-1 text-xs rounded-md px-2 py-0.5 transition-colors",
                saved
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/30 cursor-pointer",
              )}
            >
              {saved ? <Check className="h-3 w-3" /> : <BookmarkPlus className="h-3 w-3" />}
              {saved ? "已收藏" : "加入佳句"}
            </button>
          )}
        </div>
      </div>

      {/* 句子 */}
      {revealed ? (
        <p className="text-sm font-medium leading-relaxed">{highlighted}</p>
      ) : (
        <p className="text-sm font-medium leading-relaxed text-muted-foreground/60 select-none">
          {renderMasked(example.text)}
        </p>
      )}

      {/* 翻译 */}
      {revealed ? (
        <p className="text-xs text-muted-foreground mt-1">{example.translation}</p>
      ) : (
        <p className="text-xs text-muted-foreground/50 mt-1 italic">
          （翻译已隐藏 · 先用耳朵听）
        </p>
      )}

      {/* hint：独立切换 */}
      {example.hint && (
        hintRevealed ? (
          <div className="flex items-start gap-1 mt-2">
            <p className="text-xs flex-1 pl-2 border-l-2 border-sky-400/50 text-sky-700 dark:text-sky-400 leading-relaxed">
              🎧 {example.hint}
            </p>
            <button
              type="button"
              onClick={() => setHintRevealed(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground shrink-0 px-1 cursor-pointer"
              title="隐藏提示"
            >
              <EyeOff className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setHintRevealed(true)}
            className="text-xs mt-2 text-sky-600 dark:text-sky-400 hover:underline cursor-pointer inline-flex items-center gap-1"
          >
            <Lightbulb className="h-3 w-3" />
            需要发音提示？
          </button>
        )
      )}

      {/* 听写区域（盲听 + 非只读时可用） */}
      {!readOnly && !revealed && (
        <div className="mt-2">
          {!showDictation ? (
            <button
              type="button"
              onClick={() => setShowDictation(true)}
              className="text-xs text-amber-700 dark:text-amber-400 hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              <PenLine className="h-3 w-3" />
              听写复述
            </button>
          ) : (
            <div className="space-y-2 rounded-md bg-background/80 border p-2">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={dictInput}
                  onChange={(e) => { setDictInput(e.target.value); setDictResult(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleDictationSubmit(); }}
                  placeholder="打出你听到的内容…（回车提交）"
                  className="flex-1 text-xs bg-transparent border-b border-muted-foreground/20 focus:border-sky-400 outline-none py-1 px-1"
                  disabled={!!dictResult}
                  autoFocus
                />
                {!dictResult ? (
                  <button
                    type="button"
                    onClick={handleDictationSubmit}
                    disabled={!dictInput.trim()}
                    className="text-xs px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 cursor-pointer"
                  >
                    对比
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setDictInput(""); setDictResult(null); }}
                    className="text-xs px-2 py-1 rounded bg-sky-500 text-white hover:bg-sky-600 cursor-pointer"
                  >
                    再试
                  </button>
                )}
              </div>

              {/* diff 结果 */}
              {dictResult && (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-1 text-xs leading-relaxed">
                    {dictResult.map((t, i) => {
                      if (t.type === "correct") {
                        return <span key={i} className="text-emerald-700 dark:text-emerald-400">{t.expected}</span>;
                      }
                      if (t.type === "wrong") {
                        return (
                          <span key={i}>
                            <span className="line-through text-rose-500/70">{t.actual}</span>
                            <span className="text-rose-700 dark:text-rose-400 font-bold ml-0.5">{t.expected}</span>
                          </span>
                        );
                      }
                      if (t.type === "missing") {
                        return <span key={i} className="text-rose-700 dark:text-rose-400 font-bold underline decoration-dashed">{t.expected}</span>;
                      }
                      // extra
                      return <span key={i} className="line-through text-muted-foreground/50">{t.actual}</span>;
                    })}
                  </div>

                  {/* 统计 */}
                  {(() => {
                    const total = dictResult.filter(t => t.type !== "extra").length;
                    const correct = dictResult.filter(t => t.type === "correct").length;
                    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
                    return (
                      <div className="text-[11px] text-muted-foreground">
                        正确 {correct}/{total} 词 ({pct}%)
                        {missedWords.length > 0 && (
                          <span className="ml-2">
                            · 潜在障碍词：
                            {missedWords.map((w) => (
                              <span key={w} className="font-mono text-rose-600 dark:text-rose-400 ml-1">{w}</span>
                            ))}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ============ 渲染工具 ============

function renderMasked(text: string): string {
  return text.replace(/[A-Za-z']+/g, (w) => "█".repeat(Math.min(w.length, 12)));
}

function renderHighlighted(text: string, word: string): React.ReactNode {
  if (!word) return text;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, "ig");
  const parts = text.split(re);
  const lowerWord = word.toLowerCase();
  return parts.map((p, i) =>
    p.toLowerCase() === lowerWord ? (
      <mark key={i} className="bg-sky-200/80 dark:bg-sky-700/50 rounded px-0.5 text-foreground">{p}</mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
