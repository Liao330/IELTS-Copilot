"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { VocabularyWord, TranslateResult } from "@/types";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WordEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  word?: VocabularyWord | null; // null = 新建模式
  initialWord?: string; // 初始单词文本（从翻译浮窗带过来）
  initialData?: TranslateResult | null; // 翻译结果预填
  onSaved: (word: VocabularyWord) => void;
}

const CATEGORIES = [
  { value: "general", label: "通用" },
  { value: "writing", label: "写作" },
  { value: "speaking", label: "口语" },
  { value: "reading", label: "阅读" },
  { value: "listening", label: "听力" },
];

export function WordEditor({ open, onOpenChange, word, initialWord, initialData, onSaved }: WordEditorProps) {
  const { toast } = useToast();
  const isEdit = !!word;

  const [form, setForm] = useState({
    word: "",
    phonetic: "",
    pos: "",
    meaning: "",
    example: "",
    example_cn: "",
    synonyms: "",
    note: "",
    category: "general",
  });
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);

  const [autoFillTriggered, setAutoFillTriggered] = useState(false);

  useEffect(() => {
    if (open) {
      if (word) {
        // 编辑模式
        const syns = word.synonyms
          ? (() => { try { return JSON.parse(word.synonyms).join(", "); } catch { return ""; } })()
          : "";
        setForm({
          word: word.word,
          phonetic: word.phonetic || "",
          pos: word.pos || "",
          meaning: word.meaning,
          example: word.example || "",
          example_cn: word.example_cn || "",
          synonyms: syns,
          note: word.note || "",
          category: word.category,
        });
        setAutoFillTriggered(false);
      } else if (initialData) {
        // 从翻译结果预填
        setForm({
          word: initialData.word || initialWord || "",
          phonetic: initialData.phonetic || "",
          pos: initialData.pos || "",
          meaning: initialData.meaning || "",
          example: initialData.example || "",
          example_cn: initialData.example_cn || "",
          synonyms: initialData.synonyms?.join(", ") || "",
          note: initialData.note || "",
          category: "general",
        });
        setAutoFillTriggered(false);
      } else {
        // 新建模式
        setForm({
          word: initialWord || "",
          phonetic: "",
          pos: "",
          meaning: "",
          example: "",
          example_cn: "",
          synonyms: "",
          note: "",
          category: "general",
        });
        // 有初始单词时标记需要自动查词
        setAutoFillTriggered(!!initialWord);
      }
    } else {
      setAutoFillTriggered(false);
    }
  }, [open, word, initialWord, initialData]);

  // 自动触发 AI 查词
  useEffect(() => {
    if (autoFillTriggered && open && !word && !initialData) {
      setAutoFillTriggered(false);
      handleAutoFill();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFillTriggered, open]);

  const handleAutoFill = async () => {
    if (!form.word.trim()) {
      toast({ variant: "destructive", description: "请先输入单词" });
      return;
    }
    setTranslating(true);
    try {
      const result = await api.translateText(form.word.trim());
      setForm((prev) => ({
        ...prev,
        word: result.word || prev.word,
        phonetic: result.phonetic || prev.phonetic,
        pos: result.pos || prev.pos,
        meaning: result.meaning || prev.meaning,
        example: result.example || prev.example,
        example_cn: result.example_cn || prev.example_cn,
        synonyms: result.synonyms?.join(", ") || prev.synonyms,
        note: result.note || prev.note,
      }));
      toast({ description: "✨ AI 已自动填充" });
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "AI 查词失败",
      });
    } finally {
      setTranslating(false);
    }
  };

  const handleSave = async () => {
    if (!form.word.trim() || !form.meaning.trim()) {
      toast({ variant: "destructive", description: "单词和释义不能为空" });
      return;
    }

    setSaving(true);
    try {
      const synonymsArr = form.synonyms
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        word: form.word.trim(),
        phonetic: form.phonetic || undefined,
        pos: form.pos || undefined,
        meaning: form.meaning.trim(),
        example: form.example || undefined,
        example_cn: form.example_cn || undefined,
        synonyms: synonymsArr.length > 0 ? synonymsArr : undefined,
        note: form.note || undefined,
        category: form.category,
      };

      let saved: VocabularyWord;
      if (isEdit) {
        saved = await api.updateWord(word.id, payload);
        toast({ description: "单词已更新" });
      } else {
        saved = await api.createWord(payload);
        toast({ description: "✅ 已添加到单词本" });
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑单词" : "添加单词"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 单词 + AI 查词按钮 */}
          <div className="space-y-1.5">
            <Label>单词/短语 *</Label>
            <div className="flex gap-2">
              <Input
                placeholder="输入英文单词或短语"
                value={form.word}
                onChange={(e) => setForm((p) => ({ ...p, word: e.target.value }))}
              />
              {!isEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoFill}
                  disabled={translating}
                  className="flex-shrink-0 gap-1"
                >
                  {translating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  AI 查词
                </Button>
              )}
            </div>
          </div>

          {/* 音标 + 词性 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>音标</Label>
              <Input
                placeholder="/ɪɡˈzæm.pəl/"
                value={form.phonetic}
                onChange={(e) => setForm((p) => ({ ...p, phonetic: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>词性</Label>
              <Input
                placeholder="n./v./adj."
                value={form.pos}
                onChange={(e) => setForm((p) => ({ ...p, pos: e.target.value }))}
              />
            </div>
          </div>

          {/* 释义 */}
          <div className="space-y-1.5">
            <Label>中文释义 *</Label>
            <Input
              placeholder="简洁的中文释义"
              value={form.meaning}
              onChange={(e) => setForm((p) => ({ ...p, meaning: e.target.value }))}
            />
          </div>

          {/* 例句 */}
          <div className="space-y-1.5">
            <Label>英文例句</Label>
            <Textarea
              placeholder="一个雅思场景的英文例句"
              value={form.example}
              onChange={(e) => setForm((p) => ({ ...p, example: e.target.value }))}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>例句翻译</Label>
            <Input
              placeholder="例句的中文翻译"
              value={form.example_cn}
              onChange={(e) => setForm((p) => ({ ...p, example_cn: e.target.value }))}
            />
          </div>

          {/* 同义词 */}
          <div className="space-y-1.5">
            <Label>同义词</Label>
            <Input
              placeholder="用逗号分隔，如: prevalent, pervasive"
              value={form.synonyms}
              onChange={(e) => setForm((p) => ({ ...p, synonyms: e.target.value }))}
            />
          </div>

          {/* 分类 */}
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

          {/* 备注 */}
          <div className="space-y-1.5">
            <Label>备注</Label>
            <Textarea
              placeholder="个人记忆技巧、用法提示等"
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : isEdit ? "更新" : "添加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
