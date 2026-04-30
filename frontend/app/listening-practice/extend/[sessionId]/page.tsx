"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Check, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PreviewSentence {
  text: string;
  blocker_words: { word: string; start: number; end: number }[];
  note: string;
}

interface PreviewData {
  title: string;
  total_words: number;
  matched_sentences: number;
  orphan_words: string[];
  sentences: PreviewSentence[];
}

export default function ExtendPreviewPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const sessionId = params.sessionId;

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.previewExtensionSession(sessionId)
      .then((data) => setPreview(data))
      .catch((err) => {
        console.error(err);
        toast({ variant: "destructive", description: err instanceof Error ? err.message : "加载失败" });
      })
      .finally(() => setLoading(false));
  }, [sessionId, toast]);

  const handleConfirm = async () => {
    setCreating(true);
    try {
      const newSession = await api.createExtensionSession(sessionId);
      toast({ description: "延伸练习已创建" });
      router.push(`/listening-practice/${newSession.id}`);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "创建失败" });
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          正在匹配来源句...
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">加载失败</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="container mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold truncate">预览延伸练习</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {/* 统计概览 */}
        <div className="mb-6 rounded-lg border bg-gradient-to-br from-rose-50/60 to-pink-50/40 dark:from-rose-950/20 dark:to-pink-950/10 p-4">
          <h2 className="font-semibold text-base mb-2">{preview.title}</h2>
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-white/10 px-2.5 py-1 font-medium border">
              🎯 {preview.total_words} 个障碍词
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-white/10 px-2.5 py-1 font-medium border">
              📝 匹配到 {preview.matched_sentences} 个来源句
            </span>
            {preview.orphan_words.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2.5 py-1 font-medium border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {preview.orphan_words.length} 个未匹配
              </span>
            )}
          </div>
        </div>

        {/* 来源句列表 */}
        <div className="space-y-3 mb-6">
          {preview.sentences.map((sent, idx) => (
            <div key={idx} className="rounded-lg border bg-background p-4">
              <div className="flex items-start gap-2 mb-2">
                <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 text-[10px] font-bold px-1.5 shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <p className="text-sm font-medium leading-relaxed">
                  {renderWithHighlights(sent.text, sent.blocker_words)}
                </p>
              </div>
              <div className="ml-7 flex items-center gap-2 flex-wrap">
                {sent.blocker_words.map((b) => (
                  <span
                    key={b.word}
                    className="inline-flex items-center rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-xs font-medium"
                  >
                    {b.word}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 未匹配的词 */}
        {preview.orphan_words.length > 0 && (
          <div className="mb-6 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              以下词未找到来源句（将作为独立条目列出）
            </p>
            <div className="flex flex-wrap gap-1.5">
              {preview.orphan_words.map((w) => (
                <span key={w} className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 px-2 py-0.5 text-xs">
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-3 sticky bottom-6">
          <Button
            variant="outline"
            size="lg"
            onClick={() => router.back()}
            className="flex-1"
          >
            返回修改
          </Button>
          <Button
            size="lg"
            onClick={handleConfirm}
            disabled={creating}
            className="flex-1 gap-2 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                创建中...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                确认创建
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}

function renderWithHighlights(text: string, blockers: { word: string; start: number; end: number }[]) {
  if (blockers.length === 0) return text;

  // 按 start 排序
  const sorted = [...blockers].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  for (const b of sorted) {
    if (b.start > lastEnd) {
      parts.push(<span key={`t-${lastEnd}`}>{text.slice(lastEnd, b.start)}</span>);
    }
    parts.push(
      <mark key={`h-${b.start}`} className="bg-rose-200/80 dark:bg-rose-700/50 rounded px-0.5 text-foreground font-semibold">
        {text.slice(b.start, b.end)}
      </mark>
    );
    lastEnd = b.end;
  }

  if (lastEnd < text.length) {
    parts.push(<span key={`t-${lastEnd}`}>{text.slice(lastEnd)}</span>);
  }

  return <>{parts}</>;
}
