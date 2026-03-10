"use client";

import { useState, useRef, DragEvent } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, X } from "lucide-react";

const CATEGORIES = [
  { value: "writing", label: "写作" },
  { value: "speaking", label: "口语" },
  { value: "reading", label: "阅读" },
  { value: "listening", label: "听力" },
] as const;

const FILE_ACCEPT: Record<string, string> = {
  writing: ".doc,.docx,.pdf,.txt,.md,.jpg,.jpeg,.png,.webp,audio/*,video/*,.mp3,.m4a,.wav,.ogg,.mp4,.mov,.webm",
  speaking: "audio/*,video/*,.mp3,.m4a,.wav,.ogg,.mp4,.mov,.webm,.doc,.docx,.pdf,.txt,.md,.jpg,.jpeg,.png,.webp",
  reading: ".doc,.docx,.pdf,.txt,.md,.jpg,.jpeg,.png,.webp,audio/*,video/*,.mp3,.m4a,.wav,.ogg,.mp4,.mov,.webm",
  listening: "audio/*,.mp3,.m4a,.wav,.ogg,.doc,.docx,.pdf,.txt,.md,.jpg,.jpeg,.png,.webp",
};

const FILE_HINT: Record<string, string> = {
  writing: "上传作业文件（支持文档/图片/音视频）",
  speaking: "上传作业文件（支持音视频/文档/图片）",
  reading: "上传作业文件（支持文档/图片/音视频）",
  listening: "上传作业文件（支持音频/文档/图片）",
};

interface CreateHomeworkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateHomeworkDialog({ open, onOpenChange, onCreated }: CreateHomeworkDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("writing");
  const [homeworkDate, setHomeworkDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) setFiles((prev) => [...prev, ...droppedFiles]);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ variant: "destructive", description: "请输入作业标题" });
      return;
    }

    setSaving(true);
    try {
      const fileIds: string[] = [];
      for (const f of files) {
        const uploaded = await api.uploadFile(f);
        fileIds.push(uploaded.id);
      }

      await api.createHomework({
        title: title.trim(),
        category,
        homework_date: homeworkDate,
        description: description.trim() || undefined,
        file_ids: fileIds.length > 0 ? fileIds : undefined,
      });

      toast({ description: "作业添加成功" });
      setTitle("");
      setCategory("writing");
      setHomeworkDate(new Date().toISOString().slice(0, 10));
      setDescription("");
      setFiles([]);
      onCreated();
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "添加失败" });
    } finally {
      setSaving(false);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加作业</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="hw-title">标题</Label>
            <Input id="hw-title" placeholder="例如：大作文-教育话题" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>科目</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hw-date">日期</Label>
              <Input id="hw-date" type="date" value={homeworkDate} onChange={(e) => setHomeworkDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hw-desc">备注（可选）</Label>
            <Textarea id="hw-desc" placeholder="简要描述作业内容..." value={description} onChange={(e) => setDescription(e.target.value)} className="resize-none h-20" />
          </div>
          <div className="space-y-2">
            <Label>作业文件（可选，支持多个）</Label>
            {files.length > 0 && (
              <div className="space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    <span className="truncate flex-1">{f.name}</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeFile(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-4 cursor-pointer transition-colors text-sm text-muted-foreground ${
                dragOver ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <Upload className="h-4 w-4" />
              <span>{FILE_HINT[category] || "上传作业文件"}</span>
              <span className="text-xs">点击选择或拖拽文件到此处</span>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept={FILE_ACCEPT[category] || ""}
                onChange={(e) => {
                  const newFiles = Array.from(e.target.files || []);
                  if (newFiles.length > 0) setFiles((prev) => [...prev, ...newFiles]);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
