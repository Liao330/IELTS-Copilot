"use client";

import { useEffect, useState, useCallback, useRef, DragEvent } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Homework, HomeworkFeedback, HomeworkFileInfo } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Download, Trash2, Plus, FileText, Mic, MessageSquare,
  Image as ImageIcon, Bot, Upload, X, Pencil, BookOpen, Loader2, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ScoreRadar from "@/components/homework/ScoreRadar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const CATEGORY_LABELS: Record<string, string> = {
  writing: "写作", speaking: "口语", reading: "阅读", listening: "听力",
};

const CATEGORY_COLORS: Record<string, string> = {
  writing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  speaking: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  reading: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  listening: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const FEEDBACK_TYPE_INFO: Record<string, { label: string; icon: typeof Bot; color: string }> = {
  ai_report: { label: "AI 点评报告", icon: Bot, color: "text-blue-600" },
  teacher_text: { label: "老师文字点评", icon: MessageSquare, color: "text-green-600" },
  teacher_audio: { label: "老师语音点评", icon: Mic, color: "text-purple-600" },
  teacher_image: { label: "老师图片点评", icon: ImageIcon, color: "text-orange-600" },
  review_note: { label: "复盘笔记", icon: BookOpen, color: "text-amber-600" },
};

const HOMEWORK_FILE_ACCEPT: Record<string, string> = {
  writing: ".doc,.docx,.pdf,.txt,.md,.jpg,.jpeg,.png,.webp,audio/*,video/*,.mp3,.m4a,.wav,.ogg,.mp4,.mov,.webm",
  speaking: "audio/*,video/*,.mp3,.m4a,.wav,.ogg,.mp4,.mov,.webm,.doc,.docx,.pdf,.txt,.md,.jpg,.jpeg,.png,.webp",
  reading: ".doc,.docx,.pdf,.txt,.md,.jpg,.jpeg,.png,.webp,audio/*,video/*,.mp3,.m4a,.wav,.ogg,.mp4,.mov,.webm",
  listening: "audio/*,.mp3,.m4a,.wav,.ogg,.doc,.docx,.pdf,.txt,.md,.jpg,.jpeg,.png,.webp",
};

const HOMEWORK_FILE_HINT: Record<string, string> = {
  writing: "上传作业文件（支持文档/图片/音视频）",
  speaking: "上传作业文件（支持音视频/文档/图片）",
  reading: "上传作业文件（支持文档/图片/音视频）",
  listening: "上传作业文件（支持音频/文档/图片）",
};

const FEEDBACK_TYPES = [
  { value: "ai_report", label: "AI 点评报告" },
  { value: "teacher_text", label: "老师文字点评" },
  { value: "teacher_audio", label: "老师语音点评" },
  { value: "teacher_image", label: "老师图片/截图" },
] as const;

// ---- File preview component ----
function FilePreview({ fileId, fileName, mimeType }: { fileId: string; fileName: string; mimeType: string }) {
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  const isDocx = /\.docx$/i.test(fileName);

  const handlePreview = async () => {
    setShowPreview(true);
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(api.getFilePreviewUrl(fileId));
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `预览失败 (${res.status})`);
      }
      const blob = await res.blob();

      if (isDocx) {
        // Use docx-preview to render .docx locally
        const { renderAsync } = await import("docx-preview");
        // Wait for the container to mount
        setTimeout(() => {
          if (docxContainerRef.current) {
            renderAsync(blob, docxContainerRef.current, undefined, {
              className: "docx-preview-wrapper",
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              ignoreFonts: false,
              breakPages: true,
            }).catch((e: unknown) => {
              setPreviewError(e instanceof Error ? e.message : "DOCX 渲染失败");
            });
          }
        }, 0);
      } else {
        setPreviewUrl(URL.createObjectURL(blob));
      }
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "预览加载失败");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClosePreview = () => {
    setShowPreview(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewError(null);
  };

  if (mimeType.startsWith("audio/")) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground flex items-center gap-1"><Mic className="h-3 w-3" />{fileName}</p>
        <audio controls className="w-full max-w-md" src={api.getFileDownloadUrl(fileId)}>
          Your browser does not support the audio element.
        </audio>
      </div>
    );
  }
  if (mimeType.startsWith("video/")) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">{fileName}</p>
        <video controls className="w-full max-w-lg rounded-md border" src={api.getFileDownloadUrl(fileId)}>
          Your browser does not support the video element.
        </video>
      </div>
    );
  }
  if (mimeType.startsWith("image/")) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">{fileName}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={api.getFileDownloadUrl(fileId)} alt={fileName} className="max-w-full max-h-96 rounded-md border" />
      </div>
    );
  }

  // PDF / Word / other documents — click to preview
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <FileText className="h-3 w-3" />{fileName}
        </p>
        <div className="flex items-center gap-1.5">
          {!showPreview ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs px-2.5"
              onClick={handlePreview}
              disabled={previewLoading}
            >
              <FileText className="h-3 w-3" />{previewLoading ? "加载中..." : "预览"}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs px-2.5"
              onClick={handleClosePreview}
            >
              <X className="h-3 w-3" />关闭预览
            </Button>
          )}
          <a
            href={api.getFileDownloadUrl(fileId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-muted transition-colors"
          >
            <Download className="h-3 w-3" />下载
          </a>
        </div>
      </div>
      {showPreview && (
        <>
          {previewLoading && (
            <div className="flex items-center justify-center py-8 rounded-md border bg-muted/30">
              <span className="text-sm text-muted-foreground animate-pulse">加载预览中...</span>
            </div>
          )}
          {previewError && (
            <div className="flex items-center justify-center py-8 rounded-md border border-destructive/30 bg-destructive/5">
              <span className="text-sm text-destructive">{previewError}</span>
            </div>
          )}
          {isDocx ? (
            <div
              ref={docxContainerRef}
              className="w-full rounded-md border bg-white overflow-auto"
              style={{ height: "70vh" }}
            />
          ) : (
            previewUrl && !previewError && (
              <iframe
                src={previewUrl}
                className="w-full rounded-md border"
                style={{ height: "70vh" }}
                title={fileName}
              />
            )
          )}
        </>
      )}
    </div>
  );
}

export default function HomeworkDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const homeworkId = params.homeworkId as string;
  const { toast } = useToast();

  const [homework, setHomework] = useState<Homework | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addFeedbackOpen, setAddFeedbackOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(searchParams.get("edit") === "1");
  const [editingFeedback, setEditingFeedback] = useState<HomeworkFeedback | null>(null);
  const [generatingNote, setGeneratingNote] = useState(false);

  const fetchHomework = useCallback(async () => {
    try {
      const hw = await api.getHomework(homeworkId);
      setHomework(hw);
    } catch {
      toast({ variant: "destructive", description: "加载失败" });
    } finally {
      setLoading(false);
    }
  }, [homeworkId, toast]);

  useEffect(() => { fetchHomework(); }, [fetchHomework]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteHomework(homeworkId);
      toast({ description: "作业已删除" });
      router.push("/homeworks");
    } catch {
      toast({ variant: "destructive", description: "删除失败" });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteFeedback = async (fb: HomeworkFeedback) => {
    try {
      await api.deleteFeedback(homeworkId, fb.id);
      toast({ description: "反馈已删除" });
      fetchHomework();
    } catch {
      toast({ variant: "destructive", description: "删除失败" });
    }
  };

  const handleRemoveFile = async (fileId: string) => {
    try {
      await api.removeHomeworkFile(homeworkId, fileId);
      toast({ description: "文件已删除" });
      fetchHomework();
    } catch {
      toast({ variant: "destructive", description: "删除文件失败" });
    }
  };

  const handleGenerateReviewNote = async () => {
    setGeneratingNote(true);
    try {
      await api.generateReviewNote(homeworkId);
      toast({ description: "复盘笔记已生成" });
      fetchHomework();
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "生成失败，请确保作业已有反馈或做题文件" });
    } finally {
      setGeneratingNote(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (!homework) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">作业不存在</p>
        <Button variant="outline" onClick={() => router.push("/homeworks")}>返回作业库</Button>
      </div>
    );
  }

  // Use files array; fallback to legacy single file for old data
  const hwFiles: HomeworkFileInfo[] = homework.files && homework.files.length > 0
    ? homework.files
    : homework.file_id && homework.file_name && homework.file_mime_type
      ? [{ id: homework.file_id, name: homework.file_name, mime_type: homework.file_mime_type }]
      : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/homeworks")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold truncate flex-1">{homework.title}</h1>
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
        {/* 基本信息 */}
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <Badge className={CATEGORY_COLORS[homework.category]}>
              {CATEGORY_LABELS[homework.category]}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {new Date(homework.homework_date).toLocaleDateString("zh-CN", {
                year: "numeric", month: "long", day: "numeric", weekday: "short",
              })}
            </span>
          </div>
          {homework.description && (
            <p className="text-sm text-muted-foreground mb-3">{homework.description}</p>
          )}
          {hwFiles.length > 0 && (
            <div className="space-y-4">
              {hwFiles.map((f) => (
                <div key={f.id} className="relative group">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-1 right-1 z-10 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive bg-background/80"
                    onClick={() => handleRemoveFile(f.id)}
                    title="删除文件"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <FilePreview fileId={f.id} fileName={f.name} mimeType={f.mime_type} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI 评分可视化（从反馈中提取，作为独立区块展示） */}
        {(() => {
          // 写作/口语：ai_report 类型 → 雷达图
          const aiScores = homework.feedbacks.find(
            (fb) => fb.feedback_type === "ai_report" && fb.scores
          )?.scores;
          // 听力/阅读：auto_scores 类型 → 分数卡片
          const autoScores = homework.feedbacks.find(
            (fb) => fb.feedback_type === "auto_scores" && fb.scores
          )?.scores;

          return (
            <>
              {aiScores && <ScoreRadar scores={aiScores} />}
              {autoScores && <ListeningReadingScoreCard scores={autoScores as unknown as LRScores} />}
            </>
          );
        })()}

        {/* AI 摘要 */}
        <HomeworkSummaryBlock homework={homework} onRefresh={fetchHomework} />

        {/* 精听练习关联（仅听力作业） */}
        {homework.category === "listening" && (
          <ListeningPracticeLink homeworkId={homework.id} homeworkTitle={homework.title} />
        )}

        {/* 反馈区域 */}
        <div>
          {(() => {
            // auto_scores 是内部数据，不在反馈列表中展示
            const visibleFeedbacks = homework.feedbacks.filter(
              (fb) => fb.feedback_type !== "auto_scores"
            );
            return (
              <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              💬 点评与反馈
              {visibleFeedbacks.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal">({visibleFeedbacks.length}条)</span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {/* 显示复盘笔记按钮条件：有非review_note反馈 OR 阅读/听力有作业文件 */}
              {(visibleFeedbacks.filter(fb => fb.feedback_type !== "review_note").length > 0 ||
                (["reading", "listening"].includes(homework.category) && hwFiles.length > 0)
              ) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={handleGenerateReviewNote}
                  disabled={generatingNote}
                >
                  {generatingNote ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      生成中...
                    </>
                  ) : visibleFeedbacks.some(fb => fb.feedback_type === "review_note") ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      重新生成复盘
                    </>
                  ) : (
                    <>
                      <BookOpen className="h-3.5 w-3.5" />
                      生成复盘笔记
                    </>
                  )}
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddFeedbackOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                添加反馈
              </Button>
            </div>
          </div>

          {visibleFeedbacks.length === 0 ? (
            <div className="text-center py-8 rounded-lg border border-dashed text-muted-foreground text-sm">
              还没有点评反馈，点击「添加反馈」上传
            </div>
          ) : (
            <div className="space-y-3">
              {visibleFeedbacks.map((fb) => {
                const info = FEEDBACK_TYPE_INFO[fb.feedback_type] || FEEDBACK_TYPE_INFO.teacher_text;
                const FbIcon = info.icon;

                return (
                  <div key={fb.id} className="rounded-lg border bg-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FbIcon className={`h-4 w-4 ${info.color}`} />
                        <span className="text-sm font-medium">{info.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(fb.created_at).toLocaleDateString("zh-CN")}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        {fb.feedback_type !== "review_note" && (
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                            onClick={() => setEditingFeedback(fb)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteFeedback(fb)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* 文字内容 */}
                    {fb.content && (
                      <div className="prose prose-sm dark:prose-invert max-w-none mt-2">
                        <MarkdownRenderer content={fb.content} />
                      </div>
                    )}

                    {/* 文件附件 */}
                    {fb.file_id && fb.file_name && fb.file_mime_type && (
                      <div className="mt-2">
                        <FilePreview fileId={fb.file_id} fileName={fb.file_name} mimeType={fb.file_mime_type} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
              </>
            );
          })()}
        </div>
      </main>

      {/* 删除确认 */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>确认删除</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            确定要删除「{homework.title}」及其所有反馈吗？此操作不可撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑作业弹窗 */}
      <EditHomeworkDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        homework={homework}
        onUpdated={() => { fetchHomework(); setEditOpen(false); }}
      />

      {/* 添加反馈弹窗 */}
      <AddFeedbackDialog
        open={addFeedbackOpen}
        onOpenChange={setAddFeedbackOpen}
        homeworkId={homeworkId}
        onAdded={() => { fetchHomework(); setAddFeedbackOpen(false); }}
      />

      {/* 编辑反馈弹窗 */}
      {editingFeedback && (
        <EditFeedbackDialog
          open={!!editingFeedback}
          onOpenChange={(o) => { if (!o) setEditingFeedback(null); }}
          homeworkId={homeworkId}
          feedback={editingFeedback}
          onUpdated={() => { fetchHomework(); setEditingFeedback(null); }}
        />
      )}
    </div>
  );
}

// ---- Edit Homework Dialog ----
const EDIT_CATEGORIES = [
  { value: "writing", label: "写作" },
  { value: "speaking", label: "口语" },
  { value: "reading", label: "阅读" },
  { value: "listening", label: "听力" },
] as const;

function EditHomeworkDialog({
  open, onOpenChange, homework, onUpdated,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; homework: Homework; onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(homework.title);
  const [category, setCategory] = useState<string>(homework.category);
  const [homeworkDate, setHomeworkDate] = useState(homework.homework_date);
  const [description, setDescription] = useState(homework.description || "");
  // Existing server files (from homework.files)
  const [existingFiles, setExistingFiles] = useState<HomeworkFileInfo[]>(homework.files || []);
  // Newly selected local files
  const [newFiles, setNewFiles] = useState<File[]>([]);
  // File ids to remove
  const [removedFileIds, setRemovedFileIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [editDragOver, setEditDragOver] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const handleEditDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setEditDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) setNewFiles((prev) => [...prev, ...droppedFiles]);
  };

  useEffect(() => {
    if (open) {
      setTitle(homework.title);
      setCategory(homework.category);
      setHomeworkDate(homework.homework_date);
      setDescription(homework.description || "");
      // Fallback for old data without files array
      const files = homework.files && homework.files.length > 0
        ? homework.files
        : homework.file_id && homework.file_name && homework.file_mime_type
          ? [{ id: homework.file_id, name: homework.file_name, mime_type: homework.file_mime_type }]
          : [];
      setExistingFiles(files);
      setNewFiles([]);
      setRemovedFileIds(new Set());
    }
  }, [open, homework]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ variant: "destructive", description: "请输入作业标题" });
      return;
    }
    setSaving(true);
    try {
      // Upload new files
      const uploadedIds: string[] = [];
      for (const f of newFiles) {
        const uploaded = await api.uploadFile(f);
        uploadedIds.push(uploaded.id);
      }

      // Build final file_ids: existing (minus removed) + newly uploaded
      const keptIds = existingFiles
        .filter((f) => !removedFileIds.has(f.id))
        .map((f) => f.id);
      const finalFileIds = [...keptIds, ...uploadedIds];

      await api.updateHomework(homework.id, {
        title: title.trim(),
        category,
        homework_date: homeworkDate,
        description: description.trim() || "",
        file_ids: finalFileIds,
      });
      toast({ description: "作业已更新" });
      onUpdated();
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "更新失败" });
    } finally {
      setSaving(false);
    }
  };

  const visibleExisting = existingFiles.filter((f) => !removedFileIds.has(f.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>编辑作业</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-title">标题</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>科目</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EDIT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-date">日期</Label>
              <Input id="edit-date" type="date" value={homeworkDate} onChange={(e) => setHomeworkDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-desc">备注</Label>
            <Textarea id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="resize-none h-20" />
          </div>
          <div className="space-y-2">
            <Label>作业文件（支持多个）</Label>
            {/* Existing server files */}
            {visibleExisting.length > 0 && (
              <div className="space-y-1.5">
                {visibleExisting.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 rounded-md border p-2 text-sm overflow-hidden">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1 min-w-0">{f.name}</span>
                    <Button
                      variant="ghost" size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setRemovedFileIds((prev) => { const next = new Set(Array.from(prev)); next.add(f.id); return next; })}
                      title="移除文件"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {/* Newly added local files */}
            {newFiles.length > 0 && (
              <div className="space-y-1.5">
                {newFiles.map((f, i) => (
                  <div key={`new-${i}`} className="flex items-center gap-2 rounded-md border p-2 text-sm bg-green-50 dark:bg-green-950/20 overflow-hidden">
                    <span className="truncate flex-1 min-w-0">{f.name}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">新</Badge>
                    <Button
                      variant="ghost" size="sm" className="h-6 w-6 p-0"
                      onClick={() => setNewFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div
              onDrop={handleEditDrop}
              onDragOver={(e) => { e.preventDefault(); setEditDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setEditDragOver(false); }}
              onClick={() => editFileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-3 cursor-pointer transition-colors text-sm text-muted-foreground ${
                editDragOver ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <Upload className="h-4 w-4" />
              <span>{HOMEWORK_FILE_HINT[category] || "添加文件"}</span>
              <span className="text-xs">点击选择或拖拽文件到此处</span>
              <input
                ref={editFileInputRef}
                type="file"
                className="hidden"
                multiple
                accept={HOMEWORK_FILE_ACCEPT[category] || ""}
                onChange={(e) => {
                  const added = Array.from(e.target.files || []);
                  if (added.length > 0) setNewFiles((prev) => [...prev, ...added]);
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

// ---- Add Feedback Dialog ----
function AddFeedbackDialog({
  open, onOpenChange, homeworkId, onAdded,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; homeworkId: string; onAdded: () => void;
}) {
  const { toast } = useToast();
  const [feedbackType, setFeedbackType] = useState("ai_report");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [fbDragOver, setFbDragOver] = useState(false);
  const fbFileInputRef = useRef<HTMLInputElement>(null);

  const handleFbDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setFbDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const needsFile = feedbackType === "teacher_audio" || feedbackType === "teacher_image" || feedbackType === "ai_report";
  const needsText = feedbackType === "teacher_text" || feedbackType === "ai_report";

  const acceptMap: Record<string, string> = {
    ai_report: ".pdf,.doc,.docx,.txt,.md",
    teacher_text: "",
    teacher_audio: "audio/*,.mp3,.m4a,.wav,.ogg",
    teacher_image: "image/*,.jpg,.jpeg,.png,.webp",
  };

  const handleSave = async () => {
    if (needsText && !content.trim() && !file) {
      toast({ variant: "destructive", description: "请输入文字内容或上传文件" });
      return;
    }
    if (!needsText && !file) {
      toast({ variant: "destructive", description: "请上传文件" });
      return;
    }

    setSaving(true);
    try {
      let fileId: string | undefined;
      if (file) {
        const uploaded = await api.uploadFile(file);
        fileId = uploaded.id;
      }

      await api.addFeedback(homeworkId, {
        feedback_type: feedbackType,
        content: content.trim() || undefined,
        file_id: fileId,
      });

      toast({ description: "反馈添加成功" });
      setContent("");
      setFile(null);
      setFeedbackType("ai_report");
      onAdded();
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "添加失败" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>添加反馈</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>反馈类型</Label>
            <Select value={feedbackType} onValueChange={(v) => { setFeedbackType(v); setFile(null); setContent(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FEEDBACK_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsText && (
            <div className="space-y-2">
              <Label>文字内容{feedbackType === "ai_report" ? "（可选，也可上传文件）" : ""}</Label>
              <Textarea
                placeholder={feedbackType === "teacher_text" ? "粘贴老师的文字点评..." : "粘贴 AI 点评内容..."}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[120px] resize-y"
              />
            </div>
          )}

          {(needsFile || feedbackType === "ai_report") && (
            <div className="space-y-2">
              <Label>上传文件{feedbackType === "ai_report" && content.trim() ? "（可选）" : ""}</Label>
              {file ? (
                <div className="flex items-center gap-2 rounded-md border p-2 text-sm overflow-hidden">
                  <span className="truncate flex-1 min-w-0">{file.name}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 shrink-0 p-0" onClick={() => setFile(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div
                  onDrop={handleFbDrop}
                  onDragOver={(e) => { e.preventDefault(); setFbDragOver(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setFbDragOver(false); }}
                  onClick={() => fbFileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-4 cursor-pointer transition-colors text-sm text-muted-foreground ${
                    fbDragOver ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  <span>
                    {feedbackType === "teacher_audio" ? "上传语音文件" :
                     feedbackType === "teacher_image" ? "上传图片" :
                     "上传点评报告文件"}
                  </span>
                  <span className="text-xs">点击选择或拖拽文件到此处</span>
                  <input
                    ref={fbFileInputRef}
                    type="file"
                    className="hidden"
                    accept={acceptMap[feedbackType] || ""}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setFile(f);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Edit Feedback Dialog ----
function EditFeedbackDialog({
  open, onOpenChange, homeworkId, feedback, onUpdated,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; homeworkId: string;
  feedback: HomeworkFeedback; onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [content, setContent] = useState(feedback.content || "");
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editFbDragOver, setEditFbDragOver] = useState(false);
  const editFbFileInputRef = useRef<HTMLInputElement>(null);

  const handleEditFbDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setEditFbDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) { setFile(f); setRemoveFile(false); }
  };

  const info = FEEDBACK_TYPE_INFO[feedback.feedback_type] || FEEDBACK_TYPE_INFO.teacher_text;
  const needsText = feedback.feedback_type === "teacher_text" || feedback.feedback_type === "ai_report";
  const needsFile = feedback.feedback_type === "teacher_audio" || feedback.feedback_type === "teacher_image" || feedback.feedback_type === "ai_report";

  const acceptMap: Record<string, string> = {
    ai_report: ".pdf,.doc,.docx,.txt,.md",
    teacher_text: "",
    teacher_audio: "audio/*,.mp3,.m4a,.wav,.ogg",
    teacher_image: "image/*,.jpg,.jpeg,.png,.webp",
  };

  useEffect(() => {
    if (open) {
      setContent(feedback.content || "");
      setFile(null);
      setRemoveFile(false);
    }
  }, [open, feedback]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let fileId: string | undefined;
      if (file) {
        const uploaded = await api.uploadFile(file);
        fileId = uploaded.id;
      }

      const updateData: Record<string, unknown> = {};
      if (needsText) {
        updateData.content = content.trim() || null;
      }
      if (file) {
        updateData.file_id = fileId;
      } else if (removeFile) {
        updateData.file_id = null;
      }

      await api.updateFeedback(homeworkId, feedback.id, updateData);
      toast({ description: "反馈已更新" });
      onUpdated();
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "更新失败" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            编辑反馈
            <Badge variant="outline" className="font-normal text-xs">{info.label}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {needsText && (
            <div className="space-y-2">
              <Label>文字内容</Label>
              <Textarea
                placeholder={feedback.feedback_type === "teacher_text" ? "老师的文字点评..." : "AI 点评内容..."}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[120px] resize-y"
              />
            </div>
          )}

          {needsFile && (
            <div className="space-y-2">
              <Label>附件</Label>
              {file ? (
                <div className="flex items-center gap-2 rounded-md border p-2 text-sm overflow-hidden">
                  <span className="truncate flex-1 min-w-0">{file.name}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 shrink-0 p-0" onClick={() => setFile(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : !removeFile && feedback.file_id && feedback.file_name ? (
                <div className="flex items-center gap-2 rounded-md border p-2 text-sm overflow-hidden">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1 min-w-0">{feedback.file_name}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive" onClick={() => setRemoveFile(true)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div
                  onDrop={handleEditFbDrop}
                  onDragOver={(e) => { e.preventDefault(); setEditFbDragOver(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setEditFbDragOver(false); }}
                  onClick={() => editFbFileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-4 cursor-pointer transition-colors text-sm text-muted-foreground ${
                    editFbDragOver ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  <span>{removeFile ? "重新上传文件" : "上传文件"}</span>
                  <span className="text-xs">点击选择或拖拽文件到此处</span>
                  <input
                    ref={editFbFileInputRef}
                    type="file"
                    className="hidden"
                    accept={acceptMap[feedback.feedback_type] || ""}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) { setFile(f); setRemoveFile(false); }
                      e.target.value = "";
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ==================== 听力/阅读分数卡片 ====================

interface LRPart {
  part: number;
  correct: number;
  total: number;
  label: string;
}

interface LRScores {
  category: string;
  overall: number | null;
  raw_score: number;
  raw_total: number;
  parts: LRPart[];
}

function getScoreColor(score: number): string {
  if (score >= 7) return "text-green-600 dark:text-green-400";
  if (score >= 6) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getBarWidth(correct: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((correct / total) * 100)}%`;
}

function getBarColor(correct: number, total: number): string {
  const pct = total > 0 ? correct / total : 0;
  if (pct >= 0.8) return "bg-green-500";
  if (pct >= 0.6) return "bg-yellow-500";
  return "bg-red-500";
}

function ListeningReadingScoreCard({ scores }: { scores: LRScores }) {
  const isListening = scores.category === "listening";
  const icon = isListening ? "🎧" : "📖";
  const label = isListening ? "听力" : "阅读";
  const isPartial = scores.overall == null && scores.raw_score != null && scores.raw_total != null;
  const accuracy = scores.raw_total > 0 ? Math.round((scores.raw_score / scores.raw_total) * 100) : 0;

  return (
    <div className="rounded-xl border bg-gradient-to-br from-sky-50/60 to-cyan-50/40 dark:from-sky-950/20 dark:to-cyan-950/10 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          {icon} {label}成绩
          <span className="text-xs font-normal text-muted-foreground">
            {isPartial ? "部分练习" : "从 PDF 自动提取"}
          </span>
        </h3>
        {scores.overall != null ? (
          <div className="text-right">
            <div className={`text-2xl font-bold ${getScoreColor(scores.overall)}`}>
              Band {scores.overall}
            </div>
            <div className="text-xs text-muted-foreground">
              {scores.raw_score} / {scores.raw_total}
            </div>
          </div>
        ) : scores.raw_score != null && (
          <div className="text-right">
            <div className={`text-2xl font-bold ${accuracy >= 80 ? "text-green-600 dark:text-green-400" : accuracy >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>
              {accuracy}%
            </div>
            <div className="text-xs text-muted-foreground">
              {scores.raw_score} / {scores.raw_total}
            </div>
          </div>
        )}
      </div>

      {scores.parts.length > 0 && (
        <div className="space-y-2">
          {scores.parts.map((p) => (
            <div key={p.part} className="flex items-center gap-3">
              <span className="text-xs font-medium w-20 shrink-0">
                {p.label}
              </span>
              <div className="flex-1 h-5 bg-muted/50 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getBarColor(p.correct, p.total)}`}
                  style={{ width: getBarWidth(p.correct, p.total) }}
                />
              </div>
              <span className="text-xs font-mono w-14 text-right shrink-0">
                {p.correct}/{p.total}
              </span>
              <span className="text-[10px] text-muted-foreground w-10 text-right shrink-0">
                {p.total > 0 ? `${Math.round((p.correct / p.total) * 100)}%` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {scores.overall == null && scores.raw_score == null && (
        <div className="text-xs text-muted-foreground">
          未能提取分数信息
        </div>
      )}
    </div>
  );
}


// ==================== AI 摘要组件 ====================

function HomeworkSummaryBlock({ homework, onRefresh }: { homework: Homework; onRefresh: () => void }) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(!!homework.summary);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.generateHomeworkSummary(homework.id);
      toast({ description: "摘要已生成" });
      onRefresh();
      setExpanded(true);
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "生成摘要失败" });
    } finally {
      setGenerating(false);
    }
  };

  // 没有摘要时显示生成按钮
  if (!homework.summary) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            🤖 AI 内容摘要
          </h3>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Bot className="h-3.5 w-3.5" />
                生成摘要
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          AI 将分析作业内容，生成结构化摘要，便于后续搜索和复习
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/50 transition-colors rounded-lg"
      >
        <h3 className="font-semibold text-sm flex items-center gap-2">
          🤖 AI 内容摘要
          {homework.summary_updated_at && (
            <span className="text-xs font-normal text-muted-foreground">
              {new Date(homework.summary_updated_at).toLocaleDateString("zh-CN")} 生成
            </span>
          )}
        </h3>
        <span className="text-xs text-muted-foreground">{expanded ? "收起 ▲" : "展开 ▼"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
            {homework.summary}
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs h-7"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              刷新摘要
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


// ==================== 精听练习关联组件 ====================

function ListeningPracticeLink({ homeworkId, homeworkTitle }: { homeworkId: string; homeworkTitle: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<import("@/types").ListeningSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [allSessions, setAllSessions] = useState<import("@/types").ListeningSessionSummary[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    api.getListeningSessionsByHomework(homeworkId)
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [homeworkId]);

  const handleCreate = () => {
    router.push(`/listening-practice/new?homework_id=${homeworkId}&title=${encodeURIComponent(homeworkTitle)}`);
  };

  const handleOpenLink = async () => {
    setShowLinkDialog(true);
    setLoadingAll(true);
    try {
      const all = await api.listListeningSessions();
      // 排除已关联到当前作业的 + demo
      const unlinked = all.filter((s) => !s.is_demo && s.homework_id !== homeworkId);
      setAllSessions(unlinked);
    } catch {
      toast({ variant: "destructive", description: "加载精听列表失败" });
    } finally {
      setLoadingAll(false);
    }
  };

  const handleLink = async (sessionId: string) => {
    setLinking(true);
    try {
      await api.updateListeningSession(sessionId, { homework_id: homeworkId });
      // 刷新列表
      const updated = await api.getListeningSessionsByHomework(homeworkId);
      setSessions(updated);
      setShowLinkDialog(false);
      toast({ description: "已关联精听练习" });
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "关联失败" });
    } finally {
      setLinking(false);
    }
  };

  return (
    <>
    <div className="mb-6 rounded-lg border bg-gradient-to-br from-sky-50/60 to-cyan-50/40 dark:from-sky-950/20 dark:to-cyan-950/10 p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold flex items-center gap-2">
          🎧 精听练习
        </h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleOpenLink}>
            关联已有
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCreate}>
            <Plus className="h-3.5 w-3.5" />
            创建精听
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">加载中...</p>
      ) : sessions.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无关联的精听练习，可创建或关联已有的</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => router.push(`/listening-practice/${s.id}`)}
              className="w-full flex items-center justify-between gap-3 rounded-md border bg-background p-3 text-left hover:bg-accent transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.title}</p>
                <p className="text-xs text-muted-foreground">
                  {s.sentence_count} 句 · {new Date(s.updated_at).toLocaleDateString("zh-CN")}
                </p>
              </div>
              <span className="text-xs text-sky-600 dark:text-sky-400 shrink-0">查看 →</span>
            </button>
          ))}
        </div>
      )}
    </div>

    {/* 关联已有精听对话框 */}
    <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
      <DialogContent className="sm:max-w-md max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>关联已有精听练习</DialogTitle>
        </DialogHeader>
        {loadingAll ? (
          <div className="py-8 text-center text-muted-foreground text-sm">加载中...</div>
        ) : allSessions.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">没有可关联的精听练习</div>
        ) : (
          <div className="space-y-2 py-2">
            {allSessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleLink(s.id)}
                disabled={linking}
                className="w-full flex items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-accent transition-colors disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.sentence_count} 句 · {new Date(s.updated_at).toLocaleDateString("zh-CN")}
                    {s.homework_id && <span className="ml-1 text-amber-600">（已关联其他作业）</span>}
                  </p>
                </div>
                <span className="text-xs text-sky-600 shrink-0">关联</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
