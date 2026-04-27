"use client";

import type { VocabularyWord } from "@/types";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  writing: { label: "写作", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  speaking: { label: "口语", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  reading: { label: "阅读", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  listening: { label: "听力单词", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  general: { label: "通用", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
};

const MASTERY_MAP: Record<number, { label: string; color: string }> = {
  0: { label: "新词", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200" },
  1: { label: "模糊", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200" },
  2: { label: "认识", color: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200" },
  3: { label: "熟练", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200" },
};

interface WordCardProps {
  word: VocabularyWord;
  onEdit: (word: VocabularyWord) => void;
  onDelete: (word: VocabularyWord) => void;
}

export function WordCard({ word, onEdit, onDelete }: WordCardProps) {
  const cat = CATEGORY_MAP[word.category] || CATEGORY_MAP.general;
  const mastery = MASTERY_MAP[word.mastery_level] || MASTERY_MAP[0];
  const synonyms: string[] = word.synonyms
    ? (() => { try { return JSON.parse(word.synonyms); } catch { return []; } })()
    : [];

  return (
    <div className="rounded-lg border bg-card p-4 hover:shadow-md transition-shadow">
      {/* 头部：单词 + 操作 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-base">{word.word}</h3>
            {word.pos && (
              <span className="text-xs text-muted-foreground italic">{word.pos}</span>
            )}
          </div>
          {word.phonetic && (
            <span className="text-xs text-muted-foreground">{word.phonetic}</span>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(word)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={() => onDelete(word)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 释义 */}
      <p className="text-sm font-medium mb-2">{word.meaning}</p>

      {/* 例句 */}
      {word.example && (
        <div className="mb-2 text-xs space-y-0.5">
          <p className="text-muted-foreground italic leading-relaxed">{word.example}</p>
          {word.example_cn && (
            <p className="text-muted-foreground">{word.example_cn}</p>
          )}
        </div>
      )}

      {/* 同义词 */}
      {synonyms.length > 0 && (
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <span className="text-xs text-muted-foreground">同义词:</span>
          {synonyms.map((s) => (
            <Badge key={s} variant="outline" className="text-xs py-0 px-1.5">
              {s}
            </Badge>
          ))}
        </div>
      )}

      {/* 备注 */}
      {word.note && (
        <p className="text-xs text-muted-foreground mb-2 bg-muted/50 rounded px-2 py-1">
          💡 {word.note}
        </p>
      )}

      {/* 底部标签 */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cat.color}`}>
          {cat.label}
        </span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${mastery.color}`}>
          {mastery.label}
        </span>
        {word.review_count > 0 && (
          <span className="text-xs text-muted-foreground">
            复习{word.review_count}次
          </span>
        )}
      </div>
    </div>
  );
}
