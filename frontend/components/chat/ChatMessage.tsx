"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Message } from "@/types";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  User, Bot, Copy, FileText, Image, FileSpreadsheet,
  AlertTriangle, RefreshCw, Pencil, Check, X, BookmarkPlus, MessageSquareQuote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { SaveNoteDialog } from "./SaveNoteDialog";
import { SaveFeedbackDialog } from "./SaveFeedbackDialog";

interface Attachment {
  file_id: string;
  filename: string;
  mime_type: string;
}

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  onRetry?: () => void;
  isLastUserMessage?: boolean;
  onEdit?: (messageId: string, newContent: string) => void;
  conversationId?: string;
}

function getFileIcon(mimeType?: string) {
  if (!mimeType) return <FileText className="h-5 w-5 text-gray-500" />;
  if (mimeType.startsWith("image/")) return <Image className="h-5 w-5 text-blue-500" />;
  if (mimeType === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
  if (mimeType.includes("wordprocessingml")) return <FileSpreadsheet className="h-5 w-5 text-blue-600" />;
  return <FileText className="h-5 w-5 text-gray-500" />;
}

function getFileExtLabel(mimeType?: string) {
  if (!mimeType) return "FILE";
  if (mimeType.startsWith("image/jpeg")) return "JPG";
  if (mimeType.startsWith("image/png")) return "PNG";
  if (mimeType.startsWith("image/webp")) return "WEBP";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("wordprocessingml")) return "DOCX";
  if (mimeType === "text/plain") return "TXT";
  return "FILE";
}

function AttachmentCards({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {attachments.map((a) => (
        <div
          key={a.file_id}
          className="flex items-center gap-2.5 rounded-lg border bg-background/80 px-3 py-2.5 min-w-[160px] max-w-[240px] shadow-sm"
        >
          <div className="flex-shrink-0 w-9 h-9 rounded-md bg-muted flex items-center justify-center">
            {getFileIcon(a.mime_type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate text-foreground">{a.filename}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{getFileExtLabel(a.mime_type)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChatMessage({ message, isStreaming, onRetry, isLastUserMessage, onEdit, conversationId }: ChatMessageProps) {
  const { toast } = useToast();
  const isUser = message.role === "user";
  const isError = message.isError === true;

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [saveNoteOpen, setSaveNoteOpen] = useState(false);
  const [saveNoteContent, setSaveNoteContent] = useState("");
  const [saveFeedbackOpen, setSaveFeedbackOpen] = useState(false);
  const [saveFeedbackContent, setSaveFeedbackContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 框选保存浮动按钮
  const [selectionPopup, setSelectionPopup] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const popupRef = useRef<HTMLDivElement>(null);

  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleWidth, setBubbleWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.focus();
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
      // 光标移到末尾
      ta.selectionStart = ta.selectionEnd = ta.value.length;
    }
  }, [isEditing]);

  const contentRef = useRef<HTMLDivElement>(null);

  // 检测框选文本
  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !contentRef.current) {
      setSelectionPopup(null);
      setSelectedText("");
      return;
    }

    // 确认选区在当前消息的内容区域内
    const range = sel.getRangeAt(0);
    if (!contentRef.current.contains(range.commonAncestorContainer)) {
      setSelectionPopup(null);
      setSelectedText("");
      return;
    }

    const text = sel.toString().trim();
    if (!text) {
      setSelectionPopup(null);
      setSelectedText("");
      return;
    }

    // 计算浮动按钮位置（相对于 contentRef）
    const rangeRect = range.getBoundingClientRect();
    const containerRect = contentRef.current.getBoundingClientRect();
    setSelectionPopup({
      x: rangeRect.left - containerRect.left + rangeRect.width / 2,
      y: rangeRect.top - containerRect.top - 8,
    });
    setSelectedText(text);
  }, []);

  useEffect(() => {
    if (isUser || isError) return;
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [isUser, isError, handleSelectionChange]);

  // 点击浮动按钮外部时隐藏
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setSelectionPopup(null);
      }
    };
    if (selectionPopup) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [selectionPopup]);

  const handleSaveSelection = () => {
    setSaveNoteContent(selectedText);
    setSaveNoteOpen(true);
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleSaveFeedbackSelection = () => {
    setSaveFeedbackContent(selectedText);
    setSaveFeedbackOpen(true);
    setSelectionPopup(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleSaveFullMessage = () => {
    setSaveNoteContent(message.content);
    setSaveNoteOpen(true);
  };

  const handleSaveFullMessageAsFeedback = () => {
    setSaveFeedbackContent(message.content);
    setSaveFeedbackOpen(true);
  };

  const handleCopy = async () => {
    try {
      // 尝试复制富文本（HTML + 纯文本），粘贴到富文本编辑器时保持表格等格式
      if (!isUser && contentRef.current) {
        const html = contentRef.current.innerHTML;
        const blob = new Blob([html], { type: "text/html" });
        const textBlob = new Blob([message.content], { type: "text/plain" });
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": blob,
            "text/plain": textBlob,
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(message.content);
      }
      toast({ description: "已复制到剪贴板" });
    } catch {
      // fallback
      navigator.clipboard.writeText(message.content);
      toast({ description: "已复制到剪贴板" });
    }
  };

  const handleStartEdit = () => {
    // 记录当前气泡宽度，编辑时保持一致
    if (bubbleRef.current) {
      setBubbleWidth(bubbleRef.current.offsetWidth);
    }
    setEditContent(message.content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(message.content);
  };

  const handleConfirmEdit = () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === message.content) {
      setIsEditing(false);
      return;
    }
    setIsEditing(false);
    onEdit?.(message.id, trimmed);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleConfirmEdit();
    }
    if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  let attachments: Attachment[] = [];
  if (message.attachments) {
    try {
      attachments = JSON.parse(message.attachments);
    } catch {}
  }

  return (
    <div className={`flex gap-3 py-4 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? "bg-primary text-primary-foreground"
            : isError
            ? "bg-destructive/10 text-destructive"
            : "bg-muted"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : isError ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}>
        {/* 附件卡片放在气泡上方 */}
        {isUser && attachments.length > 0 && (
          <div className={`${isUser ? "flex justify-end" : ""}`}>
            <AttachmentCards attachments={attachments} />
          </div>
        )}
        {isUser && isEditing ? (
          <div className="inline-block text-left" style={bubbleWidth ? { width: bubbleWidth } : undefined}>
            <textarea
              ref={textareaRef}
              className="w-full bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/50 overflow-y-auto"
              value={editContent}
              onChange={(e) => {
                setEditContent(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              onKeyDown={handleEditKeyDown}
            />
            <div className="flex gap-1 justify-end mt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={handleCancelEdit}
              >
                <X className="h-3 w-3 mr-1" />
                取消
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={handleConfirmEdit}
              >
                <Check className="h-3 w-3 mr-1" />
                发送
              </Button>
            </div>
          </div>
        ) : (
        <div
          ref={isUser ? bubbleRef : undefined}
          className={`inline-block text-left rounded-lg px-4 py-2 max-w-full ${
            isUser
              ? "bg-primary text-primary-foreground"
              : isError
              ? "bg-destructive/10 border border-destructive/20"
              : "bg-muted/50"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
          ) : isError ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto relative" ref={contentRef}>
              <MarkdownRenderer content={message.content} />
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-foreground/60 animate-pulse ml-0.5" />
              )}
              {/* 框选浮动保存按钮 */}
              {selectionPopup && !isStreaming && (
                <div
                  ref={popupRef}
                  className="absolute z-50 -translate-x-1/2 -translate-y-full animate-in fade-in zoom-in-95 duration-150"
                  style={{ left: selectionPopup.x, top: selectionPopup.y }}
                >
                  <div className="flex gap-1 bg-background border rounded-full shadow-lg p-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3 text-xs rounded-full gap-1.5"
                      onClick={handleSaveSelection}
                    >
                      <BookmarkPlus className="h-3.5 w-3.5" />
                      保存为笔记
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3 text-xs rounded-full gap-1.5"
                      onClick={handleSaveFeedbackSelection}
                    >
                      <MessageSquareQuote className="h-3.5 w-3.5" />
                      保存为反馈
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}
        {/* 操作按钮区域 */}
        {isUser && !isEditing && !isStreaming && (
          <div className="mt-1 flex gap-1 justify-end">
            {message.content && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={handleCopy}
              >
                <Copy className="h-3 w-3 mr-1" />
                复制
              </Button>
            )}
            {isLastUserMessage && onEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={handleStartEdit}
              >
                <Pencil className="h-3 w-3 mr-1" />
                编辑
              </Button>
            )}
          </div>
        )}
        {!isUser && !isStreaming && (
          <div className="mt-1 flex gap-1">
            {isError && onRetry && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={onRetry}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                重新生成
              </Button>
            )}
            {message.content && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={handleCopy}
              >
                <Copy className="h-3 w-3 mr-1" />
                复制
              </Button>
            )}
            {!isError && message.content && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={handleSaveFullMessage}
              >
                <BookmarkPlus className="h-3 w-3 mr-1" />
                保存为笔记
              </Button>
            )}
            {!isError && message.content && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={handleSaveFullMessageAsFeedback}
              >
                <MessageSquareQuote className="h-3 w-3 mr-1" />
                保存为反馈
              </Button>
            )}
          </div>
        )}
        {saveNoteOpen && (
          <SaveNoteDialog
            open={saveNoteOpen}
            onOpenChange={setSaveNoteOpen}
            content={saveNoteContent}
            conversationId={conversationId}
            messageId={message.id}
          />
        )}
        {saveFeedbackOpen && (
          <SaveFeedbackDialog
            open={saveFeedbackOpen}
            onOpenChange={setSaveFeedbackOpen}
            content={saveFeedbackContent}
          />
        )}
      </div>
    </div>
  );
}
