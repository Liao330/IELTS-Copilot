"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Send, X, Loader2, Square } from "lucide-react";
import { api } from "@/lib/api";
import type { FileUploadResponse } from "@/types";
import { useToast } from "@/hooks/use-toast";

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];
const MAX_FILES = 5;
const MAX_SIZE = 10 * 1024 * 1024;

interface ChatInputProps {
  onSend: (content: string, attachments?: string[]) => void;
  onStop?: () => void;
  disabled?: boolean;
  conversationId?: string;
  isStreaming?: boolean;
}

const DRAFT_PREFIX = "ielts_draft_";

export function ChatInput({ onSend, onStop, disabled, conversationId, isStreaming }: ChatInputProps) {
  const draftKey = conversationId ? `${DRAFT_PREFIX}${conversationId}` : null;
  const [content, setContent] = useState(() => {
    if (typeof window !== "undefined" && draftKey) {
      return localStorage.getItem(draftKey) || "";
    }
    return "";
  });
  const [files, setFiles] = useState<FileUploadResponse[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

  // Auto-save draft to localStorage
  useEffect(() => {
    if (!draftKey) return;
    const timer = setTimeout(() => {
      if (content.trim()) {
        localStorage.setItem(draftKey, content);
      } else {
        localStorage.removeItem(draftKey);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [content, draftKey]);

  // Load draft when conversationId changes
  useEffect(() => {
    if (draftKey) {
      setContent(localStorage.getItem(draftKey) || "");
    }
  }, [draftKey]);

  const handleSend = () => {
    if (!content.trim() && files.length === 0) return;
    const attachmentIds = files.map((f) => f.id);
    onSend(content.trim(), attachmentIds.length > 0 ? attachmentIds : undefined);
    setContent("");
    setFiles([]);
    if (draftKey) localStorage.removeItem(draftKey);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const uploadFiles = useCallback(async (fileList: File[]) => {
    if (fileList.length === 0) return;

    setUploading(true);
    try {
      for (const file of fileList) {
        const currentCount = await new Promise<number>((resolve) =>
          setFiles((prev) => { resolve(prev.length); return prev; })
        );
        if (currentCount >= MAX_FILES) {
          toast({ variant: "destructive", description: "最多上传 5 个附件" });
          break;
        }
        if (file.size > MAX_SIZE) {
          toast({ variant: "destructive", description: `${file.name} 超过 10MB 限制` });
          continue;
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
          toast({ variant: "destructive", description: `${file.name} 不支持该文件类型` });
          continue;
        }
        const result = await api.uploadFile(file);
        setFiles((prev) => [...prev, result]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "上传失败";
      toast({ variant: "destructive", description: message });
    } finally {
      setUploading(false);
    }
  }, [toast]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;
    await uploadFiles(Array.from(selectedFiles));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const pastedFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) pastedFiles.push(file);
      }
    }

    if (pastedFiles.length > 0) {
      e.preventDefault();
      await uploadFiles(pastedFiles);
    }
  }, [uploadFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      await uploadFiles(droppedFiles);
    }
  }, [uploadFiles]);

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  return (
    <div
      className={`border-t bg-background p-4 transition-colors ${
        dragOver ? "bg-primary/5 border-t-primary" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="flex items-center justify-center py-3 mb-2 border-2 border-dashed border-primary/40 rounded-lg text-sm text-muted-foreground">
          松开鼠标上传文件
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-1 bg-muted rounded-md px-2 py-1 text-xs"
            >
              <span>📎 {f.filename}</span>
              <button onClick={() => removeFile(f.id)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.txt"
          onChange={handleFileUpload}
        />
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Paperclip className="h-5 w-5" />
          )}
        </Button>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="输入消息... (可粘贴文件，Shift+Enter 换行)"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-y-auto"
          style={{ minHeight: "42px", maxHeight: "200px" }}
          disabled={disabled && !isStreaming}
          rows={1}
        />
        {isStreaming ? (
          <Button
            onClick={onStop}
            size="icon"
            variant="destructive"
            className="flex-shrink-0"
            title="停止生成"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSend}
            disabled={disabled || (!content.trim() && files.length === 0)}
            size="icon"
            className="flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
