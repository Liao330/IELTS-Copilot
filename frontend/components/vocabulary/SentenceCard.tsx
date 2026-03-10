"use client";

import type { FavoriteSentence } from "@/types";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  writing: { label: "写作", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  speaking: { label: "口语", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  reading: { label: "阅读", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  listening: { label: "听力", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  general: { label: "通用", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
};

interface SentenceCardProps {
  sentence: FavoriteSentence;
  onEdit: (sentence: FavoriteSentence) => void;
  onDelete: (sentence: FavoriteSentence) => void;
}

export function SentenceCard({ sentence, onEdit, onDelete }: SentenceCardProps) {
  const cat = CATEGORY_MAP[sentence.category] || CATEGORY_MAP.general;

  return (
    <div className="rounded-lg border bg-card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium leading-relaxed flex-1 italic">
          &ldquo;{sentence.content}&rdquo;
        </p>
        <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(sentence)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={() => onDelete(sentence)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {sentence.translation && (
        <p className="text-xs text-muted-foreground mb-2">{sentence.translation}</p>
      )}

      {sentence.note && (
        <p className="text-xs text-muted-foreground mb-2 bg-muted/50 rounded px-2 py-1">
          💡 {sentence.note}
        </p>
      )}

      <div className="flex items-center gap-2 mt-3">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cat.color}`}>
          {cat.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(sentence.created_at).toLocaleDateString("zh-CN")}
        </span>
      </div>
    </div>
  );
}
