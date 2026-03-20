"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import type { FavoriteSentence } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SentenceEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sentence?: FavoriteSentence | null;
  initialContent?: string;
  initialTranslation?: string;
  onSaved: (sentence: FavoriteSentence) => void;
}

const CATEGORIES = [
  { value: "general", label: "通用" },
  { value: "writing", label: "写作" },
  { value: "speaking", label: "口语" },
  { value: "reading", label: "阅读" },
  { value: "listening", label: "听力" },
];

export function SentenceEditor({
  open,
  onOpenChange,
  sentence,
  initialContent,
  initialTranslation,
  onSaved,
}: SentenceEditorProps) {
  const { toast } = useToast();
  const isEdit = !!sentence;

  const [form, setForm] = useState({
    content: "",
    translation: "",
    note: "",
    category: "general",
  });
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [autoTranslateTriggered, setAutoTranslateTriggered] = useState(false);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    // 只在弹窗从关闭→打开时初始化表单，已打开时 props 变化不重置
    if (!open) {
      setAutoTranslateTriggered(false);
      return;
    }
    if (wasOpen) return; // 已打开状态，跳过重新初始化

    if (sentence) {
      setForm({
        content: sentence.content,
        translation: sentence.translation || "",
        note: sentence.note || "",
        category: sentence.category,
      });
      setAutoTranslateTriggered(false);
    } else {
      setForm({
        content: initialContent || "",
        translation: initialTranslation || "",
        note: "",
        category: "general",
      });
      // 有初始内容且无翻译时标记需要自动翻译
      setAutoTranslateTriggered(!!initialContent && !initialTranslation);
    }
  }, [open, sentence, initialContent, initialTranslation]);

  // 自动触发 AI 翻译
  useEffect(() => {
    if (autoTranslateTriggered && open && !sentence) {
      setAutoTranslateTriggered(false);
      handleAutoTranslate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTranslateTriggered, open]);

  const handleAutoTranslate = async () => {
    if (!form.content.trim()) {
      toast({ variant: "destructive", description: "请先输入句子" });
      return;
    }
    setTranslating(true);
    try {
      const result = await api.translateText(form.content.trim());
      setForm((prev) => ({
        ...prev,
        translation: result.meaning || prev.translation,
        note: result.note || prev.note,
      }));
      toast({ description: "✨ AI 已翻译" });
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "翻译失败",
      });
    } finally {
      setTranslating(false);
    }
  };

  const handleSave = async () => {
    if (!form.content.trim()) {
      toast({ variant: "destructive", description: "句子内容不能为空" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        content: form.content.trim(),
        translation: form.translation || undefined,
        note: form.note || undefined,
        category: form.category,
      };

      let saved: FavoriteSentence;
      if (isEdit) {
        saved = await api.updateSentence(sentence.id, payload);
        toast({ description: "佳句已更新" });
      } else {
        saved = await api.createSentence(payload);
        toast({ description: "✅ 已收藏佳句" });
      }
      onSaved(saved);
      onOpenChange(false);
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑佳句" : "收藏佳句"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>英文原句 *</Label>
            <Textarea
              placeholder="输入要收藏的英文句子"
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>中文翻译</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAutoTranslate}
                disabled={translating}
                className="h-6 text-xs gap-1"
              >
                {translating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                AI 翻译
              </Button>
            </div>
            <Textarea
              placeholder="中文翻译"
              value={form.translation}
              onChange={(e) => setForm((p) => ({ ...p, translation: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label>分类</Label>
            <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
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

          <div className="space-y-1.5">
            <Label>备注</Label>
            <Input
              placeholder="用法说明、记忆技巧等"
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : isEdit ? "更新" : "收藏"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
