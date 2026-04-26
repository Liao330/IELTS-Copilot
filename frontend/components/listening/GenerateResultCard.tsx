"use client";

import { useState } from "react";
import { Sparkles, BookmarkPlus, ChevronDown, ChevronUp, Check } from "lucide-react";
import type { ListeningGeneratedBlock, ListeningGeneratedExample } from "@/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PlayButton } from "./PlayButton";

interface Props {
  block: ListeningGeneratedBlock;
  defaultOpen?: boolean;
  /** 只读模式：隐藏"加入佳句"等交互按钮，用于 Demo 预览 */
  readOnly?: boolean;
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

export function GenerateResultCard({ block, defaultOpen = true, readOnly = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
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
}: {
  example: ListeningGeneratedExample;
  word: string;
  readOnly?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();
  const style = LEVEL_STYLES[example.difficulty_level] ?? LEVEL_STYLES[1];

  // 用浅色高亮包裹句中的目标词
  const highlighted = renderHighlighted(example.text, word);

  const handleSave = async () => {
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
      <p className="text-sm font-medium leading-relaxed">{highlighted}</p>
      <p className="text-xs text-muted-foreground mt-1">{example.translation}</p>
      {example.hint && (
        <p className="text-xs mt-2 pl-2 border-l-2 border-sky-400/50 text-sky-700 dark:text-sky-400 leading-relaxed">
          🎧 {example.hint}
        </p>
      )}
    </div>
  );
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
