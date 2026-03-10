"use client";

import type { Note } from "@/types";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";

const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  writing: { label: "写作", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  speaking: { label: "口语", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  reading: { label: "阅读", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  listening: { label: "听力", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  general: { label: "通用", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
};

interface NoteCardProps {
  note: Note;
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
  onView: (note: Note) => void;
}

export function NoteCard({ note, onEdit, onDelete, onView }: NoteCardProps) {
  const cat = CATEGORY_MAP[note.category] || CATEGORY_MAP.general;
  const tags: string[] = note.tags ? (() => { try { return JSON.parse(note.tags); } catch { return []; } })() : [];

  return (
    <div
      className="rounded-lg border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onView(note)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-medium text-sm line-clamp-1 flex-1">{note.title}</h3>
        <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(note)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => onDelete(note)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cat.color}`}>
          {cat.label}
        </span>
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs py-0">
            {tag}
          </Badge>
        ))}
      </div>

      <div className="text-sm text-muted-foreground line-clamp-4 overflow-hidden prose prose-sm dark:prose-invert max-w-none">
        <MarkdownRenderer content={note.content} />
      </div>

      <div className="mt-3 text-xs text-muted-foreground">
        {new Date(note.created_at).toLocaleDateString("zh-CN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </div>
    </div>
  );
}
