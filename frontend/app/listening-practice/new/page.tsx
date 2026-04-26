"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Headphones, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function NewListeningPracticePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [rawSentences, setRawSentences] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const sentences = useMemo(() => {
    return rawSentences
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }, [rawSentences]);

  const canSubmit = title.trim().length > 0 && sentences.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const session = await api.createListeningSession({
        title: title.trim(),
        note: note.trim() || undefined,
        sentences,
      });
      toast({ description: "创建成功，开始标记障碍词" });
      router.push(`/listening-practice/${session.id}`);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "创建失败，请重试" });
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="container mx-auto px-4 h-14 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Headphones className="h-5 w-5 text-sky-500" />
            新建听力精听
          </h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium block mb-1.5">
              练习标题 <span className="text-rose-500">*</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：C18 Test 2 Section 3 错题精听"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">备注（可选）</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：今天下午的套题，Section 3 错了 4 题"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium">
                答案句 <span className="text-rose-500">*</span>
              </label>
              <span className="text-xs text-muted-foreground">
                已识别 <span className="font-bold text-sky-600">{sentences.length}</span> 句
              </span>
            </div>
            <Textarea
              value={rawSentences}
              onChange={(e) => setRawSentences(e.target.value)}
              placeholder={`每行一个答案句，支持粘贴整段。例如：\n\nThe library is located behind the main building.\nYou need to present your student card at the reception.\nOpening hours are extended during the exam period.`}
              rows={10}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1.5">
              <Sparkles className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                建议只贴出错题所在的答案句；下一步可在页面上点选单词来标记障碍词。
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button variant="outline" onClick={() => router.back()} className="flex-1">
              取消
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white"
            >
              {submitting ? "创建中..." : "创建并开始标记"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
