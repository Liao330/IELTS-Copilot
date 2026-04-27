"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sparkles,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  Check,
  Eye,
  EyeOff,
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
  /** 只读模式：隐藏"加入佳句"等交互按钮，用于 Demo 预览 */
  readOnly?: boolean;
  /** 父级"本句盲听"信号：变动时同步到所有 ExampleRow。undefined 表示不控制 */
  blindSignal?: "blind" | "reveal" | undefined;
  /** 本 block 是否展开，由父组件控制；不传则内部自控 */
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
  1: {
    label: "Easy",
    bg: "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/10",
  },
  2: {
    label: "Medium",
    bg: "border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/10",
  },
  3: {
    label: "Hard",
    bg: "border-rose-200 bg-rose-50/40 dark:border-rose-900/50 dark:bg-rose-950/10",
  },
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
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
              color,
            )}
          >
            {block.difficulty_type}
          </span>
          <span className="text-xs text-muted-foreground truncate">· {block.examples.length} 句练习</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
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
                <ExampleRow
                  key={i}
                  example={ex}
                  word={block.blocker_word}
                  readOnly={readOnly}
                  blindSignal={blindSignal}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

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

  // readOnly (demo 预览) 强制揭晓，便于展示效果
  // 非 readOnly 时根据全局偏好决定初值
  const initialRevealed = readOnly ? true : !blindByDefault;
  const [revealed, setRevealed] = useState(initialRevealed);
  const [hintRevealed, setHintRevealed] = useState(initialRevealed);

  // 响应父级"全部揭晓/全部遮盖"信号（demo 下忽略）
  useEffect(() => {
    if (readOnly) return;
    if (blindSignal === "blind") {
      setRevealed(false);
      setHintRevealed(false);
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

  // 高亮的句子（只在 revealed 时渲染）
  const highlighted = revealed ? renderHighlighted(example.text, word) : null;

  return (
    <div className={cn("rounded-lg border px-3 py-2.5", style.bg)}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Level {example.difficulty_level} · {style.label}
        </span>
        <div className="flex items-center gap-1">
          {!readOnly && <PlayButton text={example.text} size="sm" />}
          {/* 显示 / 隐藏切换（demo 预览不显示） */}
          {!readOnly && (
            <button
              type="button"
              onClick={() => {
                const next = !revealed;
                setRevealed(next);
                if (next) setHintRevealed(true);
              }}
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

      {/* 句子：盲听时用 ██ 占位，保留节奏感 */}
      {revealed ? (
        <p className="text-sm font-medium leading-relaxed">{highlighted}</p>
      ) : (
        <p
          className="text-sm font-medium leading-relaxed text-muted-foreground/60 select-none"
          aria-label="盲听中，点击右上'揭晓'显示原文"
        >
          {renderMasked(example.text)}
        </p>
      )}

      {/* 翻译：盲听时隐藏 */}
      {revealed ? (
        <p className="text-xs text-muted-foreground mt-1">{example.translation}</p>
      ) : (
        <p className="text-xs text-muted-foreground/50 mt-1 italic">
          （翻译已隐藏 · 先用耳朵听）
        </p>
      )}

      {/* hint：盲听时给一个"需要提示"按钮 */}
      {example.hint && (
        hintRevealed ? (
          <p className="text-xs mt-2 pl-2 border-l-2 border-sky-400/50 text-sky-700 dark:text-sky-400 leading-relaxed">
            🎧 {example.hint}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setHintRevealed(true)}
            className="text-xs mt-2 text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
          >
            💭 需要发音提示？
          </button>
        )
      )}
    </div>
  );
}

// ============ 渲染工具 ============

// 把每个词替换为同长度的 ██，保留标点与空格，给用户一些节奏线索
function renderMasked(text: string): string {
  return text.replace(/[A-Za-z']+/g, (w) => "█".repeat(Math.min(w.length, 12)));
}

// 简易高亮（大小写不敏感）
function renderHighlighted(text: string, word: string): React.ReactNode {
  if (!word) return text;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, "ig");
  const parts = text.split(re);
  const lowerWord = word.toLowerCase();
  return parts.map((p, i) =>
    p.toLowerCase() === lowerWord ? (
      <mark
        key={i}
        className="bg-sky-200/80 dark:bg-sky-700/50 rounded px-0.5 text-foreground"
      >
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
