"use client";

import { useRef } from "react";
import type { Note } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { useToast } from "@/hooks/use-toast";
import { Copy, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  writing: { label: "写作", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  speaking: { label: "口语", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  reading: { label: "阅读", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  listening: { label: "听力", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  general: { label: "通用", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
};

interface NoteViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: Note;
  onEdit: (note: Note) => void;
}

export function NoteViewer({ open, onOpenChange, note, onEdit }: NoteViewerProps) {
  const { toast } = useToast();
  const contentRef = useRef<HTMLDivElement>(null);
  const cat = CATEGORY_MAP[note.category] || CATEGORY_MAP.general;
  const tags: string[] = note.tags ? (() => { try { return JSON.parse(note.tags); } catch { return []; } })() : [];

  const handleCopy = async () => {
    try {
      if (contentRef.current) {
        const html = contentRef.current.innerHTML;
        const blob = new Blob([html], { type: "text/html" });
        const textBlob = new Blob([note.content], { type: "text/plain" });
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": blob,
            "text/plain": textBlob,
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(note.content);
      }
      toast({ description: "已复制到剪贴板" });
    } catch {
      navigator.clipboard.writeText(note.content);
      toast({ description: "已复制到剪贴板" });
    }
  };

  const handleEdit = () => {
    onOpenChange(false);
    onEdit(note);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-semibold mb-2">{note.title}</DialogTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cat.color}`}>
                  {cat.label}
                </span>
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs py-0">
                    {tag}
                  </Badge>
                ))}
                <span className="text-xs text-muted-foreground">
                  {new Date(note.created_at).toLocaleDateString("zh-CN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleCopy} title="复制内容">
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleEdit} title="编辑">
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div ref={contentRef} className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer content={note.content} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
