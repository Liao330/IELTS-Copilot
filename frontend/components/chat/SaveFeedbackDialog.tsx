"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { Homework } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface SaveFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: string;
}

export function SaveFeedbackDialog({
  open,
  onOpenChange,
  content,
}: SaveFeedbackDialogProps) {
  const { toast } = useToast();
  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedHomeworkId, setSelectedHomeworkId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .getHomeworks()
      .then((list) => {
        setHomeworks(list);
        if (list.length > 0 && !selectedHomeworkId) {
          setSelectedHomeworkId(list[0].id);
        }
      })
      .catch(() => {
        toast({ variant: "destructive", description: "获取作业列表失败" });
      })
      .finally(() => setLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!selectedHomeworkId) {
      toast({ variant: "destructive", description: "请选择一个作业" });
      return;
    }

    setSaving(true);
    try {
      await api.addFeedback(selectedHomeworkId, {
        feedback_type: "teacher_text",
        content,
      });
      toast({ description: "已保存为作业反馈" });
      onOpenChange(false);
      setSelectedHomeworkId("");
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "保存失败",
      });
    } finally {
      setSaving(false);
    }
  };

  const CATEGORY_LABELS: Record<string, string> = {
    writing: "写作",
    speaking: "口语",
    reading: "阅读",
    listening: "听力",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>保存为作业反馈</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 flex-1 overflow-hidden flex flex-col">
          <div className="space-y-2">
            <Label>选择作业</Label>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载作业列表...
              </div>
            ) : homeworks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                暂无作业，请先创建作业
              </p>
            ) : (
              <Select value={selectedHomeworkId} onValueChange={setSelectedHomeworkId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择作业" />
                </SelectTrigger>
                <SelectContent>
                  {homeworks.map((hw) => (
                    <SelectItem key={hw.id} value={hw.id}>
                      <span className="flex items-center gap-2">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {CATEGORY_LABELS[hw.category] || hw.category}
                        </span>
                        <span className="truncate">{hw.title}</span>
                        <span className="text-xs text-muted-foreground">{hw.homework_date}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
          <Button
            onClick={handleSave}
            disabled={saving || !selectedHomeworkId || loading}
          >
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
