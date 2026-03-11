"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Homework, FileUploadResponse } from "@/types";
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
  MessageSquarePlus,
  Image as ImageIcon,
  FileBarChart,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// Types
// ============================================================

type FeedbackType = "ai_report" | "teacher_text" | "teacher_audio" | "teacher_image";

interface FeedbackFileItem {
  id: string;
  localFile: File;
  uploadStatus: "pending" | "uploading" | "success" | "error";
  serverFile?: FileUploadResponse;
  errorMessage?: string;
  config: FeedbackConfig;
  feedbackCreated: boolean;
}

interface FeedbackConfig {
  homeworkId: string;
  feedbackType: FeedbackType;
  content: string;
}

// ============================================================
// Constants
// ============================================================

const FEEDBACK_TYPES = [
  { value: "ai_report", label: "AI 点评报告", icon: FileBarChart },
  { value: "teacher_text", label: "老师文字点评", icon: FileText },
  { value: "teacher_audio", label: "老师语音点评", icon: Mic },
  { value: "teacher_image", label: "老师图片/截图", icon: ImageIcon },
] as const;

const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  ai_report: "AI 点评报告",
  teacher_text: "老师文字点评",
  teacher_audio: "老师语音点评",
  teacher_image: "老师图片/截图",
};

const FEEDBACK_TYPE_COLORS: Record<string, string> = {
  ai_report: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  teacher_text: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  teacher_audio: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  teacher_image: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

const CATEGORY_LABELS: Record<string, string> = {
  writing: "写作",
  speaking: "口语",
  reading: "阅读",
  listening: "听力",
};

const CATEGORY_COLORS: Record<string, string> = {
  writing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  speaking: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  reading: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  listening: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
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

/** 根据文件 MIME 类型推测反馈类型 */
function guessFeedbackType(file: File): FeedbackType {
  if (file.type.startsWith("audio/")) return "teacher_audio";
  if (file.type.startsWith("image/")) return "teacher_image";
  // PDF / Word / 文本 → 默认 AI 报告
  if (
    file.type === "application/pdf" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "application/msword" ||
    file.type.startsWith("text/")
  ) {
    return "ai_report";
  }
  return "ai_report";
}

/** 根据文件名智能匹配作业。返回最佳匹配的 homework ID，未匹配返回空字符串 */
function matchHomework(filename: string, homeworks: Homework[]): string {
  if (homeworks.length === 0) return "";

  const lower = filename.toLowerCase();

  // 尝试从文件名中提取日期 (YYYY-MM-DD, YYYY_MM_DD, YYYYMMDD)
  const datePatterns = [
    /(\d{4})[-_](\d{2})[-_](\d{2})/,
    /(\d{4})(\d{2})(\d{2})/,
  ];

  let fileDate: string | null = null;
  for (const pattern of datePatterns) {
    const match = lower.match(pattern);
    if (match) {
      fileDate = `${match[1]}-${match[2]}-${match[3]}`;
      break;
    }
  }

  // 尝试从文件名中提取科目
  let fileCategory: string | null = null;
  if (/writ|写作|essay|作文/i.test(lower)) fileCategory = "writing";
  else if (/speak|口语|speaking|part[123]/i.test(lower)) fileCategory = "speaking";
  else if (/read|阅读|reading|passage/i.test(lower)) fileCategory = "reading";
  else if (/listen|听力|listening/i.test(lower)) fileCategory = "listening";

  // 打分并排序
  let bestScore = 0;
  let bestId = "";

  for (const hw of homeworks) {
    let score = 0;

    // 日期匹配（最高权重）
    if (fileDate && hw.homework_date === fileDate) {
      score += 10;
    }

    // 科目匹配
    if (fileCategory && hw.category === fileCategory) {
      score += 5;
    }

    // 标题关键词匹配
    const hwTitle = hw.title.toLowerCase();
    const fileWords = lower.replace(/[^a-z0-9\u4e00-\u9fff]/g, " ").split(/\s+/).filter(w => w.length > 1);
    for (const word of fileWords) {
      if (hwTitle.includes(word)) {
        score += 2;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = hw.id;
    }
  }

  // 至少需要 5 分以上才算有效匹配（日期或科目至少匹配一个）
  return bestScore >= 5 ? bestId : "";
}

let _idCounter = 0;
function generateId(): string {
  return `bf-${Date.now()}-${++_idCounter}`;
}

// ============================================================
// Main Page Component
// ============================================================

export default function BatchFeedbackPage() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const [phase, setPhase] = useState<"select" | "manage">("select");
  const [items, setItems] = useState<FeedbackFileItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [configItem, setConfigItem] = useState<FeedbackFileItem | null>(null);

  // 所有作业列表（用于选择目标作业）
  const [allHomeworks, setAllHomeworks] = useState<Homework[]>([]);
  const [loadingHomeworks, setLoadingHomeworks] = useState(true);

  // 全局默认配置
  const [defaultHomeworkId, setDefaultHomeworkId] = useState("");
  const [defaultFeedbackType, setDefaultFeedbackType] = useState<FeedbackType>("ai_report");

  // 加载所有作业
  useEffect(() => {
    const load = async () => {
      try {
        const hw = await api.getHomeworks();
        // 按日期倒序
        hw.sort((a, b) => b.homework_date.localeCompare(a.homework_date));
        setAllHomeworks(hw);
      } catch {
        toast({ variant: "destructive", description: "加载作业列表失败" });
      } finally {
        setLoadingHomeworks(false);
      }
    };
    load();
  }, [toast]);

  // 添加文件
  const addFiles = useCallback(
    (fileList: File[]) => {
      const newItems: FeedbackFileItem[] = fileList.map((f) => ({
        id: generateId(),
        localFile: f,
        uploadStatus: "pending" as const,
        config: {
          homeworkId: defaultHomeworkId || matchHomework(f.name, allHomeworks),
          feedbackType: guessFeedbackType(f),
          content: "",
        },
        feedbackCreated: false,
      }));
      setItems((prev) => [...prev, ...newItems]);
    },
    [defaultHomeworkId, allHomeworks]
  );

  // 上传所有 pending 文件
  const handleUploadAll = async () => {
    const pendingItems = items.filter((it) => it.uploadStatus === "pending" || it.uploadStatus === "error");
    if (pendingItems.length === 0) {
      toast({ description: "没有需要上传的文件" });
      return;
    }

    setIsUploading(true);

    for (const item of pendingItems) {
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

  // 删除文件
  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setDeleteItemId(null);
  };

  // 更新配置
  const updateItemConfig = (id: string, config: FeedbackConfig) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, config } : it))
    );
  };

  // 应用默认配置到所有未创建的
  const applyDefaultsToAll = () => {
    if (!defaultHomeworkId) {
      toast({ variant: "destructive", description: "请先选择默认目标作业" });
      return;
    }
    setItems((prev) =>
      prev.map((it) =>
        it.feedbackCreated
          ? it
          : {
              ...it,
              config: {
                ...it.config,
                homeworkId: defaultHomeworkId,
                feedbackType: defaultFeedbackType,
              },
            }
      )
    );
    toast({ description: "已应用默认配置到所有文件" });
  };

  // 批量创建反馈
  const handleCreateAll = async () => {
    const readyItems = items.filter(
      (it) => it.uploadStatus === "success" && !it.feedbackCreated && it.serverFile
    );

    if (readyItems.length === 0) {
      toast({ description: "没有可创建的反馈" });
      return;
    }

    // 检查所有文件是否都配置了目标作业
    const noHomework = readyItems.filter((it) => !it.config.homeworkId);
    if (noHomework.length > 0) {
      toast({
        variant: "destructive",
        description: `有 ${noHomework.length} 个文件未选择目标作业，请先完善配置`,
      });
      return;
    }

    setIsCreating(true);
    let successCount = 0;
    let failCount = 0;

    for (const item of readyItems) {
      try {
        await api.addFeedback(item.config.homeworkId, {
          feedback_type: item.config.feedbackType,
          content: item.config.content.trim() || undefined,
          file_id: item.serverFile!.id,
        });
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, feedbackCreated: true } : it))
        );
        successCount++;
      } catch {
        failCount++;
      }
    }

    setIsCreating(false);

    if (failCount === 0) {
      toast({ description: `🎉 成功创建 ${successCount} 条反馈` });
    } else {
      toast({
        variant: "destructive",
        description: `创建完成：${successCount} 成功，${failCount} 失败`,
      });
    }
  };

  // 统计
  const totalCount = items.length;
  const uploadedCount = items.filter((it) => it.uploadStatus === "success").length;
  const errorCount = items.filter((it) => it.uploadStatus === "error").length;
  const createdCount = items.filter((it) => it.feedbackCreated).length;
  const pendingCreateCount = items.filter(
    (it) => it.uploadStatus === "success" && !it.feedbackCreated
  ).length;
  const allCreated = createdCount === totalCount && totalCount > 0;

  // 辅助：根据 homeworkId 获取作业展示文本
  const getHomeworkLabel = (id: string) => {
    const hw = allHomeworks.find((h) => h.id === id);
    if (!hw) return "未选择";
    return `${hw.title} (${CATEGORY_LABELS[hw.category]} · ${hw.homework_date})`;
  };

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
            <h1 className="text-lg font-semibold flex items-center gap-2">💬 批量添加反馈</h1>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 max-w-3xl">
          {/* 全局默认设置 */}
          <div className="rounded-lg border bg-card p-4 mb-6">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              默认配置（可后续逐个修改）
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">默认目标作业</Label>
                {loadingHomeworks ? (
                  <div className="h-9 flex items-center text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                    加载作业列表...
                  </div>
                ) : (
                  <Select value={defaultHomeworkId} onValueChange={setDefaultHomeworkId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="自动匹配（根据文件名）" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      <SelectItem value="auto">自动匹配（根据文件名）</SelectItem>
                      {allHomeworks.map((hw) => (
                        <SelectItem key={hw.id} value={hw.id}>
                          <span className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-[10px] px-1 ${CATEGORY_COLORS[hw.category]}`}>
                              {CATEGORY_LABELS[hw.category]}
                            </Badge>
                            <span className="truncate">{hw.title}</span>
                            <span className="text-muted-foreground text-xs">{hw.homework_date}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">默认反馈类型</Label>
                <Select value={defaultFeedbackType} onValueChange={(v) => setDefaultFeedbackType(v as FeedbackType)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEEDBACK_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* 拖拽上传区 */}
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dragCounterRef.current++;
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dragCounterRef.current--;
              if (dragCounterRef.current <= 0) {
                dragCounterRef.current = 0;
                setDragOver(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dragCounterRef.current = 0;
              setDragOver(false);
              const droppedFiles = Array.from(e.dataTransfer.files);
              if (droppedFiles.length > 0) addFiles(droppedFiles);
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
              <p className="font-medium text-base">拖拽反馈文件到此处，或点击选择</p>
              <p className="text-sm text-muted-foreground mt-1">
                支持 AI 报告（PDF/Word）、老师录音、截图等，可一次选择多个
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
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-muted/30 hover:bg-muted/50 transition-colors overflow-hidden"
                  >
                    <span className="text-lg shrink-0">{getFileIcon(item.localFile)}</span>
                    <span className="truncate flex-1 min-w-0 font-medium">{item.localFile.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatFileSize(item.localFile.size)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 shrink-0 ${FEEDBACK_TYPE_COLORS[item.config.feedbackType]}`}
                    >
                      {FEEDBACK_TYPE_LABELS[item.config.feedbackType]}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
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
          <h1 className="text-lg font-semibold flex items-center gap-2">💬 批量反馈 — 配置管理</h1>
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
                  已创建 {createdCount}
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
                  if (selected.length > 0) addFiles(selected);
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5 sm:col-span-1">
              <Label className="text-xs">目标作业</Label>
              <Select value={defaultHomeworkId} onValueChange={setDefaultHomeworkId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="选择作业" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {allHomeworks.map((hw) => (
                    <SelectItem key={hw.id} value={hw.id}>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] px-1 ${CATEGORY_COLORS[hw.category]}`}>
                          {CATEGORY_LABELS[hw.category]}
                        </Badge>
                        <span className="truncate">{hw.title}</span>
                        <span className="text-muted-foreground text-xs">{hw.homework_date}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">反馈类型</Label>
              <Select value={defaultFeedbackType} onValueChange={(v) => setDefaultFeedbackType(v as FeedbackType)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            const hasHomework = !!item.config.homeworkId;
            return (
              <div
                key={item.id}
                className={`rounded-lg border bg-card p-4 transition-all ${
                  item.feedbackCreated
                    ? "opacity-60 border-green-200 dark:border-green-800"
                    : !hasHomework
                    ? "border-amber-300 dark:border-amber-700"
                    : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* 状态图标 */}
                  <div className="flex-shrink-0 mt-0.5">
                    {item.uploadStatus === "uploading" && (
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    )}
                    {item.uploadStatus === "success" && !item.feedbackCreated && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                    {item.uploadStatus === "error" && (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    )}
                    {item.uploadStatus === "pending" && (
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    )}
                    {item.feedbackCreated && (
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
                        className={`text-[10px] ${FEEDBACK_TYPE_COLORS[item.config.feedbackType]}`}
                      >
                        {FEEDBACK_TYPE_LABELS[item.config.feedbackType]}
                      </Badge>
                      {hasHomework ? (
                        <span className="text-muted-foreground truncate max-w-[300px]">
                          → {getHomeworkLabel(item.config.homeworkId)}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          ⚠ 未选择目标作业
                        </span>
                      )}
                      {item.feedbackCreated && (
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
                    {!item.feedbackCreated && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-8 w-8 p-0 ${hasHomework ? "text-primary" : "text-amber-500"}`}
                        title="配置反馈信息"
                        onClick={() => setConfigItem(item)}
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    )}
                    {!item.feedbackCreated && (
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
                  一键创建 {pendingCreateCount} 条反馈
                </>
              )}
            </Button>
          </div>
        )}

        {allCreated && (
          <div className="mt-8 text-center space-y-3">
            <div className="text-4xl">🎉</div>
            <p className="text-lg font-semibold">全部反馈创建完成！</p>
            <p className="text-sm text-muted-foreground">
              共 {createdCount} 条反馈已添加到对应作业
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
        <FeedbackConfigDialog
          item={configItem}
          homeworks={allHomeworks}
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
// Feedback Config Dialog (配置悬浮窗)
// ============================================================

function FeedbackConfigDialog({
  item,
  homeworks,
  onClose,
  onSave,
}: {
  item: FeedbackFileItem;
  homeworks: Homework[];
  onClose: () => void;
  onSave: (config: FeedbackConfig) => void;
}) {
  const [homeworkId, setHomeworkId] = useState(item.config.homeworkId);
  const [feedbackType, setFeedbackType] = useState<string>(item.config.feedbackType);
  const [content, setContent] = useState(item.config.content);
  const [searchText, setSearchText] = useState("");

  // 过滤作业列表
  const filteredHomeworks = searchText.trim()
    ? homeworks.filter(
        (hw) =>
          hw.title.toLowerCase().includes(searchText.toLowerCase()) ||
          hw.homework_date.includes(searchText) ||
          CATEGORY_LABELS[hw.category]?.includes(searchText)
      )
    : homeworks;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            配置反馈信息
          </DialogTitle>
        </DialogHeader>

        {/* 文件预览 */}
        <div className="flex items-center gap-2 rounded-md bg-muted/50 p-3 text-sm overflow-hidden">
          <span className="text-lg shrink-0">{getFileIcon(item.localFile)}</span>
          <span className="truncate font-medium min-w-0 flex-1">{item.localFile.name}</span>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {formatFileSize(item.localFile.size)}
          </span>
        </div>

        <div className="space-y-4 py-1">
          {/* 目标作业 */}
          <div className="space-y-2">
            <Label>目标作业 <span className="text-destructive">*</span></Label>
            <Input
              placeholder="搜索作业标题、日期、科目..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-9"
            />
            <div className="max-h-40 overflow-y-auto rounded-md border">
              {filteredHomeworks.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">未找到匹配的作业</div>
              ) : (
                filteredHomeworks.map((hw) => (
                  <button
                    key={hw.id}
                    onClick={() => setHomeworkId(hw.id)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                      homeworkId === hw.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted"
                    }`}
                  >
                    {homeworkId === hw.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                    <Badge variant="outline" className={`text-[10px] px-1 shrink-0 ${CATEGORY_COLORS[hw.category]}`}>
                      {CATEGORY_LABELS[hw.category]}
                    </Badge>
                    <span className="truncate">{hw.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-auto">{hw.homework_date}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* 反馈类型 */}
          <div className="space-y-2">
            <Label>反馈类型</Label>
            <Select value={feedbackType} onValueChange={setFeedbackType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 备注文字 */}
          <div className="space-y-2">
            <Label htmlFor="fb-content">文字备注（可选）</Label>
            <Textarea
              id="fb-content"
              placeholder="添加文字说明或补充内容..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
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
                homeworkId,
                feedbackType: feedbackType as FeedbackType,
                content,
              })
            }
            disabled={!homeworkId}
          >
            <Check className="h-4 w-4 mr-1.5" />
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
