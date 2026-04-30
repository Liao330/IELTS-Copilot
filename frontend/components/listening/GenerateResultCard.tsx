"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  RotateCcw,
  Plus,
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
  /** 当用户在练习句中点击非障碍词时触发（新增障碍词） */
  onNewBlockerWord?: (word: string) => void;
  /** 当听写产出潜在障碍词且用户点"加入列表"时触发 */
  onAddMissedWord?: (word: string) => void;
  /** 手动触发生成 Hard 句（由父组件提供） */
  onGenerateHard?: () => Promise<void>;
  /** 听写提交后回调（用于更新进度条等） */
  onDictationComplete?: (blockId: string, exampleIndex: number) => void;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  连读: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900",
  弱读: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  不熟词: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  吞音: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  相近发音: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  其他: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-800",
};

const LEVEL_STYLES: Record<number, { label: string; bg: string; tag?: string }> = {
  1: { label: "Easy", bg: "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/10" },
  2: { label: "Medium", bg: "border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/10" },
  3: { label: "Hard", bg: "border-rose-200 bg-rose-50/40 dark:border-rose-900/50 dark:bg-rose-950/10", tag: "可选挑战" },
};

export function GenerateResultCard({
  block,
  defaultOpen = true,
  readOnly = false,
  blindSignal,
  externalOpen,
  onOpenChange,
  onNewBlockerWord,
  onAddMissedWord,
  onGenerateHard,
  onDictationComplete,
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
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen(!open); }}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
      >
        <div className="flex items-center justify-center h-8 w-8 rounded-md bg-gradient-to-br from-sky-400 to-cyan-500 text-white shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 text-left flex items-center gap-2 min-w-0 flex-wrap">
          <span className="font-bold text-lg">{block.blocker_word}</span>
          <span onClick={(e) => e.stopPropagation()}>
            <PlayButton text={block.blocker_word} size="sm" />
          </span>
          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", color)}>
            {block.difficulty_type}
          </span>
          <span className="text-xs text-muted-foreground truncate">· {block.examples.length} 句练习</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm leading-relaxed">
            💡 {block.explanation}
          </div>
          {/* 点击单词新增障碍词提醒 */}
          {!readOnly && onNewBlockerWord && (
            <p className="text-[11px] text-muted-foreground/70 italic">
              💡 揭晓后点击句中单词可新增障碍词（已有障碍词不可重复点击）
            </p>
          )}
          <div className="space-y-2">
            {block.examples
              .slice()
              .sort((a, b) => a.difficulty_level - b.difficulty_level)
              .map((ex, i) => (
                <ExampleRow
                  key={i}
                  example={ex}
                  exampleIndex={i}
                  blockId={block.id}
                  word={block.blocker_word}
                  readOnly={readOnly}
                  blindSignal={blindSignal}
                  onNewBlockerWord={onNewBlockerWord}
                  onAddMissedWord={onAddMissedWord}
                  initialAttempt={block.latest_attempts?.[String(i)] ?? undefined}
                  onDictationComplete={onDictationComplete ? () => onDictationComplete(block.id, i) : undefined}
                />
              ))}
          </div>
          {/* 如果没有 Hard 句，显示手动生成按钮 */}
          {!readOnly && onGenerateHard && !block.examples.some((ex) => ex.difficulty_level === 3) && (
            <GenerateHardButton onGenerate={onGenerateHard} />
          )}
        </div>
      )}
    </div>
  );
}


// ==================== Generate Hard Button ====================

function GenerateHardButton({ onGenerate }: { onGenerate: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const handleClick = async () => {
    setLoading(true);
    try {
      await onGenerate();
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="text-xs text-rose-600 dark:text-rose-400 hover:underline cursor-pointer inline-flex items-center gap-1 mt-1 disabled:opacity-50"
    >
      {loading ? (
        <span className="animate-pulse">生成中...</span>
      ) : (
        <>
          <Plus className="h-3 w-3" />
          挑战 Hard 句
        </>
      )}
    </button>
  );
}


// ==================== Tokenizer ====================

interface TextToken {
  type: "word" | "sep";
  text: string;
  /** word token 的序号（0-based），sep 为 -1 */
  wordIndex: number;
}

function tokenize(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  // 按"单词字符"和"非单词字符"交替分割
  const re = /([A-Za-z']+)|([^A-Za-z']+)/g;
  let m: RegExpExecArray | null;
  let wordIdx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      tokens.push({ type: "word", text: m[1], wordIndex: wordIdx++ });
    } else {
      tokens.push({ type: "sep", text: m[2], wordIndex: -1 });
    }
  }
  return tokens;
}


// ==================== ExampleRow ====================

function ExampleRow({
  example,
  exampleIndex,
  blockId,
  word,
  readOnly = false,
  blindSignal,
  onNewBlockerWord,
  onAddMissedWord,
  initialAttempt,
  onDictationComplete,
}: {
  example: ListeningGeneratedExample;
  exampleIndex: number;
  blockId: string;
  word: string;
  readOnly?: boolean;
  blindSignal?: "blind" | "reveal";
  onNewBlockerWord?: (word: string) => void;
  onAddMissedWord?: (word: string) => void;
  initialAttempt?: { user_answers: string[]; play_count: number; accuracy_pct: number; missed_words: string[] };
  onDictationComplete?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const blindByDefault = useBlindModeStore((s) => s.blindByDefault);

  // 如果有历史听写记录，直接进入已提交状态
  const hasInitialAttempt = !!(initialAttempt?.user_answers?.length && initialAttempt.user_answers.length > 0);

  // 有历史记录时：默认隐藏（显示遮罩+对比记录），点揭晓才显示原句
  const initialRevealed = readOnly && !hasInitialAttempt ? true : hasInitialAttempt ? false : !blindByDefault;
  const [revealed, setRevealed] = useState(initialRevealed);
  const [hintRevealed, setHintRevealed] = useState(initialRevealed);

  // 听写模式
  const [dictMode, setDictMode] = useState(hasInitialAttempt);
  const [submitted, setSubmitted] = useState(hasInitialAttempt);

  // 播放次数追踪
  const [playCount, setPlayCount] = useState(hasInitialAttempt ? (initialAttempt?.play_count ?? 0) : 0);
  // 对比后的播放次数（区分做题时听和对比后听）
  const [postPlayCount, setPostPlayCount] = useState(0);

  // 历史听写次数
  const [attemptCount, setAttemptCount] = useState(hasInitialAttempt ? 1 : 0);

  const tokens = useMemo(() => tokenize(example.text), [example.text]);
  const wordCount = useMemo(() => tokens.filter(t => t.type === "word").length, [tokens]);

  // 听写时最多播放次数限制（Easy=3, Medium=5, Hard=无限）
  const maxPlays = example.difficulty_level === 1 ? 3 : example.difficulty_level === 2 ? 5 : Infinity;
  const playLimitReached = !submitted && playCount >= maxPlays;

  // 每个 word token 的用户输入（从历史记录初始化）
  const [answers, setAnswers] = useState<string[]>(() =>
    hasInitialAttempt ? initialAttempt!.user_answers : Array(wordCount).fill(""),
  );
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 响应父级信号
  useEffect(() => {
    if (readOnly) return;
    if (blindSignal === "blind") {
      setRevealed(false);
      setHintRevealed(false);
      setDictMode(false);
      setSubmitted(false);
      setAnswers(Array(wordCount).fill(""));
      setPlayCount(0);
      setPostPlayCount(0);
    } else if (blindSignal === "reveal") {
      setRevealed(true);
      setHintRevealed(true);
    }
  }, [blindSignal, readOnly, wordCount]);

  const { toast } = useToast();
  const style = LEVEL_STYLES[example.difficulty_level] ?? LEVEL_STYLES[1];

  const handleSave = useCallback(async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      await api.createSentence({ content: example.text, translation: example.translation, note: example.hint, category: "listening" });
      setSaved(true);
      toast({ description: "已加入好词佳句 📌" });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "保存失败" });
    } finally {
      setSaving(false);
    }
  }, [saving, saved, example, toast]);

  const handleToggleRevealed = () => {
    const next = !revealed;
    setRevealed(next);
    if (!next) {
      setHintRevealed(false);
    }
  };

  const handleStartDictation = () => {
    setDictMode(true);
    setSubmitted(false);
    setAnswers(Array(wordCount).fill(""));
    setPlayCount(0);
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  };

  const handleSubmitDictation = () => {
    setSubmitted(true);
    setAttemptCount((n) => n + 1);
    // 异步保存听写记录（fire-and-forget）
    if (!readOnly && blockId) {
      const wordTokens = tokens.filter(t => t.type === "word");
      let correct = 0;
      const missed: string[] = [];
      wordTokens.forEach((t, i) => {
        const expected = t.text.toLowerCase();
        const actual = (answers[i] || "").trim().toLowerCase();
        if (expected === actual) {
          correct++;
        } else if (t.text.length >= 3) {
          missed.push(t.text);
        }
      });
      const total = wordTokens.length;
      const pct = Math.round((correct / total) * 100);
      api.saveDictationAttempt({
        generated_block_id: blockId,
        example_index: exampleIndex,
        play_count: playCount,
        correct_count: correct,
        total_count: total,
        accuracy_pct: pct,
        missed_words: missed,
        user_answers: answers,
      }).catch(() => {});
      // 通知父组件更新进度
      onDictationComplete?.();
    }
  };

  const handleRetry = () => {
    setSubmitted(false);
    setAnswers(Array(wordCount).fill(""));
    setPlayCount(0);
    setPostPlayCount(0);
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  };

  const handleInputChange = (wordIdx: number, value: string) => {
    // 如果用户输了空格，视为"跳到下一个"
    if (value.endsWith(" ")) {
      const trimmed = value.trimEnd();
      setAnswers(prev => { const next = [...prev]; next[wordIdx] = trimmed; return next; });
      // 聚焦下一个
      const nextRef = inputRefs.current[wordIdx + 1];
      if (nextRef) nextRef.focus();
      return;
    }
    setAnswers(prev => { const next = [...prev]; next[wordIdx] = value; return next; });
  };

  const handleKeyDown = (wordIdx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // 中文输入法正在组合时，不拦截任何键
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Tab") {
      e.preventDefault();
      const nextRef = inputRefs.current[wordIdx + (e.shiftKey ? -1 : 1)];
      if (nextRef) nextRef.focus();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmitDictation();
    }
    // Backspace 在空输入时跳到前一个
    if (e.key === "Backspace" && !answers[wordIdx] && wordIdx > 0) {
      e.preventDefault();
      inputRefs.current[wordIdx - 1]?.focus();
    }
  };

  // 统计
  const stats = useMemo(() => {
    if (!submitted) return null;
    let correct = 0;
    const missed: string[] = [];
    const wordTokens = tokens.filter(t => t.type === "word");
    wordTokens.forEach((t, i) => {
      const expected = t.text.toLowerCase();
      const actual = (answers[i] || "").trim().toLowerCase();
      if (expected === actual) {
        correct++;
      } else if (t.text.length >= 3) {
        missed.push(t.text);
      }
    });
    return { correct, total: wordTokens.length, pct: Math.round((correct / wordTokens.length) * 100), missed };
  }, [submitted, tokens, answers]);

  // blocker word 是否匹配某个 token（用于 revealed 态可点击判断）
  const isBlockerToken = useCallback((tokenText: string) => {
    const lower = tokenText.toLowerCase();
    // word prop 可能是多词短语如 "a lot of"，这里只做单词级别匹配
    const blockerWords = word.toLowerCase().split(/\s+/);
    return blockerWords.includes(lower);
  }, [word]);

  // ==================== render ====================

  const renderSentenceArea = () => {
    // 已揭晓：可点击单词新增障碍词
    if (revealed) {
      if (!readOnly && onNewBlockerWord) {
        return (
          <p className="text-sm font-medium leading-relaxed">
            {tokens.map((t, i) => {
              if (t.type === "sep") return <span key={i}>{t.text}</span>;
              const isBW = isBlockerToken(t.text);
              if (isBW) {
                // 原始障碍词：高亮但不可点击
                return (
                  <mark key={i} className="bg-sky-200/80 dark:bg-sky-700/50 rounded px-0.5 text-foreground cursor-default">
                    {t.text}
                  </mark>
                );
              }
              // 非障碍词：可点击新增
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onNewBlockerWord(t.text)}
                  className="inline rounded px-0.5 transition-colors hover:bg-rose-100 dark:hover:bg-rose-900/40 hover:text-rose-700 dark:hover:text-rose-300 cursor-pointer"
                  title={`点击将「${t.text}」加入延伸障碍词`}
                >
                  {t.text}
                </button>
              );
            })}
          </p>
        );
      }
      // readOnly 或无回调：静态高亮
      return <p className="text-sm font-medium leading-relaxed">{renderHighlighted(example.text, word)}</p>;
    }

    // 盲听遮罩（用 token 级渲染，和输入行保持相同 flex 布局对齐）
    const maskedLine = (
      <div className="flex flex-wrap items-baseline gap-y-1 text-sm font-mono leading-relaxed text-muted-foreground/60 select-none">
        {tokens.map((t, i) => {
          if (t.type === "sep") {
            return <span key={i} className="whitespace-pre-wrap">{t.text}</span>;
          }
          const maskLen = Math.min(t.text.length, 12);
          return (
            <span key={i} className="inline-block mx-px" style={{ width: `${Math.max(maskLen, 2)}ch` }}>
              {"█".repeat(maskLen)}
            </span>
          );
        })}
      </div>
    );

    // 盲听 + 听写模式：遮罩在上，输入/结果在下
    if (dictMode) {
      let refIdx = 0;
      const inputLine = (
        <div className="flex flex-wrap items-baseline gap-y-1 text-sm font-mono leading-relaxed">
          {tokens.map((t, i) => {
            if (t.type === "sep") {
              return <span key={i} className="whitespace-pre-wrap">{t.text}</span>;
            }
            const wi = t.wordIndex;
            const myRefIdx = refIdx++;
            const userAnswer = answers[wi] || "";
            const expected = t.text;
            const slotLen = Math.min(expected.length, 12);

            if (submitted) {
              const isCorrect = userAnswer.trim().toLowerCase() === expected.toLowerCase();
              return (
                <span
                  key={i}
                  className={cn(
                    "inline-block",
                    isCorrect
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-rose-700 dark:text-rose-400",
                  )}
                  title={isCorrect ? "正确" : `你写的：${userAnswer || "（空）"} → 正确：${expected}`}
                >
                  {isCorrect ? expected : (
                    <>
                      {userAnswer && <span className="line-through opacity-60 mr-0.5">{userAnswer}</span>}
                      <span className="font-bold underline decoration-dashed">{expected}</span>
                    </>
                  )}
                </span>
              );
            }

            // 未提交：等长下划线输入坑位（宽度与遮罩块一致）
            return (
              <input
                key={i}
                ref={(el) => { inputRefs.current[myRefIdx] = el; }}
                type="text"
                value={userAnswer}
                onChange={(e) => handleInputChange(wi, e.target.value)}
                onKeyDown={(e) => handleKeyDown(wi, e)}
                style={{ width: `${Math.max(slotLen, 2)}ch` }}
                className={cn(
                  "inline-block bg-transparent text-center text-sm",
                  "border-b-2 border-muted-foreground/30 focus:border-amber-500 dark:focus:border-amber-400",
                  "outline-none transition-colors py-0 mx-px",
                )}
                placeholder={"_".repeat(slotLen)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            );
          })}
        </div>
      );

      return (
        <>
          {maskedLine}
          {inputLine}
        </>
      );
    }

    // 盲听 + 非听写：只有遮罩
    return maskedLine;
  };

  return (
    <div className={cn("rounded-lg border px-3 py-2.5", style.bg)}>
      {/* header */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Level {example.difficulty_level} · {style.label}
          {example.scene && (
            <span className="ml-1.5 normal-case text-sky-600 dark:text-sky-400 font-medium">
              🎬 {example.scene}
            </span>
          )}
          {style.tag && (
            <span className="ml-1 normal-case text-rose-400 dark:text-rose-500 font-normal">
              ({style.tag})
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {!readOnly && (
            <>
            <PlayButton
              text={example.text}
              size="sm"
              onPlay={() => {
                if (submitted) {
                  setPostPlayCount((n) => n + 1);
                } else if (playCount < maxPlays) {
                  setPlayCount((n) => n + 1);
                }
              }}
            />
            {!submitted && playCount > 0 && playCount < maxPlays && (
              <span className="text-[10px] text-muted-foreground ml-1">
                {playCount}/{maxPlays === Infinity ? "∞" : maxPlays}
              </span>
            )}
            {playLimitReached && !submitted && (
              <span className="text-[10px] text-rose-500 ml-1">
                已达上限，请作答
              </span>
            )}
            </>
          )}
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

      {/* 句子区 */}
      {renderSentenceArea()}

      {/* 听写操作栏（盲听模式下显示） */}
      {!revealed ? (
        <div className="mt-1.5 flex items-center gap-2">
          {!dictMode && !readOnly ? (
            <button
              type="button"
              onClick={handleStartDictation}
              className="text-xs text-amber-700 dark:text-amber-400 hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              <PenLine className="h-3 w-3" />
              听写填空
            </button>
          ) : submitted ? (
            <div className="flex items-center gap-2 flex-wrap">
              {stats && (
                <span className="text-[11px] text-muted-foreground">
                  {attemptCount > 1 && (
                    <span className="mr-1 text-sky-600 dark:text-sky-400 font-medium">第 {attemptCount} 次练习 ·</span>
                  )}
                  {(playCount > 0 || postPlayCount > 0) && (
                    <span className="mr-1">
                      🎧 听写时听了 {playCount} 次
                      {postPlayCount > 0 && <span> · 对比后又听了 {postPlayCount} 次</span>}
                      {" ·"}
                    </span>
                  )}
                  正确 {stats.correct}/{stats.total} 词 ({stats.pct}%)
                  {stats.missed.length > 0 && (
                    <span className="ml-1">
                      · 潜在障碍词：
                      {stats.missed.map((w) => (
                        <span key={w} className="inline-flex items-center">
                          <span className="font-mono text-rose-600 dark:text-rose-400 ml-1">{w}</span>
                          {onAddMissedWord && (
                            <button
                              type="button"
                              onClick={() => onAddMissedWord(w)}
                              className="ml-0.5 text-sky-500 hover:text-sky-700 dark:hover:text-sky-300 cursor-pointer"
                              title={`将「${w}」加入延伸障碍词列表`}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="text-xs text-sky-600 dark:text-sky-400 hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  再试
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSubmitDictation}
              className="text-xs px-2.5 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 cursor-pointer inline-flex items-center gap-1"
            >
              <Check className="h-3 w-3" />
              对比
            </button>
          )}
        </div>
      ) : null}

      {/* 翻译 */}
      {revealed ? (
        <p className="text-xs text-muted-foreground mt-1">{example.translation}</p>
      ) : (
        <p className="text-xs text-muted-foreground/50 mt-1 italic">（翻译已隐藏 · 先用耳朵听）</p>
      )}

      {/* hint 独立控制 */}
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
    </div>
  );
}


// ============ 渲染工具 ============

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
