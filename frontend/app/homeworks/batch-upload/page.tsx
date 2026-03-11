"use client";

import { useState, useRef, useCallback, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { FileUploadResponse } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Upload,
  X,
  FileText,
  Mic,
  BookOpen,
  Headphones,
  Settings2,
  Check,
  Trash2,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FolderUp,
  Rocket,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// Types
// ============================================================

interface UploadedFileItem {
  /** 唯一 ID（前端临时生成） */
  id: string;
  /** 原始 File 对象 */
  localFile: File;
  /** 上传状态 */
  uploadStatus: "pending" | "uploading" | "success" | "error";
  /** 上传后服务端返回的信息 */
  serverFile?: FileUploadResponse;
  /** 上传错误信息 */
  errorMessage?: string;
  /** 作业配置信息 */
  config: FileConfig;
  /** 作业是否已创建 */
  homeworkCreated: boolean;
}

interface FileConfig {
  title: string;
  category: "writing" | "speaking" | "reading" | "listening";
  homework_date: string;
  description: string;
}

// ============================================================
// Constants
// ============================================================

const CATEGORIES = [
  { value: "writing", label: "写作", icon: FileText },
  { value: "speaking", label: "口语", icon: Mic },
  { value: "reading", label: "阅读", icon: BookOpen },
  { value: "listening", label: "听力", icon: Headphones },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  writing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  speaking: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  reading: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  listening: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const CATEGORY_LABELS: Record<string, string> = {
  writing: "写作",
  speaking: "口语",
  reading: "阅读",
  listening: "听力",
};

const FILE_TYPE_ICONS: Record<string, string> = {
  "application/pdf": "📄",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "📝",
  "application/msword": "📝",
  "text/plain": "📃",
  "text/markdown": "📃",
};

function getFileIcon(file: File): string {
  if (file.type.startsWith("image/")) return "🖼️";
  if (file.type.startsWith("audio/")) return "🎵";
  if (file.type.startsWith("video/")) return "🎬";
  return FILE_TYPE_ICONS[file.type] || "📎";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function guessCategory(filename: string): "writing" | "speaking" | "reading" | "listening" {
  const lower = filename.toLowerCase();
  if (/writ|作文|essay|大作文|小作文|写作/.test(lower)) return "writing";
  if (/speak|口语|part[123]|speaking/.test(lower)) return "speaking";
  if (/read|阅读|passage|reading/.test(lower)) return "reading";
  if (/listen|听力|listening/.test(lower)) return "listening";
  // 根据文件类型猜
  if (/\.(mp3|m4a|wav|ogg|flac)$/i.test(lower)) return "listening";
  if (/\.(mp4|mov|webm|avi)$/i.test(lower)) return "speaking";
  return "writing"; // 默认
}

function getFileTitle(filename: string): string {
  // 去掉扩展名
  return filename.replace(/\.[^.]+$/, "").trim();
}

let _idCounter = 0;
function generateId(): string {
  return `bf-${Date.now()}-${++_idCounter}`;
}

// ============================================================
// Main Page Component
// ============================================================

export default function BatchUploadPage() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  // 阶段：select = 选文件阶段，manage = 管理状态页
  const [phase, setPhase] = useState<"select" | "manage">("select");
  const [items, setItems] = useState<UploadedFileItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [configItem, setConfigItem] = useState<UploadedFileItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  // ---- 全局默认配置 ----
  const [defaultCategory, setDefaultCategory] = useState<"writing" | "speaking" | "reading" | "listening">("writing");
  const [defaultDate, setDefaultDate] = useState(new Date().toISOString().slice(0, 10));

  // ---- 添加文件 ----
  const addFiles = useCallback(
    (fileList: File[]) => {
      const newItems: UploadedFileItem[] = fileList.map((f) => ({
        id: generateId(),
        localFile: f,
        uploadStatus: "pending" as const,
        config: {
          title: getFileTitle(f.name),
          category: guessCategory(f.name),
          homework_date: defaultDate,
          description: "",
        },
        homeworkCreated: false,
      }));
      setItems((prev) => [...prev, ...newItems]);
    },
    [defaultDate]
  );

  // ---- 拖拽处理 ----
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) addFiles(droppedFiles);
  };

  // ---- 上传所有 pending 文件 ----
  const handleUploadAll = async () => {
    const pendingItems = items.filter((it) => it.uploadStatus === "pending" || it.uploadStatus === "error");
    if (pendingItems.length === 0) {
      toast({ description: "没有需要上传的文件" });
      return;
    }

    setIsUploading(true);

    for (const item of pendingItems) {
      // 设为 uploading
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, uploadStatus: "uploading" as const, errorMessage: undefined } : it
        )
      );

      try {
        const serverFile = await api.uploadFile(item.localFile);
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, uploadStatus: "success" as const, serverFile } : it
          )
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, uploadStatus: "error" as const, errorMessage: err instanceof Error ? err.message : "上传失败" }
              : it
          )
        );
      }
    }

    setIsUploading(false);
    setPhase("manage");
  };

  // ---- 删除文件 ----
  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setDeleteItemId(null);
  };

  // ---- 更新配置 ----
  const updateItemConfig = (id: string, config: FileConfig) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, config } : it))
    );
  };

  // ---- 应用默认配置到所有未创建的 ----
  const applyDefaultsToAll = () => {
    setItems((prev) =>
      prev.map((it) =>
        it.homeworkCreated
          ? it
          : {
              ...it,
              config: {
                ...it.config,
                category: defaultCategory,
                homework_date: defaultDate,
              },
            }
      )
    );
    toast({ description: "已应用默认科目和日期到所有文件" });
  };

  // ---- 批量创建作业 ----
  const handleCreateAll = async () => {
    const readyItems = items.filter(
      (it) => it.uploadStatus === "success" && !it.homeworkCreated && it.serverFile
    );

    if (readyItems.length === 0) {
      toast({ description: "没有可创建的作业" });
      return;
    }

    // 检查所有文件是否都配置了标题
    const untitled = readyItems.filter((it) => !it.config.title.trim());
    if (untitled.length > 0) {
      toast({
        variant: "destructive",
        description: `有 ${untitled.length} 个文件未配置标题，请先完善配置`,
      });
      return;
    }

    setIsCreating(true);
    let successCount = 0;
    let failCount = 0;

    for (const item of readyItems) {
      try {
        await api.createHomework({
          title: item.config.title.trim(),
          category: item.config.category,
          homework_date: item.config.homework_date,
          description: item.config.description.trim() || undefined,
          file_ids: [item.serverFile!.id],
        });
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, homeworkCreated: true } : it))
        );
        successCount++;
      } catch {
        failCount++;
      }
    }

    setIsCreating(false);

    if (failCount === 0) {
      toast({ description: `🎉 成功创建 ${successCount} 份作业` });
    } else {
      toast({
        variant: "destructive",
        description: `创建完成：${successCount} 成功，${failCount} 失败`,
      });
    }
  };

  // ---- 统计 ----
  const totalCount = items.length;
  const uploadedCount = items.filter((it) => it.uploadStatus === "success").length;
  const errorCount = items.filter((it) => it.uploadStatus === "error").length;
  const createdCount = items.filter((it) => it.homeworkCreated).length;
  const pendingCreateCount = items.filter(
    (it) => it.uploadStatus === "success" && !it.homeworkCreated
  ).length;
  const allCreated = createdCount === totalCount && totalCount > 0;

  // ============================================================
  // RENDER: 选文件阶段
  // ============================================================
  if (phase === "select") {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="container mx-auto px-4 h-14 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push("/homeworks")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold flex items-center gap-2">📦 批量上传作业</h1>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-3xl">
          {/* 全局默认设置 */}
          <div className="rounded-lg border bg-card p-4 mb-6">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              默认配置（可后续逐个修改）
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">默认科目</Label>
                <Select value={defaultCategory} onValueChange={(v) => setDefaultCategory(v as typeof defaultCategory)}>
                  <SelectTrigger className="h-9">
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
                <Label className="text-xs">默认日期</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={defaultDate}
                  onChange={(e) => setDefaultDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* 拖拽上传区 */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 cursor-pointer transition-all ${
              dragOver
                ? "border-primary bg-primary/5 scale-[1.02]"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <div className={`rounded-full p-4 ${dragOver ? "bg-primary/10" : "bg-muted"}`}>
              <FolderUp className={`h-10 w-10 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div className="text-center">
              <p className="font-medium text-base">拖拽文件到此处，或点击选择</p>
              <p className="text-sm text-muted-foreground mt-1">
                支持文档、图片、音频、视频，可一次选择多个文件
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".doc,.docx,.pdf,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.bmp,.mp3,.m4a,.wav,.ogg,.flac,.mp4,.mov,.webm,.avi,audio/*,video/*,image/*"
              onChange={(e) => {
                const selected = Array.from(e.target.files || []);
                if (selected.length > 0) addFiles(selected);
                e.target.value = "";
              }}
            />
          </div>

          {/* 已选文件列表 */}
          {items.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">
                  已选择 <span className="text-primary">{items.length}</span> 个文件
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-destructive hover:text-destructive"
                  onClick={() => setItems([])}
                >
                  清空
                </Button>
              </div>
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto rounded-lg border p-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-lg">{getFileIcon(item.localFile)}</span>
                    <span className="truncate flex-1 font-medium">{item.localFile.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatFileSize(item.localFile.size)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 ${CATEGORY_COLORS[item.config.category]}`}
                    >
                      {CATEGORY_LABELS[item.config.category]}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteItem(item.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex gap-3">
                <Button
                  className="flex-1 h-11 text-base gap-2"
                  onClick={handleUploadAll}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      上传中...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      上传全部（{items.length} 个文件）
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ============================================================
  // RENDER: 管理状态页
  // ============================================================
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setPhase("select")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">📦 批量上传 — 文件管理</h1>
          <div className="flex-1" />
          {allCreated && (
            <Button size="sm" onClick={() => router.push("/homeworks")}>
              返回作业库
            </Button>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* 状态概览 */}
        <div className="rounded-lg border bg-card p-4 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 text-sm">
              <span>
                总计 <span className="font-bold text-primary">{totalCount}</span> 个文件
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                已上传 {uploadedCount}
              </span>
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" />
                  失败 {errorCount}
                </span>
              )}
              {createdCount > 0 && (
                <span className="flex items-center gap-1 text-green-600">
                  <Check className="h-3.5 w-3.5" />
                  已建作业 {createdCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => addMoreInputRef.current?.click()}
              >
                <Plus className="h-3.5 w-3.5" />
                添加更多
              </Button>
              <input
                ref={addMoreInputRef}
                type="file"
                className="hidden"
                multiple
                accept=".doc,.docx,.pdf,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.bmp,.mp3,.m4a,.wav,.ogg,.flac,.mp4,.mov,.webm,.avi,audio/*,video/*,image/*"
                onChange={(e) => {
                  const selected = Array.from(e.target.files || []);
                  if (selected.length > 0) {
                    addFiles(selected);
                    // 新加的文件需要上传
                  }
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </div>

        {/* 全局操作栏 */}
        <div className="rounded-lg border bg-card p-4 mb-6">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            批量配置
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">科目</Label>
              <Select
                value={defaultCategory}
                onValueChange={(v) => setDefaultCategory(v as typeof defaultCategory)}
              >
                <SelectTrigger className="h-9">
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
              <Label className="text-xs">日期</Label>
              <Input
                type="date"
                className="h-9"
                value={defaultDate}
                onChange={(e) => setDefaultDate(e.target.value)}
              />
            </div>
            <div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 w-full"
                onClick={applyDefaultsToAll}
              >
                <Check className="h-3.5 w-3.5" />
                应用到全部
              </Button>
            </div>
          </div>
        </div>

        {/* 文件列表 */}
        <div className="space-y-2">
          {items.map((item) => {
            const isConfigured = item.config.title.trim().length > 0;
            return (
              <div
                key={item.id}
                className={`rounded-lg border bg-card p-4 transition-all ${
                  item.homeworkCreated
                    ? "opacity-60 border-green-200 dark:border-green-800"
                    : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* 状态图标 */}
                  <div className="flex-shrink-0 mt-0.5">
                    {item.uploadStatus === "uploading" && (
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    )}
                    {item.uploadStatus === "success" && !item.homeworkCreated && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                    {item.uploadStatus === "error" && (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    )}
                    {item.uploadStatus === "pending" && (
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    )}
                    {item.homeworkCreated && (
                      <Check className="h-5 w-5 text-green-600" />
                    )}
                  </div>

                  {/* 文件信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{getFileIcon(item.localFile)}</span>
                      <span className="font-medium text-sm truncate">
                        {item.localFile.name}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatFileSize(item.localFile.size)}
                      </span>
                    </div>

                    {/* 配置预览 */}
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${CATEGORY_COLORS[item.config.category]}`}
                      >
                        {CATEGORY_LABELS[item.config.category]}
                      </Badge>
                      <span className="text-muted-foreground">
                        {item.config.homework_date}
                      </span>
                      {item.config.title && (
                        <span className="text-muted-foreground truncate max-w-[200px]">
                          「{item.config.title}」
                        </span>
                      )}
                      {item.homeworkCreated && (
                        <Badge variant="default" className="bg-green-600 text-[10px]">
                          ✓ 已创建
                        </Badge>
                      )}
                    </div>

                    {/* 错误信息 */}
                    {item.uploadStatus === "error" && item.errorMessage && (
                      <p className="text-xs text-destructive mt-1">{item.errorMessage}</p>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {item.uploadStatus === "error" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-primary"
                        title="重新上传"
                        onClick={async () => {
                          setItems((prev) =>
                            prev.map((it) =>
                              it.id === item.id
                                ? { ...it, uploadStatus: "uploading" as const, errorMessage: undefined }
                                : it
                            )
                          );
                          try {
                            const serverFile = await api.uploadFile(item.localFile);
                            setItems((prev) =>
                              prev.map((it) =>
                                it.id === item.id
                                  ? { ...it, uploadStatus: "success" as const, serverFile }
                                  : it
                              )
                            );
                          } catch (err) {
                            setItems((prev) =>
                              prev.map((it) =>
                                it.id === item.id
                                  ? {
                                      ...it,
                                      uploadStatus: "error" as const,
                                      errorMessage: err instanceof Error ? err.message : "上传失败",
                                    }
                                  : it
                              )
                            );
                          }
                        }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {!item.homeworkCreated && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-8 w-8 p-0 ${isConfigured ? "text-primary" : "text-amber-500"}`}
                        title="配置作业信息"
                        onClick={() => setConfigItem(item)}
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    )}
                    {!item.homeworkCreated && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        title="删除"
                        onClick={() => setDeleteItemId(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 新加的 pending 文件上传 */}
        {items.some((it) => it.uploadStatus === "pending") && (
          <div className="mt-4">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleUploadAll}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  上传中...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  上传待上传文件 ({items.filter((it) => it.uploadStatus === "pending").length} 个)
                </>
              )}
            </Button>
          </div>
        )}

        {/* 底部操作区 */}
        {pendingCreateCount > 0 && (
          <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t mt-6 -mx-4 px-4 py-4">
            <Button
              className="w-full h-12 text-base gap-2"
              onClick={handleCreateAll}
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  创建中...
                </>
              ) : (
                <>
                  <Rocket className="h-5 w-5" />
                  一键创建 {pendingCreateCount} 份作业
                </>
              )}
            </Button>
          </div>
        )}

        {allCreated && (
          <div className="mt-8 text-center space-y-3">
            <div className="text-4xl">🎉</div>
            <p className="text-lg font-semibold">全部作业创建完成！</p>
            <p className="text-sm text-muted-foreground">
              共 {createdCount} 份作业已添加到作业库
            </p>
            <Button onClick={() => router.push("/homeworks")} className="gap-2">
              <BookOpen className="h-4 w-4" />
              返回作业库查看
            </Button>
          </div>
        )}
      </main>

      {/* ---- 配置悬浮窗 ---- */}
      {configItem && (
        <ConfigDialog
          item={configItem}
          onClose={() => setConfigItem(null)}
          onSave={(config) => {
            updateItemConfig(configItem.id, config);
            setConfigItem(null);
          }}
        />
      )}

      {/* ---- 删除确认 ---- */}
      <AlertDialog
        open={!!deleteItemId}
        onOpenChange={(open) => {
          if (!open) setDeleteItemId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要从列表中移除此文件吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItemId && handleDeleteItem(deleteItemId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Config Dialog Component (悬浮窗)
// ============================================================

function ConfigDialog({
  item,
  onClose,
  onSave,
}: {
  item: UploadedFileItem;
  onClose: () => void;
  onSave: (config: FileConfig) => void;
}) {
  const [title, setTitle] = useState(item.config.title);
  const [category, setCategory] = useState<string>(item.config.category);
  const [homeworkDate, setHomeworkDate] = useState(item.config.homework_date);
  const [description, setDescription] = useState(item.config.description);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            配置作业信息
          </DialogTitle>
        </DialogHeader>

        {/* 文件预览 */}
        <div className="flex items-center gap-2 rounded-md bg-muted/50 p-3 text-sm">
          <span className="text-lg">{getFileIcon(item.localFile)}</span>
          <span className="truncate font-medium">{item.localFile.name}</span>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {formatFileSize(item.localFile.size)}
          </span>
        </div>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="config-title">作业标题</Label>
            <Input
              id="config-title"
              placeholder="例如：大作文-教育话题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>科目</Label>
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
            <div className="space-y-2">
              <Label htmlFor="config-date">日期</Label>
              <Input
                id="config-date"
                type="date"
                value={homeworkDate}
                onChange={(e) => setHomeworkDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="config-desc">备注（可选）</Label>
            <Textarea
              id="config-desc"
              placeholder="简要描述..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none h-20"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={() =>
              onSave({
                title,
                category: category as FileConfig["category"],
                homework_date: homeworkDate,
                description,
              })
            }
          >
            <Check className="h-4 w-4 mr-1.5" />
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
