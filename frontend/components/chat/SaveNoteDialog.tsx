"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES = [
  { value: "writing", label: "写作" },
  { value: "speaking", label: "口语" },
  { value: "reading", label: "阅读" },
  { value: "listening", label: "听力" },
  { value: "general", label: "通用" },
] as const;

interface SaveNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: string;
  conversationId?: string;
  messageId?: string;
}

export function SaveNoteDialog({
  open,
  onOpenChange,
  content,
  conversationId,
  messageId,
}: SaveNoteDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("general");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast({ variant: "destructive", description: "请输入笔记标题" });
      return;
    }

    setSaving(true);
    try {
      await api.createNote({
        title: trimmedTitle,
        content,
        category,
        source_conversation_id: conversationId,
        source_message_id: messageId,
      });
      toast({ description: "笔记保存成功" });
      onOpenChange(false);
      setTitle("");
      setCategory("general");
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "保存失败",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>保存为笔记</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 flex-1 overflow-hidden flex flex-col">
          <div className="space-y-2">
            <Label htmlFor="note-title">标题</Label>
            <Input
              id="note-title"
              placeholder="输入笔记标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>分类</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
            <Label>内容预览</Label>
            <div className="flex-1 overflow-y-auto rounded-md border bg-muted/50 p-3 prose prose-sm dark:prose-invert max-w-none">
              <MarkdownRenderer content={content} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
