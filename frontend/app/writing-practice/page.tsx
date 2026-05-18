"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { WritingTemplate, WritingTemplateStats, WritingTemplateCheckResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CheckCircle, XCircle,
  ChevronRight, Loader2, Eye,
} from "lucide-react";

const CATEGORY_MAP: Record<string, { label: string; emoji: string; color: string }> = {
  data: { label: "数据描述", emoji: "📊", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  map: { label: "地图题", emoji: "🗺️", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  process: { label: "流程图", emoji: "🔄", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  essay: { label: "大作文", emoji: "✍️", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
};

const MASTERY_LABELS = ["新", "模糊", "认识", "熟练"];
const MASTERY_COLORS = ["bg-gray-200 text-gray-700", "bg-amber-100 text-amber-700", "bg-sky-100 text-sky-700", "bg-emerald-100 text-emerald-700"];

type MainTab = "template" | "material" | "speaking";
type TemplateSubTab = "daily" | "dictation" | "flashcard" | "library" | "stats" | "breakdown";
type MaterialSubTab = "m-daily" | "m-flashcard" | "m-dictation" | "m-library" | "m-stats" | "m-downgrade";
type SpeakingSubTab = "s-today" | "s-material" | "s-material-lib" | "s-add" | "s-phrases" | "s-passed" | "s-stats";

export default function WritingPracticePage() {
  const router = useRouter();
  useToast(); // available for child components
  const [mainTab, setMainTab] = useState<MainTab>("template");
  const [templateSub, setTemplateSub] = useState<TemplateSubTab>("daily");
  const [materialSub, setMaterialSub] = useState<MaterialSubTab>("m-daily");
  const [speakingSub, setSpeakingSub] = useState<SpeakingSubTab>("s-today");
  const [stats, setStats] = useState<WritingTemplateStats | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const s = await api.getWritingTemplateStats();
      setStats(s);
    } catch {}
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const templateSubTabs = [
    { key: "daily" as const, label: "今日任务", icon: "📋" },
    { key: "flashcard" as const, label: "闪卡复习", icon: "🃏" },
    { key: "dictation" as const, label: "默写测试", icon: "✏️" },
    { key: "breakdown" as const, label: "范文拆解", icon: "📖" },
    { key: "library" as const, label: "句型库", icon: "📚" },
    { key: "stats" as const, label: "统计", icon: "📈" },
  ];

  const materialSubTabs = [
    { key: "m-daily" as const, label: "今日学习", icon: "📋" },
    { key: "m-flashcard" as const, label: "闪卡复习", icon: "🃏" },
    { key: "m-dictation" as const, label: "默写测试", icon: "✏️" },
    { key: "m-downgrade" as const, label: "降级练习", icon: "⬇️" },
    { key: "m-library" as const, label: "素材库", icon: "📚" },
    { key: "m-stats" as const, label: "统计", icon: "📈" },
  ];

  const speakingSubTabs = [
    { key: "s-today" as const, label: "今日复习", icon: "🎤" },
    { key: "s-material" as const, label: "素材背诵", icon: "📝" },
    { key: "s-material-lib" as const, label: "素材库", icon: "📚" },
    { key: "s-add" as const, label: "录入", icon: "➕" },
    { key: "s-phrases" as const, label: "降级表达", icon: "💬" },
    { key: "s-passed" as const, label: "已过关", icon: "✅" },
    { key: "s-stats" as const, label: "统计", icon: "📈" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="container mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            ✍️ 句型·素材·口语
          </h1>
          {stats && mainTab === "template" && (
            <span className="ml-auto text-xs text-muted-foreground">
              {stats.mastered}/{stats.total} 已掌握 · 今日待复习 {stats.due_today} · 明日 {stats.tomorrow_due ?? 0}
            </span>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 max-w-3xl">
        {/* 大 Tab 切换 */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setMainTab("template")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              mainTab === "template"
                ? "bg-orange-500 text-white shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            📝 句型背诵
          </button>
          <button
            onClick={() => setMainTab("material")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              mainTab === "material"
                ? "bg-purple-500 text-white shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            💡 素材背诵
          </button>
          <button
            onClick={() => setMainTab("speaking")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              mainTab === "speaking"
                ? "bg-emerald-500 text-white shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            🎤 口语纠错
          </button>
        </div>

        {/* 子 Tab bar */}
        {mainTab === "template" && (
          <>
            <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
              {templateSubTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTemplateSub(t.key)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    templateSub === t.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            {templateSub === "daily" && <DailyTab onUpdate={fetchStats} />}
            {templateSub === "dictation" && <DictationTab onUpdate={fetchStats} />}
            {templateSub === "flashcard" && <FlashcardTab onUpdate={fetchStats} />}
            {templateSub === "breakdown" && <BreakdownTab />}
            {templateSub === "library" && <LibraryTab />}
            {templateSub === "stats" && stats && <StatsTab stats={stats} />}
          </>
        )}

        {mainTab === "material" && (
          <>
            <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
              {materialSubTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setMaterialSub(t.key)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    materialSub === t.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            <MaterialTab subTab={materialSub} />
          </>
        )}

        {mainTab === "speaking" && (
          <>
            <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
              {speakingSubTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setSpeakingSub(t.key)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    speakingSub === t.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            <SpeakingTab subTab={speakingSub} onSwitchToAdd={() => setSpeakingSub("s-add")} />
          </>
        )}
      </main>
    </div>
  );
}

// ─── Typing Practice Component (纯前端，不存后端) ─────────────

function TypingPractice({ target, label }: { target: string; label?: string }) {
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (!target) return null;

  const targetWords = target.trim().split(/\s+/);
  const inputWords = input.trim().split(/\s+/);

  const handleSubmit = () => {
    if (input.trim()) setSubmitted(true);
  };

  const handleReset = () => {
    setInput("");
    setSubmitted(false);
  };

  return (
    <div className="mt-2 space-y-1.5">
      {!submitted ? (
        <>
          {label && <p className="text-[10px] text-muted-foreground">{label}</p>}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); handleSubmit(); } }}
              placeholder="对着上面英文敲一遍..."
              className="flex-1 text-xs border rounded px-2 py-1.5 font-mono bg-background"
            />
            <button onClick={handleSubmit} disabled={!input.trim()}
              className="text-xs px-2 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50">
              检查
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-1">
          <div className="text-xs font-mono flex flex-wrap gap-x-1 leading-relaxed">
            {targetWords.map((word, i) => {
              const typed = inputWords[i] || "";
              const correct = typed.toLowerCase() === word.toLowerCase();
              const missing = !typed;
              return (
                <span key={i} className={missing ? "text-muted-foreground/40 underline decoration-dashed" : correct ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400 line-through"}>
                  {missing ? word : typed}
                  {!correct && !missing && <span className="text-emerald-600 dark:text-emerald-400 no-underline ml-0.5">[{word}]</span>}
                </span>
              );
            })}
            {inputWords.length > targetWords.length && inputWords.slice(targetWords.length).map((w, i) => (
              <span key={`extra-${i}`} className="text-red-400 line-through">{w}</span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {targetWords.filter((w, i) => inputWords[i]?.toLowerCase() === w.toLowerCase()).length}/{targetWords.length} 正确
            </span>
            <button onClick={handleReset} className="text-[10px] text-primary hover:underline">再练一次</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Daily Tab ────────────────────────────────────────────

function DailyTab({ onUpdate }: { onUpdate: () => void }) {
  const [dueItems, setDueItems] = useState<WritingTemplate[]>([]);
  const [newItems, setNewItems] = useState<WritingTemplate[]>([]);
  const [learnedItems, setLearnedItems] = useState<WritingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [due, newT, learned] = await Promise.all([
        api.getWritingTemplatesDue(15),
        api.getWritingTemplatesNew(5),
        api.getWritingTemplatesLearned(),
      ]);
      setDueItems(due);
      setNewItems(newT);
      setLearnedItems(learned);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleMarkSeen = async (item: WritingTemplate) => {
    await api.reviewWritingTemplate(item.id, 2);
    setNewItems((prev) => prev.filter((t) => t.id !== item.id));
    setLearnedItems((prev) => [{ ...item, mastery_level: 1, review_count: 1 }, ...prev]);
    toast({ description: "已标记为学过，明天复习" });
    onUpdate();
  };

  const [loadingMore, setLoadingMore] = useState(false);

  const handleLearnMore = async () => {
    setLoadingMore(true);
    try {
      // Force get more new items by passing a larger limit
      const all = await api.getWritingTemplates();
      const unlearned = all.filter((t) => t.review_count === 0).slice(0, 5);
      if (unlearned.length === 0) {
        toast({ description: "所有句型都学过了！" });
      } else {
        setNewItems(unlearned);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground animate-pulse">加载中...</div>;

  const allDone = dueItems.length === 0 && newItems.length === 0;

  return (
    <div className="space-y-6">
      {/* All done — learn more prompt */}
      {allDone && (
        <div className="rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20 p-6 text-center space-y-3">
          <p className="text-2xl">🎉</p>
          <p className="text-sm font-medium">今日任务全部完成！</p>
          <p className="text-xs text-muted-foreground">今日新学 {learnedItems.filter(t => t.first_learned_at ? new Date(t.first_learned_at).getTime() >= new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime() : t.interval_days <= 2).length} 条 · 还有余力可以再来一组</p>
          <Button
            variant="outline"
            onClick={handleLearnMore}
            disabled={loadingMore}
            className="gap-1.5"
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            再学一组（5条）
          </Button>
        </div>
      )}

      {/* New today */}
      <section>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          📖 待学新句型 <Badge variant="outline" className="text-xs">{newItems.length}</Badge>
        </h2>
        {newItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">今日新句型已全部学过</p>
        ) : (
          <div className="space-y-2">
            {newItems.map((item) => (
              <div key={item.id} className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={CATEGORY_MAP[item.category]?.color || ""} variant="outline">
                    {CATEGORY_MAP[item.category]?.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{item.sub_category}</span>
                </div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">🎯 {item.scene_cn}</p>
                <p className="text-sm font-mono bg-muted/50 rounded p-2">{item.template_en}</p>
                {(item as any).template_cn && <p className="text-xs text-muted-foreground">📝 {(item as any).template_cn}</p>}
                {item.example_en && <p className="text-xs text-muted-foreground italic">例：{item.example_en}</p>}
                {item.example_en && <TypingPractice target={item.example_en} label="⌨️ 对着例句敲一遍" />}
                {item.note && <p className="text-xs text-muted-foreground">💡 {item.note}</p>}
                <Button size="sm" variant="outline" onClick={() => handleMarkSeen(item)} className="gap-1">
                  <CheckCircle className="h-3.5 w-3.5" /> 已看，加入复习
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Due review */}
      <section>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          🔄 待复习 <Badge variant="outline" className="text-xs">{dueItems.length}</Badge>
        </h2>
        {dueItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">今日无待复习句型 🎉 去「默写测试」或「闪卡复习」巩固吧</p>
        ) : (
          <div className="space-y-2">
            {dueItems.map((item) => (
              <TemplateCard key={item.id} item={item} showScene />
            ))}
          </div>
        )}
      </section>

      {/* Learned today — split into new vs reviewed */}
      {learnedItems.length > 0 && (() => {
        // first_learned_at 在今天 → 今日新学；否则 → 今日复习（历史已学的）
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const isNewToday = (t: WritingTemplate) => {
          if (t.first_learned_at) {
            return new Date(t.first_learned_at).getTime() >= todayStart;
          }
          // fallback for old data without first_learned_at
          return t.interval_days <= 2;
        };
        const todayNew = learnedItems.filter(isNewToday);
        const todayReviewed = learnedItems.filter((t) => !isNewToday(t));
        return (
          <>
            {todayNew.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  ✅ 今日已学 <Badge variant="outline" className="text-xs">{todayNew.length}</Badge>
                </h2>
                <div className="space-y-2">
                  {todayNew.map((item) => (
                    <TemplateCard key={item.id} item={item} showScene />
                  ))}
                </div>
              </section>
            )}
            {todayReviewed.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  🔁 今日已复习 <Badge variant="outline" className="text-xs">{todayReviewed.length}</Badge>
                </h2>
                <div className="space-y-2">
                  {todayReviewed.map((item) => (
                    <TemplateCard key={item.id} item={item} showScene />
                  ))}
                </div>
              </section>
            )}
          </>
        );
      })()}
    </div>
  );
}

// ─── Dictation Tab (中译英默写) ──────────────────────────

function DictationTab({ onUpdate }: { onUpdate: () => void }) {
  const [queue, setQueue] = useState<WritingTemplate[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<WritingTemplateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [tomorrowDue, setTomorrowDue] = useState(0);
  const [showHint, setShowHint] = useState(false);

  // 填空模式状态
  const [blankInfo, setBlankInfo] = useState<import("@/types").BlankSlotsInfo | null>(null);
  const [blankLoading, setBlankLoading] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setFinished(false);
    const [due, stats] = await Promise.all([
      api.getWritingTemplatesDue(50),
      api.getWritingTemplateStats(),
    ]);
    const eligible = due.filter((t) => t.mastery_level >= 2);
    setQueue(eligible);
    setTomorrowDue(stats.tomorrow_due_dictation ?? stats.tomorrow_due ?? 0);
    setIdx(0);
    setInput("");
    setResult(null);
    setBlankInfo(null);
    setLoading(false);
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const current = queue[idx];
  const isFillMode = current?.mastery_level === 2;

  // 填空模式：加载 blank slots 信息
  useEffect(() => {
    if (!current || !isFillMode) { setBlankInfo(null); return; }
    setBlankLoading(true);
    api.getWritingTemplateBlankSlots(current.id)
      .then(setBlankInfo)
      .catch(() => setBlankInfo(null))
      .finally(() => setBlankLoading(false));
  }, [current?.id, isFillMode]);

  const handleSubmit = async () => {
    if (!current || !input.trim() || checking) return;
    setChecking(true);
    try {
      const slotIdx = isFillMode && blankInfo ? blankInfo.current_slot_index : undefined;
      const res = await api.checkWritingTemplate(current.id, input.trim(), isFillMode ? "fill" : "full", slotIdx);
      setResult(res);
      setSessionStats((s) => ({ correct: s.correct + (res.correct ? 1 : 0), total: s.total + 1 }));
      onUpdate();
    } catch {
    } finally {
      setChecking(false);
    }
  };

  const handleNext = () => {
    if (idx < queue.length - 1) {
      setIdx(idx + 1);
      setInput("");
      setResult(null);
      setBlankInfo(null);
      setShowHint(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    } else {
      setFinished(true);
    }
  };

  const handleReveal = async () => {
    if (!current) return;
    await api.reviewWritingTemplate(current.id, 0);
    setResult({
      correct: false, score: 0, expected: current.template_en,
      feedback: "已跳过，回到复习队列", mastery_level: 0, interval_days: 1,
    });
    setSessionStats((s) => ({ ...s, total: s.total + 1 }));
    onUpdate();
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground animate-pulse">加载中...</div>;
  if (queue.length === 0) return (
    <div className="py-12 text-center text-muted-foreground space-y-2">
      <p className="text-lg">📝</p>
      <p>暂无待默写句型</p>
      <p className="text-xs">需要 mastery ≥ 2 的句型到期才会出现在这里</p>
      {tomorrowDue > 0 && <p className="text-xs">明日将有 <span className="font-bold text-indigo-600">{tomorrowDue}</span> 条到期默写</p>}
    </div>
  );

  if (finished) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-2xl">🎉</p>
        <p className="text-sm font-medium">本轮默写全部完成！</p>
        <p className="text-xs text-muted-foreground">
          ✅ {sessionStats.correct}/{sessionStats.total} 正确 · 明日待复习 {tomorrowDue} 条
        </p>
        <Button variant="outline" onClick={() => { setSessionStats({ correct: 0, total: 0 }); loadQueue(); }} className="gap-1">
          再来一轮
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{idx + 1}/{queue.length}</span>
        <span>✅ {sessionStats.correct}/{sessionStats.total}</span>
      </div>

      {/* Question card */}
      <div className="rounded-xl border-2 bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Badge className={CATEGORY_MAP[current.category]?.color || ""} variant="outline">
            {CATEGORY_MAP[current.category]?.emoji} {CATEGORY_MAP[current.category]?.label}
          </Badge>
          <span className="text-xs text-muted-foreground">{current.sub_category}</span>
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
            isFillMode
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
          }`}>
            {isFillMode ? `填空 ${blankInfo ? `${blankInfo.slots_passed_count + 1}/${blankInfo.slots_total}` : ""}` : "完整默写"}
          </span>
        </div>
        <p className="text-base font-semibold">🎯 {current.scene_cn}</p>
        {(current as any).scene_detail && (
          <p className="text-sm text-muted-foreground">📋 {(current as any).scene_detail}</p>
        )}

        {/* 主语英文提示：默写时直接给出的关键词（从数据库读取） */}
        {(current as any).subject_hint && (
          <div className="flex flex-wrap gap-2 mt-1">
            {(current as any).subject_hint.split(";").map((hint: string, i: number) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border border-sky-200/50 dark:border-sky-800/30">
                🔑 <span className="font-medium">{hint.trim()}</span>
              </span>
            ))}
          </div>
        )}

        {/* 提示按钮（折叠）- 显示完整例句 */}
        {!result && (current.example_en || current.note) && (
          <div>
            {!showHint ? (
              <button onClick={() => setShowHint(true)} className="text-xs text-primary hover:underline">
                💡 看提示
              </button>
            ) : (
              <div className="space-y-2 bg-muted/50 rounded p-3">
                {/* 显示完整例句 */}
                {current.example_en && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">完整例句参考：</p>
                    <p className="text-xs text-foreground/80 italic">
                      例：{current.example_en}
                    </p>
                  </div>
                )}

                {/* 显示备注 */}
                {current.note && (
                  <p className="text-xs text-muted-foreground pt-1 border-t border-muted-foreground/10">
                    💡 {current.note}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* 填空模式：显示带空的句型 */}
        {isFillMode && (
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            {blankLoading ? (
              <p className="text-xs text-muted-foreground animate-pulse">加载填空信息...</p>
            ) : blankInfo ? (
              <>
                <p className="text-sm font-mono leading-relaxed">{blankInfo.template_with_blank}</p>
                <p className="text-xs text-muted-foreground">
                  💡 填写 ______ 处的内容 · 提示：{blankInfo.current_slot_hint}
                </p>
                {/* 已通过的 slots 标记 */}
                <div className="flex gap-1.5">
                  {blankInfo.slots.map((s) => (
                    <span key={s.index} className={`text-[10px] px-1.5 py-0.5 rounded ${
                      s.passed
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : s.index === blankInfo.current_slot_index
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-blue-300"
                          : "bg-muted text-muted-foreground"
                    }`}>
                      {s.passed ? "✓" : s.index === blankInfo.current_slot_index ? "→" : "○"} {s.hint}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">提示：写出该场景对应的英文句型核心结构</p>
            )}
          </div>
        )}
        {/* Input */}
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); handleSubmit(); } }}
          placeholder={isFillMode ? "填写被遮挡部分... (回车提交)" : "输入完整英文句型... (回车提交)"}
          rows={isFillMode ? 1 : 2}
          className="font-mono text-sm"
          disabled={!!result}
        />

        {/* Actions */}
        {!result ? (
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={!input.trim() || checking} className="gap-1 flex-1">
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              提交判分
            </Button>
            <Button variant="ghost" onClick={handleReveal} className="gap-1 text-muted-foreground">
              <Eye className="h-4 w-4" /> 看答案
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Result feedback */}
            <div className={`rounded-lg p-3 ${result.correct ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800" : "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"}`}>
              <div className="flex items-center gap-2 mb-1">
                {result.correct
                  ? <CheckCircle className="h-4 w-4 text-emerald-600" />
                  : <XCircle className="h-4 w-4 text-red-600" />}
                <span className={`text-sm font-semibold ${result.correct ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                  {result.correct ? `正确！${result.score}分` : `未通过 ${result.score}分`}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  下次复习: {result.interval_days}天后
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{result.feedback}</p>
            </div>

            {/* Show expected */}
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">标准答案：</p>
              {result.expected.split('\n').map((line, i) => (
                <p key={i} className={`text-sm font-mono ${i > 0 ? 'mt-1 text-muted-foreground' : ''}`}>{line}</p>
              ))}
            </div>

            <Button onClick={handleNext} className="w-full gap-1">
              下一题 <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Flashcard Tab (认知测试) ─────────────────────────────

function FlashcardTab({ onUpdate }: { onUpdate: () => void }) {
  const [mode, setMode] = useState<"sentence" | "vocab">("sentence");
  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-2">
        <button onClick={() => setMode("sentence")} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${mode === "sentence" ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground"}`}>
          📝 句型闪卡
        </button>
        <button onClick={() => setMode("vocab")} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${mode === "vocab" ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground"}`}>
          🔤 句型词汇
        </button>
      </div>
      {mode === "sentence" ? <SentenceFlashcard onUpdate={onUpdate} /> : <VocabFlashcard />}
    </div>
  );
}

function MaterialKeywordFlashcard() {
  const [queue, setQueue] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      const due = await api.getWritingMaterialKeywordsDue(20);
      setQueue(due);
      setLoading(false);
      if (due.length === 0) setFinished(true);
    })();
  }, []);

  if (loading) return <div className="py-12 text-center text-muted-foreground animate-pulse">加载中...</div>;
  if (finished || queue.length === 0) return <div className="py-12 text-center"><p className="text-2xl">✅</p><p className="text-sm text-muted-foreground mt-2">暂无待复习的素材关键词</p></div>;

  const current = queue[idx];
  if (!current) return null;

  const handleReview = async (quality: number) => {
    await api.reviewWritingMaterialKeyword(current.id, quality);
    if (idx + 1 >= queue.length) { setFinished(true); } else { setIdx(idx + 1); setFlipped(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground text-center">{idx + 1} / {queue.length}</p>
      <div
        onClick={() => setFlipped(!flipped)}
        className="rounded-xl border-2 bg-card p-8 min-h-[180px] flex flex-col items-center justify-center cursor-pointer select-none transition-all hover:shadow-md"
      >
        {!flipped ? (
          <>
            <p className="text-xl font-bold text-center">{current.cn}</p>
            <p className="text-xs text-muted-foreground mt-4">👆 回忆英文，点击翻面</p>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-2">{current.cn}</p>
            <p className="text-2xl font-bold text-primary text-center">{current.en}</p>
            {current.level === "advanced" && (
              <span className="text-xs text-amber-500 mt-2">⭐ 进阶词汇</span>
            )}
          </>
        )}
      </div>
      {flipped && (
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 gap-1 border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleReview(0)}>
            <XCircle className="h-4 w-4" /> 不会
          </Button>
          <Button variant="outline" className="flex-1 gap-1 border-amber-200 text-amber-600 hover:bg-amber-50" onClick={() => handleReview(1)}>
            🤔 模糊
          </Button>
          <Button variant="outline" className="flex-1 gap-1 border-emerald-200 text-emerald-600 hover:bg-emerald-50" onClick={() => handleReview(3)}>
            <CheckCircle className="h-4 w-4" /> 会了
          </Button>
        </div>
      )}
    </div>
  );
}

function SentenceFlashcard({ onUpdate }: { onUpdate: () => void }) {
  const [queue, setQueue] = useState<WritingTemplate[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });
  const [tomorrowDue, setTomorrowDue] = useState(0);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setFinished(false);
    const [due, stats] = await Promise.all([
      api.getWritingTemplatesDue(50),
      api.getWritingTemplateStats(),
    ]);
    // 闪卡复习 mastery_level 1-2（1=首次看英文，2=看场景回忆英文）
    const eligible = due.filter((t) => t.mastery_level >= 1 && t.mastery_level <= 2);
    setQueue(eligible);
    const flashcardTomorrow = (stats.tomorrow_due ?? 0) - (stats.tomorrow_due_dictation ?? 0);
    setTomorrowDue(flashcardTomorrow >= 0 ? flashcardTomorrow : stats.tomorrow_due ?? 0);
    setIdx(0);
    setFlipped(false);
    setLoading(false);
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const current = queue[idx];

  const handleMark = async (quality: number) => {
    if (!current) return;
    await api.reviewWritingTemplate(current.id, quality);
    setSessionStats((s) => ({ correct: s.correct + (quality >= 2 ? 1 : 0), total: s.total + 1 }));
    onUpdate();
    if (idx < queue.length - 1) {
      setIdx(idx + 1);
      setFlipped(false);
    } else {
      setFinished(true);
    }
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground animate-pulse">加载中...</div>;
  if (queue.length === 0) return (
    <div className="py-12 text-center text-muted-foreground space-y-2">
      <p>暂无到期复习的句型 ✓</p>
      <p className="text-xs">明日将有 <span className="font-bold text-indigo-600">{tomorrowDue}</span> 条到期复习</p>
    </div>
  );

  if (finished) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-2xl">🎉</p>
        <p className="text-sm font-medium">本轮闪卡全部完成！</p>
        <p className="text-xs text-muted-foreground">
          ✅ {sessionStats.correct}/{sessionStats.total} 正确 · 明日待复习 {tomorrowDue} 条
        </p>
        <Button variant="outline" onClick={() => { setSessionStats({ correct: 0, total: 0 }); loadQueue(); }} className="gap-1">
          再来一轮
        </Button>
      </div>
    );
  }

  // mastery=1: 正面英文 → 翻面看场景
  // mastery>=2: 正面场景描述 → 翻面看英文
  const isFirstTime = current.mastery_level <= 1;
  const sceneText = (current as any).scene_detail || current.scene_cn;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{idx + 1}/{queue.length}</span>
        <span>✅ {sessionStats.correct}/{sessionStats.total}</span>
      </div>

      <div
        onClick={() => !flipped && setFlipped(true)}
        className={`rounded-xl border-2 bg-card p-6 min-h-[200px] flex flex-col justify-center transition-all cursor-pointer ${
          !flipped ? "hover:shadow-lg hover:-translate-y-0.5" : ""
        }`}
      >
        {!flipped ? (
          // Front
          <div className="text-center space-y-3">
            <Badge className={CATEGORY_MAP[current.category]?.color || ""} variant="outline">
              {CATEGORY_MAP[current.category]?.emoji} {CATEGORY_MAP[current.category]?.label}
            </Badge>
            {isFirstTime ? (
              <>
                <p className="text-lg font-mono leading-relaxed">{current.template_en}</p>
                <p className="text-xs text-muted-foreground">👆 点击翻转查看使用场景</p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-1">🎯 场景</p>
                <p className="text-base font-medium leading-relaxed">{sceneText}</p>
                <p className="text-xs text-muted-foreground">👆 根据场景回忆英文句型，点击查看答案</p>
              </>
            )}
          </div>
        ) : (
          // Back
          <div className="space-y-3">
            <p className="text-base font-semibold text-amber-700 dark:text-amber-300">🎯 场景：{sceneText}</p>
            <p className="text-sm font-mono bg-muted/50 rounded p-2">{current.template_en}</p>
            {(current as any).template_cn && <p className="text-xs text-muted-foreground">📝 {(current as any).template_cn}</p>}
            {current.example_en && <p className="text-xs text-muted-foreground italic">例：{current.example_en}</p>}
            {current.note && <p className="text-xs text-muted-foreground">💡 {current.note}</p>}
            {current.example_en && <TypingPractice target={current.example_en} label="⌨️ 敲一遍例句" />}
          </div>
        )}
      </div>

      {flipped && (
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 gap-1 border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleMark(0)}>
            <XCircle className="h-4 w-4" /> 不会
          </Button>
          <Button variant="outline" className="flex-1 gap-1 border-amber-200 text-amber-600 hover:bg-amber-50" onClick={() => handleMark(1)}>
            🤔 模糊
          </Button>
          <Button variant="outline" className="flex-1 gap-1 border-emerald-200 text-emerald-600 hover:bg-emerald-50" onClick={() => handleMark(3)}>
            <CheckCircle className="h-4 w-4" /> 会了
          </Button>
        </div>
      )}
    </div>
  );
}

function VocabFlashcard() {
  const [pending, setPending] = useState<any[]>([]);
  const [reviewed, setReviewed] = useState<any[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [seeding, setSeeding] = useState(false);

  const fetchToday = useCallback(async () => {
    try {
      const data = await api.getTemplateVocabToday();
      setPending(data.pending);
      setReviewed(data.reviewed);
      setTotalActive(data.total_active);
      setCurrentIdx(0);
      setFlipped(false);
    } catch {
      if (totalActive === 0) {
        setSeeding(true);
        try {
          await api.seedTemplateVocab();
          const data2 = await api.getTemplateVocabToday();
          setPending(data2.pending);
          setReviewed(data2.reviewed);
          setTotalActive(data2.total_active);
        } catch {}
        setSeeding(false);
      }
    } finally { setLoading(false); }
  }, [totalActive]);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  const current = pending[currentIdx];

  const handleReview = async (result: string) => {
    if (!current) return;
    await api.reviewTemplateVocab(current.id, result);
    setFlipped(false);
    // Move reviewed item from pending to reviewed locally
    setReviewed(prev => [...prev, current]);
    if (currentIdx < pending.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      // 本批次全部完成，清空 pending 显示完成界面
      setPending([]);
    }
  };

  if (loading || seeding) return <div className="text-center py-10 text-muted-foreground animate-pulse">{seeding ? "初始化词库..." : "加载中..."}</div>;

  if (pending.length === 0 && totalActive === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-3xl">🔤</p>
        <p className="text-muted-foreground">词库为空</p>
        <button onClick={async () => { setSeeding(true); await api.seedTemplateVocab(); fetchToday(); setSeeding(false); }}
          className="text-sm text-primary hover:underline">导入句型关键词汇</button>
      </div>
    );
  }

  if (pending.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-3xl">✅</p>
        <p className="font-semibold">今日词汇复习完成！</p>
        <p className="text-sm text-muted-foreground">已复习 {reviewed.length} 条 · 总活跃 {totalActive} 条</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
        <span>今日 <strong className="text-foreground">{currentIdx + 1}/{pending.length}</strong></span>
        <span>已过 <strong className="text-foreground">{reviewed.length}</strong></span>
        <span>活跃 <strong className="text-foreground">{totalActive}</strong></span>
      </div>

      {current && (
        <div
          onClick={() => setFlipped(!flipped)}
          className="rounded-xl border-2 bg-card p-8 min-h-[200px] flex flex-col items-center justify-center cursor-pointer select-none transition-all hover:shadow-md"
        >
          {!flipped ? (
            <>
              <span className="text-[10px] text-muted-foreground mb-3">{CATEGORY_MAP[current.category]?.label || current.category}</span>
              <p className="text-xl font-bold text-center">{current.meaning_cn}</p>
              {current.example_sentence && (() => {
                // Replace the word and its common forms with blank
                const word = current.word_en;
                const pattern = new RegExp(word.replace(/ed$|ing$|s$|ly$/, '') + '\\w*', 'gi');
                const hint = current.example_sentence.replace(pattern, '______');
                return hint !== current.example_sentence ? (
                  <p className="text-[10px] text-muted-foreground mt-2 italic text-center max-w-xs">{hint}</p>
                ) : null;
              })()}
              <p className="text-xs text-muted-foreground mt-3">👆 回忆英文单词，点击翻面</p>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">{current.meaning_cn}</p>
              <p className="text-2xl font-bold text-primary text-center">{current.word_en}</p>
              {current.example_sentence && (
                <p className="text-xs text-muted-foreground mt-3 italic text-center max-w-sm">{current.example_sentence}</p>
              )}
              {current.streak_days > 0 && (
                <span className="text-xs text-orange-500 mt-2">🔥 连续 {current.streak_days} 天</span>
              )}
            </>
          )}
        </div>
      )}

      {flipped && (
        <div className="flex gap-3">
          <button onClick={() => handleReview("fluent")}
            className="flex-1 py-3 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors">
            ✓ 1秒内说出
          </button>
          <button onClick={() => handleReview("hesitant")}
            className="flex-1 py-3 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">
            ✗ 想不起来
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Breakdown Tab (范文拆解) ─────────────────────────────

function BreakdownTab() {
  const [breakdowns, setBreakdowns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getSampleBreakdowns();
        setBreakdowns(data);
        if (data.length > 0) setSelectedId(data[0].id);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="py-12 text-center text-muted-foreground animate-pulse">加载中...</div>;

  const current = breakdowns.find((b: any) => b.id === selectedId);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">完整范文拆解：看句型如何组合成一篇完整答案</p>

      {/* Selector */}
      <div className="flex flex-wrap gap-2">
        {breakdowns.map((b: any) => (
          <button
            key={b.id}
            onClick={() => setSelectedId(b.id)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              selectedId === b.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
            }`}
          >
            {b.category === "map" ? "🗺️" : "🔄"} {b.title.replace(/.*拆解：/, "")}
          </button>
        ))}
      </div>

      {/* Content */}
      {current && (
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-sm font-medium">{current.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{current.description}</p>
          </div>

          {current.paragraphs.map((para: any, pi: number) => (
            <div key={pi} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded">
                  {para.label}
                </span>
              </div>
              {para.sentences.map((s: any, si: number) => (
                <div key={si} className="rounded-lg border bg-card p-3 space-y-2">
                  <p className="text-sm font-medium text-sky-700 dark:text-sky-400 leading-relaxed">{s.text}</p>
                  {s.template_en && (
                    <div className="rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-2.5 py-1.5">
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mb-0.5">📐 句型模板</p>
                      <p className="text-xs font-mono text-amber-800 dark:text-amber-300">{s.template_en}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-700 dark:text-purple-400">
                      🏷️ {s.template_scene}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">💬 {s.role}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Library Tab ──────────────────────────────────────────

function LibraryTab() {
  const [items, setItems] = useState<WritingTemplate[]>([]);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getWritingTemplates(category || undefined)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [category]);

  return (
    <div className="space-y-4">
      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategory("")}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${!category ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          全部
        </button>
        {Object.entries(CATEGORY_MAP).map(([key, { label, emoji }]) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${category === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center text-muted-foreground animate-pulse">加载中...</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <TemplateCard key={item.id} item={item} showScene onUpdate={(updated) => setItems(prev => prev.map(t => t.id === updated.id ? updated : t))} />
          ))}
          <p className="text-xs text-muted-foreground text-center pt-2">共 {items.length} 条</p>
        </div>
      )}
    </div>
  );
}

// ─── Stats Tab ────────────────────────────────────────────

function StatsTab({ stats }: { stats: WritingTemplateStats }) {
  const total = stats.total || 1;
  const pct = Math.round((stats.mastered / total) * 100);

  // Week plan order
  const weekPlan = [
    { cat: "data", week: "Week 1-2", label: "数据描述", emoji: "📊" },
    { cat: "map", week: "Week 3", label: "地图题", emoji: "🗺️" },
    { cat: "process", week: "Week 3", label: "流程图", emoji: "🔄" },
    { cat: "essay", week: "Week 4", label: "大作文", emoji: "✍️" },
  ];

  return (
    <div className="space-y-6">
      {/* Overall */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-semibold text-sm">总体进度</h3>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div><div className="text-2xl font-bold">{stats.total}</div><div className="text-[10px] text-muted-foreground">总句型</div></div>
          <div><div className="text-2xl font-bold text-emerald-600">{stats.mastered}</div><div className="text-[10px] text-muted-foreground">已掌握</div></div>
          <div><div className="text-2xl font-bold text-amber-600">{stats.learning}</div><div className="text-[10px] text-muted-foreground">学习中</div></div>
          <div><div className="text-2xl font-bold text-sky-600">{stats.due_today}</div><div className="text-[10px] text-muted-foreground">今日待复习</div></div>
          <div><div className="text-2xl font-bold text-indigo-600">{stats.tomorrow_due ?? 0}</div><div className="text-[10px] text-muted-foreground">明日待复习</div></div>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground text-center">{pct}% 掌握率 · 今日新学 {stats.learned_today} 条</p>
      </div>

      {/* Week plan progress */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-semibold text-sm">背诵计划进度</h3>
        <div className="space-y-3">
          {weekPlan.map(({ cat, week, label, emoji }) => {
            const data = stats.category_stats[cat];
            if (!data) return null;
            const learned = data.total - data.remaining_new;
            const catPct = data.total > 0 ? Math.round((learned / data.total) * 100) : 0;
            const isDone = data.remaining_new === 0;
            const isCurrent = data.remaining_new > 0 && weekPlan.findIndex((w) => (stats.category_stats[w.cat]?.remaining_new || 0) > 0) === weekPlan.indexOf(weekPlan.find((w) => w.cat === cat)!);
            return (
              <div key={cat} className={`rounded-lg p-3 ${isCurrent ? "bg-primary/5 border border-primary/20" : "bg-muted/30"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{emoji} {label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{week}</span>
                    {isDone && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">已完成</Badge>}
                    {isCurrent && <Badge className="bg-primary/20 text-primary text-[10px]">进行中</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${catPct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-14 text-right">{learned}/{data.total}</span>
                </div>
                {data.remaining_new > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">剩余 {data.remaining_new} 条未学 · {data.mastered} 已掌握</p>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          按 数据描述 → 地图题 → 流程图 → 大作文 的顺序推送，每个分类学完再开始下一个
        </p>
      </div>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────

function TemplateCard({ item, showScene, onUpdate }: { item: WritingTemplate; showScene?: boolean; onUpdate?: (updated: WritingTemplate) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
    setExpanded(true);
    setEditForm({
      scene_cn: item.scene_cn || "",
      scene_detail: (item as any).scene_detail || "",
      template_en: item.template_en || "",
      template_cn: (item as any).template_cn || "",
      example_en: item.example_en || "",
      note: item.note || "",
    });
  };

  const saveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSaving(true);
    try {
      const updated = await api.updateWritingTemplate(item.id, editForm);
      onUpdate?.(updated);
      setEditing(false);
    } catch (err: any) {
      alert("保存失败: " + (err.message || "未知错误"));
    }
    setSaving(false);
  };

  return (
    <div
      className="rounded-lg border bg-card p-3 cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={() => { if (!editing) setExpanded(!expanded); }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Badge className={`${CATEGORY_MAP[item.category]?.color || ""} text-[10px]`} variant="outline">
          {CATEGORY_MAP[item.category]?.label}
        </Badge>
        <span className="text-[10px] text-muted-foreground">{item.sub_category}</span>
        <Badge className={`${MASTERY_COLORS[item.mastery_level]} text-[10px] ml-auto`} variant="outline">
          {MASTERY_LABELS[item.mastery_level]}
        </Badge>
      </div>

      {editing ? (
        <div className="space-y-2 mt-2" onClick={(e) => e.stopPropagation()}>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">场景名</label>
            <input className="w-full text-xs border rounded p-1.5 mt-0.5" value={editForm.scene_cn} onChange={e => setEditForm(f => ({ ...f, scene_cn: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">具体场景描述</label>
            <input className="w-full text-xs border rounded p-1.5 mt-0.5" value={editForm.scene_detail} onChange={e => setEditForm(f => ({ ...f, scene_detail: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">英文句型</label>
            <textarea className="w-full text-xs border rounded p-1.5 mt-0.5 font-mono resize-none" rows={2} value={editForm.template_en} onChange={e => setEditForm(f => ({ ...f, template_en: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">中文翻译</label>
            <textarea className="w-full text-xs border rounded p-1.5 mt-0.5 resize-none" rows={2} value={editForm.template_cn} onChange={e => setEditForm(f => ({ ...f, template_cn: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">例句（英）</label>
            <textarea className="w-full text-xs border rounded p-1.5 mt-0.5 font-mono resize-none" rows={2} value={editForm.example_en} onChange={e => setEditForm(f => ({ ...f, example_en: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">备注</label>
            <input className="w-full text-xs border rounded p-1.5 mt-0.5" value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={saveEdit} disabled={saving} className="px-3 py-1 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? "保存中..." : "保存"}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setEditing(false); }} className="px-3 py-1 rounded text-xs bg-muted text-muted-foreground hover:bg-muted/80">
              取消
            </button>
          </div>
        </div>
      ) : (
        <>
          {showScene && <p className="text-xs text-amber-700 dark:text-amber-300 mb-1">🎯 {item.scene_cn}</p>}
          <p className={`text-sm font-mono ${expanded ? "" : "line-clamp-2"}`}>{item.template_en}</p>
          {(item as any).template_cn && <p className="text-xs text-muted-foreground mt-0.5">📝 {(item as any).template_cn}</p>}
          {expanded && (
            <div className="mt-2 space-y-1">
              {(item as any).scene_detail && <p className="text-xs text-muted-foreground">📋 {(item as any).scene_detail}</p>}
              {item.example_en && <p className="text-xs text-muted-foreground italic">例：{item.example_en}</p>}
              {item.note && <p className="text-xs text-muted-foreground">💡 {item.note}</p>}
              <button onClick={startEdit} className="text-[10px] text-muted-foreground hover:text-primary mt-1 underline">✏️ 编辑</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}


// ─── Material Tab (素材背诵) ──────────────────────────────

const TOPIC_LABELS: Record<string, { label: string; emoji: string }> = {
  education: { label: "教育", emoji: "🎓" },
  technology: { label: "科技", emoji: "🤖" },
  environment: { label: "环境", emoji: "🌍" },
  health: { label: "健康", emoji: "❤️" },
  government: { label: "政府", emoji: "🏛️" },
  urbanisation: { label: "城市化", emoji: "🏙️" },
};

const M_MASTERY = ["新", "已看", "L1✓", "L2✓", "默写✓", "掌握"];
const M_MASTERY_C = ["bg-gray-200 text-gray-700", "bg-amber-100 text-amber-700", "bg-sky-100 text-sky-700", "bg-indigo-100 text-indigo-700", "bg-purple-100 text-purple-700", "bg-emerald-100 text-emerald-700"];

function MaterialTab({ subTab }: { subTab: string }) {
  if (subTab === "m-daily") return <MaterialDailySubTab />;
  if (subTab === "m-flashcard") return <MaterialFlashcardSubTab />;
  if (subTab === "m-dictation") return <MaterialDictationSubTab />;
  if (subTab === "m-downgrade") return <MaterialDowngradeSubTab />;
  if (subTab === "m-library") return <MaterialLibrarySubTab />;
  if (subTab === "m-stats") return <MaterialStatsSubTab />;
  return null;
}

function MaterialDailySubTab() {
  const [newItems, setNewItems] = useState<any[]>([]);
  const [learned, setLearned] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mStats, setMStats] = useState<any>(null);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [n, l, s] = await Promise.all([
        api.getWritingMaterialsNewToday(4),
        api.getWritingMaterialsLearned(),
        api.getWritingMaterialStats(),
      ]);
      setNewItems(n); setLearned(l); setMStats(s);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleMarkSeen = async (item: any) => {
    await api.reviewWritingMaterial(item.id, 2);
    toast({ description: "已标记，明天复习" });
    fetchAll();
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground animate-pulse">加载中...</div>;

  return (
    <div className="space-y-6">
      {mStats && (
        <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground flex flex-wrap gap-3">
          <span>总计 {mStats.total} 条</span>
          <span>已掌握 {mStats.mastered}</span>
          <span>今日新学 {mStats.learned_today}</span>
          <span>今日待复习 {mStats.due_today}</span>
          <span>明日 {mStats.tomorrow_due ?? 0}</span>
          <span>关键词 {mStats.keyword_mastered}/{mStats.keyword_total}</span>
        </div>
      )}

      {newItems.length === 0 && learned.length > 0 && (
        <div className="rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20 p-6 text-center">
          <p className="text-2xl">🎉</p>
          <p className="text-sm font-medium">今日素材已全部学完！</p>
          <p className="text-xs text-muted-foreground mt-1">去闪卡复习或默写测试巩固吧</p>
        </div>
      )}

      {newItems.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">📖 待学素材 <Badge variant="outline" className="text-xs">{newItems.length}</Badge></h2>
          <div className="space-y-3">
            {newItems.map((item) => (
              <div key={item.id} className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs">{TOPIC_LABELS[item.topic]?.emoji} {item.topic_cn}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs font-medium">{item.direction}</span>
                  <Badge variant="outline" className={`text-[10px] ${item.stance === "pro" ? "border-emerald-300 text-emerald-700" : "border-rose-300 text-rose-700"}`}>
                    {item.stance_label} · {item.angle}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {item.topic_sentence && (
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium mb-1">💡 观点句（Topic Sentence）</p>
                      <p className="text-sm bg-muted/50 rounded p-2 font-medium">{item.topic_sentence}</p>
                      {item.topic_sentence_en && (
                        <p className="text-sm bg-sky-50 dark:bg-sky-950/20 rounded p-2 mt-1 text-sky-700 dark:text-sky-400">{item.topic_sentence_en}</p>
                      )}
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">📎 理由链（中文）</p>
                    <p className="text-sm bg-muted/50 rounded p-2 font-medium">{item.reasoning_chain}</p>
                    {item.reasoning_chain_en && (
                      <p className="text-[10px] text-muted-foreground font-medium mt-1.5 mb-0.5">✏️ 降级英文</p>
                    )}
                    {item.reasoning_chain_en && (
                      <p className="text-sm bg-sky-50 dark:bg-sky-950/20 rounded p-2 text-sky-700 dark:text-sky-400">{item.reasoning_chain_en}</p>
                    )}
                    {item.chain_sentence_en && (
                      <p className="text-[10px] text-muted-foreground font-medium mt-1.5 mb-0.5">✍️ 完整写法</p>
                    )}
                    {item.chain_sentence_en && (
                      <p className="text-sm bg-emerald-50 dark:bg-emerald-950/20 rounded p-2 text-emerald-700 dark:text-emerald-400 italic">{item.chain_sentence_en}</p>
                    )}
                    {item.reuse_hint && (
                      <p className="text-[10px] mt-1.5 px-2 py-1 rounded bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 border border-violet-200/50 dark:border-violet-800/30">{item.reuse_hint}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">📖 例子（中文）</p>
                    <p className="text-sm bg-muted/50 rounded p-2">{item.example}</p>
                    {item.example_en && (
                      <p className="text-sm bg-sky-50 dark:bg-sky-950/20 rounded p-2 mt-1 text-sky-700 dark:text-sky-400">{item.example_en}</p>
                    )}
                  </div>
                </div>
                {(item.topic_sentence_en || item.reasoning_chain_en || item.example_en) && (
                  <TypingPractice target={item.topic_sentence_en || item.reasoning_chain_en || item.example_en || ""} label="⌨️ 敲一遍观点句英文" />
                )}
                <Button size="sm" variant="outline" onClick={() => handleMarkSeen(item)} className="gap-1">
                  <CheckCircle className="h-3.5 w-3.5" /> 已看，加入复习
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {learned.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">✅ 今日已学 <Badge variant="outline" className="text-xs">{learned.length}</Badge></h2>
          <div className="space-y-2">
            {learned.map((item) => (
              <div key={item.id} className="rounded-lg border bg-card p-3 flex items-center gap-2">
                <span className="text-xs">{TOPIC_LABELS[item.topic]?.emoji}</span>
                <span className="text-xs flex-1 truncate">{item.direction} · {item.stance_label} · {item.angle}</span>
                <Badge className={`text-[10px] ${M_MASTERY_C[item.mastery_level] || ""}`}>{M_MASTERY[item.mastery_level]}</Badge>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MaterialFlashcardSubTab() {
  const [mode, setMode] = useState<"l1" | "material" | "keywords">("l1");
  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-2">
        <button onClick={() => setMode("l1")} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${mode === "l1" ? "bg-purple-500 text-white" : "bg-muted text-muted-foreground"}`}>
          🧠 角度回忆
        </button>
        <button onClick={() => setMode("material")} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${mode === "material" ? "bg-purple-500 text-white" : "bg-muted text-muted-foreground"}`}>
          🃏 素材闪卡
        </button>
        <button onClick={() => setMode("keywords")} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${mode === "keywords" ? "bg-purple-500 text-white" : "bg-muted text-muted-foreground"}`}>
          🔑 关键词
        </button>
      </div>
      {mode === "l1" ? <MaterialL1FlashcardContent /> : mode === "material" ? <MaterialFlashcardContent /> : <MaterialKeywordFlashcard />}
    </div>
  );
}

function MaterialL1FlashcardContent() {
  const [queue, setQueue] = useState<any[]>([]); // each item: {direction, topic, topic_cn, direction_index, stance, stance_label, angles, memory_anchor}
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      try {
        // Get L1 directions data (for angles + anchors) AND due materials (for timing)
        const [dirs, due] = await Promise.all([
          api.getWritingMaterialL1Directions(),
          api.getWritingMaterialsDue(50),
        ]);
        // Filter due materials that are mastery=1 (L1 stage)
        const dueMastery1 = due.filter((m: any) => m.mastery_level === 1);
        // Build set of direction+stance combos that have due mastery=1 items
        const dueKeys = new Set(dueMastery1.map((m: any) => `${m.topic}|${m.direction_index}|${m.stance}`));

        const cards: any[] = [];
        for (const d of dirs) {
          // Pro side: only show if there are DUE mastery=1 items for this direction+stance
          const proKey = `${d.topic}|${d.direction_index}|pro`;
          if (dueKeys.has(proKey) && d.pro_angles.length > 0) {
            cards.push({
              direction: d.direction,
              topic: d.topic,
              topic_cn: d.topic_cn,
              direction_index: d.direction_index,
              stance: "pro",
              stance_label: "正方",
              angles: d.pro_angles,
              memory_anchor: d.memory_anchor,
            });
          }
          // Con side: only show if there are DUE mastery=1 items for this direction+stance
          const conKey = `${d.topic}|${d.direction_index}|con`;
          if (dueKeys.has(conKey) && d.con_angles.length > 0) {
            cards.push({
              direction: d.direction,
              topic: d.topic,
              topic_cn: d.topic_cn,
              direction_index: d.direction_index,
              stance: "con",
              stance_label: "反方",
              angles: d.con_angles,
              memory_anchor: d.memory_anchor,
            });
          }
        }
        setQueue(cards);
        if (cards.length === 0) setFinished(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="py-12 text-center text-muted-foreground animate-pulse">加载中...</div>;
  if (finished || queue.length === 0) return (
    <div className="py-12 text-center">
      <p className="text-2xl">🎉</p>
      <p className="text-sm text-muted-foreground mt-2">所有已学方向的角度已回忆！</p>
      <p className="text-xs text-muted-foreground mt-1">在「今日学习」学习新素材后，新方向会出现在这里</p>
      <p className="text-xs text-muted-foreground mt-1">角度回忆过关后 → 去「素材闪卡」练理由链和例子</p>
    </div>
  );

  const current = queue[idx];
  if (!current) return null;

  const handleNext = async (passed: boolean) => {
    if (passed) {
      // L1 pass: promote mastery 1→2 via SM-2, will appear in L2 flashcard when due
      await api.passWritingMaterialL1(current.topic, current.direction_index, current.stance);
    } else {
      // L1 fail: reset interval, will come back tomorrow for L1 review again
      await api.failWritingMaterialL1(current.topic, current.direction_index, current.stance);
    }
    if (idx + 1 >= queue.length) {
      setFinished(true);
    } else {
      setIdx(idx + 1);
      setFlipped(false);
    }
  };

  // Parse memory_anchor to get pro/con parts
  const anchorParts = current.memory_anchor?.split("；") || [];
  const relevantAnchor = current.stance === "pro" ? anchorParts[0] : (anchorParts[1] || anchorParts[0]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground text-center">{idx + 1} / {queue.length}</p>
      <div
        className="rounded-xl border-2 bg-card p-6 min-h-[280px] cursor-pointer transition-all hover:shadow-md"
        onClick={() => !flipped && setFlipped(true)}
      >
        {!flipped ? (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <span className="text-lg">{TOPIC_LABELS[current.topic]?.emoji}</span>
              <span className="text-base font-semibold">{current.direction}</span>
            </div>
            <div className="flex justify-center">
              <Badge variant="outline" className={`text-sm px-3 py-1 ${current.stance === "pro" ? "border-emerald-300 text-emerald-700 dark:border-emerald-600 dark:text-emerald-400" : "border-rose-300 text-rose-700 dark:border-rose-600 dark:text-rose-400"}`}>
                {current.stance_label}
              </Badge>
            </div>
            <div className="text-center space-y-2 pt-4">
              <p className="text-sm text-muted-foreground">这个立场有哪些角度？</p>
              <p className="text-sm text-muted-foreground">每个角度的观点句（中文大意）是什么？</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-2 mt-2">
              <p className="text-[10px] text-muted-foreground text-center">✅ 过关标准：说出所有角度名 + 每个角度观点句的中文大意</p>
              <p className="text-[10px] text-muted-foreground text-center">（不要求英文，不要求一字不差）</p>
            </div>
            <p className="text-[10px] text-muted-foreground text-center italic pt-2">想好后点击翻面 →</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span>{TOPIC_LABELS[current.topic]?.emoji}</span>
              <span className="text-sm font-medium">{current.direction}</span>
              <Badge variant="outline" className={`text-[10px] ${current.stance === "pro" ? "border-emerald-300 text-emerald-700" : "border-rose-300 text-rose-700"}`}>
                {current.stance_label}
              </Badge>
            </div>

            {current.angles.map((a: any, i: number) => (
              <div key={i} className="rounded-lg bg-muted/50 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-purple-600 dark:text-purple-400">{"❶❷❸❹"[i] || `${i+1}.`}</span>
                  <span className="text-sm font-semibold">{a.angle}</span>
                </div>
                {a.topic_sentence && (
                  <p className="text-sm text-foreground/80 pl-5">{a.topic_sentence}</p>
                )}
                {a.topic_sentence_en && (
                  <p className="text-sm font-medium text-sky-700 dark:text-sky-400 pl-5">{a.topic_sentence_en}</p>
                )}
                {a.topic_sentence_en && (
                  <div className="pl-5">
                    <TypingPractice target={a.topic_sentence_en} label={`⌨️ 敲一遍观点句${i + 1}`} />
                  </div>
                )}
              </div>
            ))}

            {relevantAnchor && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 mt-3">
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mb-1">🧠 记忆锚点</p>
                <p className="text-xs text-amber-800 dark:text-amber-300">{relevantAnchor}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {flipped && (
        <div className="space-y-3">
          <div className="rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 p-2">
            <p className="text-[10px] text-sky-700 dark:text-sky-300 text-center font-medium">自查：角度名都说对了吗？观点句大意对了吗？</p>
            <p className="text-[10px] text-sky-600 dark:text-sky-400 text-center">{"都对 → 想起来了 ｜ 漏了/错了 → 还不熟"}</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50"
              onClick={() => handleNext(false)}
            >
              还不熟 😅
            </Button>
            <Button
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
              onClick={() => handleNext(true)}
            >
              想起来了 ✅
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MaterialFlashcardContent() {
  const [queue, setQueue] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return; // 避免重复加载
    loadedRef.current = true;
    (async () => {
      const due = await api.getWritingMaterialsDue(20);
      // Only show mastery=2 (L1 passed, ready for L2 flashcard review)
      const items = due.filter((m: any) => m.mastery_level === 2);
      setQueue(items);
      setLoading(false);
      if (items.length === 0) setFinished(true);
    })();
  }, []);

  if (loading) return <div className="py-12 text-center text-muted-foreground animate-pulse">加载中...</div>;
  if (finished || queue.length === 0) return <div className="py-12 text-center"><p className="text-2xl">🎉</p><p className="text-sm text-muted-foreground mt-2">暂无待复习素材</p><p className="text-xs text-muted-foreground mt-1">素材需先在「今日学习」标记已看，到期后出现在这里</p></div>;

  const current = queue[idx];
  if (!current) return null;

  const handleReview = async (quality: number) => {
    await api.reviewWritingMaterial(current.id, quality);
    if (idx + 1 >= queue.length) { setFinished(true); } else { setIdx(idx + 1); setFlipped(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground text-center">{idx + 1} / {queue.length}</p>
      <div className="rounded-xl border-2 bg-card p-6 min-h-[240px] cursor-pointer transition-all hover:shadow-md" onClick={() => setFlipped(!flipped)}>
        {!flipped ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span>{TOPIC_LABELS[current.topic]?.emoji}</span>
              <span className="text-sm font-medium">{current.direction}</span>
              <Badge variant="outline" className={`text-[10px] ${current.stance === "pro" ? "border-emerald-300 text-emerald-700" : "border-rose-300 text-rose-700"}`}>
                {current.stance_label} · {current.angle}
              </Badge>
            </div>
            {current.topic_sentence && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-[10px] text-muted-foreground font-medium mb-1">💡 观点句</p>
                <p className="text-sm font-medium">{current.topic_sentence}</p>
              </div>
            )}
            <div className="text-center space-y-1 pt-4">
              <p className="text-sm text-muted-foreground">回忆理由链和例子</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-2 mt-2">
              <p className="text-[10px] text-muted-foreground text-center">✅ 过关标准：说出理由链的因果逻辑（中文即可） + 例子的关键事实</p>
              <p className="text-[10px] text-muted-foreground text-center">（不要求背原文，大意对即可）</p>
            </div>
            <p className="text-[10px] text-muted-foreground italic text-center pt-2">想好后点击翻面对照 →</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span>{TOPIC_LABELS[current.topic]?.emoji}</span>
              <span className="text-sm font-medium">{current.direction}</span>
              <Badge variant="outline" className={`text-[10px] ${current.stance === "pro" ? "border-emerald-300 text-emerald-700" : "border-rose-300 text-rose-700"}`}>
                {current.stance_label} · {current.angle}
              </Badge>
            </div>
            <div className="space-y-3">
              {(current.topic_sentence || current.topic_sentence_en) && (
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">💡 观点句</p>
                  {current.topic_sentence && <p className="text-sm text-foreground/70">{current.topic_sentence}</p>}
                  {current.topic_sentence_en && (
                    <p className="text-sm font-medium text-sky-700 dark:text-sky-400 mt-1">{current.topic_sentence_en}</p>
                  )}
                </div>
              )}
              <div>
                <p className="text-[10px] text-muted-foreground font-medium mb-1">📎 理由链</p>
                <p className="text-sm text-foreground/70">{current.reasoning_chain}</p>
                {current.reasoning_chain_en && (
                  <p className="text-sm font-medium text-sky-700 dark:text-sky-400 mt-1">{current.reasoning_chain_en}</p>
                )}
                {current.chain_sentence_en && (
                  <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1 italic">{current.chain_sentence_en}</p>
                )}
                {current.reuse_hint && (
                  <p className="text-[10px] mt-1.5 px-2 py-1 rounded bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 border border-violet-200/50 dark:border-violet-800/30">{current.reuse_hint}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium mb-1">📖 例子</p>
                <p className="text-sm text-foreground/70">{current.example}</p>
                {current.example_en && (
                  <p className="text-sm font-medium text-sky-700 dark:text-sky-400 mt-1">{current.example_en}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {flipped && (
        <>
          <div className="rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 p-2">
            <p className="text-[10px] text-sky-700 dark:text-sky-300 text-center font-medium">自查：理由链因果逻辑对了吗？例子关键事实对了吗？</p>
          </div>
          <TypingPractice target={current.topic_sentence_en || current.reasoning_chain_en || current.example_en || ""} label="⌨️ 敲一遍观点句英文" />
          <div className="flex justify-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => handleReview(0)} className="text-rose-600 w-full">不会</Button>
              <p className="text-[9px] text-muted-foreground">→ 回到角度回忆</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => handleReview(1)} className="w-full">模糊</Button>
              <p className="text-[9px] text-muted-foreground">→ 明天再练本级</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => handleReview(3)} className="text-emerald-600 w-full">记住了</Button>
              <p className="text-[9px] text-muted-foreground">→ 进入默写测试</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MaterialDictationSubTab() {
  const [queue, setQueue] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const due = await api.getWritingMaterialsDue(20);
      setQueue(due.filter((m: any) => m.mastery_level >= 3 && m.mastery_level <= 4));
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="py-12 text-center text-muted-foreground animate-pulse">加载中...</div>;
  if (queue.length === 0) return <div className="py-12 text-center"><p className="text-2xl">🎉</p><p className="text-sm text-muted-foreground mt-2">暂无待默写素材（需先通过闪卡升到 mastery 3+）</p></div>;

  const current = queue[idx];
  if (!current) return <div className="py-12 text-center"><p className="text-2xl">✅</p><p className="text-sm mt-2">本轮默写完成！</p></div>;

  const mode = current.mastery_level === 3 ? "reasoning" : "example";

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setChecking(true);
    try {
      const res = await api.checkWritingMaterial(current.id, input.trim(), mode);
      setResult(res);
    } catch { toast({ variant: "destructive", description: "检查失败" }); }
    finally { setChecking(false); }
  };

  const handleNext = () => { setResult(null); setInput(""); setIdx(idx + 1); };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground text-center">{idx + 1} / {queue.length}</p>
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span>{TOPIC_LABELS[current.topic]?.emoji} {current.topic_cn}</span>
          <span className="text-xs font-medium">{current.direction}</span>
          <Badge variant="outline" className="text-[10px]">{current.stance_label} · {current.angle}</Badge>
        </div>
        {current.topic_sentence && (
          <p className="text-xs text-muted-foreground">💡 观点句：{current.topic_sentence}</p>
        )}
        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
          {mode === "reasoning" ? "📎 请写出理由链（3个环节）" : "📖 请回忆例子关键信息（国家/现象）"}
        </p>
      </div>
      {!result ? (
        <div className="space-y-2">
          <Textarea value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder={mode === "reasoning" ? "A → B → C" : "哪个国家/什么现象..."} rows={3} className="text-sm" />
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSubmit} disabled={checking || !input.trim()}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}提交
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center gap-2">
            {result.correct ? <CheckCircle className="h-5 w-5 text-emerald-500" /> : <XCircle className="h-5 w-5 text-rose-500" />}
            <span className="font-medium">{result.score}分</span>
          </div>
          <p className="text-sm text-muted-foreground">{result.feedback}</p>
          <div className="bg-muted/50 rounded p-2 text-xs"><span className="font-medium">参考答案：</span>{result.expected}</div>
          <Button size="sm" variant="outline" onClick={handleNext}>下一题</Button>
        </div>
      )}
    </div>
  );
}

function MaterialDowngradeSubTab() {
  const [sentences, setSentences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [finished, setFinished] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });
  const [dStats, setDStats] = useState<any>(null);
  const [mode, setMode] = useState<"new" | "retry">("new");
  const { toast } = useToast();

  // 从 sessionStorage 恢复练习状态
  const STORAGE_KEY = "downgrade_session";

  const saveSession = useCallback((data: { sentences: any[]; idx: number; stats: { correct: number; total: number }; mode: string }) => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }, []);

  const clearSession = useCallback(() => {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  const fetchSentences = useCallback(async (m: "new" | "retry" = "new") => {
    setLoading(true);
    setFinished(false);
    setCurrentIdx(0);
    setInput("");
    setResult(null);
    setSessionStats({ correct: 0, total: 0 });
    setMode(m);
    try {
      const data = m === "retry" ? await api.getDowngradeRetry() : await api.getDowngradeSentences();
      setSentences(data);
      saveSession({ sentences: data, idx: 0, stats: { correct: 0, total: 0 }, mode: m });
    } catch {
      toast({ variant: "destructive", description: "加载失败" });
    } finally {
      setLoading(false);
    }
  }, [toast, saveSession]);

  const fetchStats = useCallback(async () => {
    try { setDStats(await api.getDowngradeStats()); } catch {}
  }, []);

  useEffect(() => {
    // 尝试恢复上次未完成的练习
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        // 丢弃包含素材来源的旧缓存（降级练习已改为仅通用表达）
        const hasOldMaterialSentences = data.sentences?.some((s: any) => s.source_material_id);
        if (data.sentences && data.sentences.length > 0 && data.idx < data.sentences.length && !hasOldMaterialSentences) {
          setSentences(data.sentences);
          setCurrentIdx(data.idx);
          setSessionStats(data.stats || { correct: 0, total: 0 });
          setMode(data.mode || "new");
          setLoading(false);
          fetchStats();
          return;
        }
      }
    } catch {}
    fetchSentences("new");
    fetchStats();
  }, [fetchSentences, fetchStats]);

  const current = sentences[currentIdx];

  const handleSubmit = async () => {
    if (!current || !input.trim() || checking) return;
    setChecking(true);
    try {
      const res = await api.checkDowngrade(current.chinese, input.trim(), current.source_material_id);
      setResult(res);
      const newStats = { correct: sessionStats.correct + (res.correct ? 1 : 0), total: sessionStats.total + 1 };
      setSessionStats(newStats);
      saveSession({ sentences, idx: currentIdx, stats: newStats, mode });
    } catch {
      toast({ variant: "destructive", description: "AI判分失败" });
    } finally {
      setChecking(false);
    }
  };

  const handleNext = () => {
    if (currentIdx < sentences.length - 1) {
      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      setInput("");
      setResult(null);
      saveSession({ sentences, idx: nextIdx, stats: sessionStats, mode });
    } else {
      setFinished(true);
      clearSession();
      fetchStats();
    }
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground animate-pulse">加载中...</div>;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      {dStats && (
        <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground flex flex-wrap gap-3">
          <span>累计 {dStats.total_attempts} 次</span>
          <span>正确率 {dStats.accuracy_pct}%</span>
          <span>平均分 {dStats.avg_score}</span>
          {dStats.retry_pending > 0 && (
            <span className="text-amber-600 font-medium">待重练 {dStats.retry_pending} 题</span>
          )}
          <span>今日 {dStats.today_count}/5</span>
        </div>
      )}

      {/* Mode switch */}
      {dStats && dStats.retry_pending > 0 && !finished && sentences.length > 0 && (
        <div className="flex gap-2">
          <button onClick={() => fetchSentences("new")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${mode === "new" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            新题
          </button>
          <button onClick={() => fetchSentences("retry")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${mode === "retry" ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"}`}>
            错题重练 ({dStats.retry_pending})
          </button>
        </div>
      )}

      {sentences.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground space-y-3">
          <p className="text-lg">{dStats && dStats.today_count >= 5 ? "✅" : "📝"}</p>
          <p>{mode === "retry" ? "暂无错题需要重练 🎉" : dStats && dStats.today_count >= 5 ? "今日5题新题已完成！" : "暂无降级练习句子"}</p>
          {mode === "new" && dStats && dStats.today_count >= 5 && dStats.retry_pending > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-amber-600">还有 {dStats.retry_pending} 题错题可以重练（不占每日配额）</p>
              <Button variant="outline" size="sm" onClick={() => fetchSentences("retry")} className="text-amber-600">去重练错题</Button>
            </div>
          )}
          {mode === "new" && dStats && dStats.today_count >= 5 && (!dStats.retry_pending || dStats.retry_pending === 0) && (
            <p className="text-xs">明天继续 💪</p>
          )}
          {mode === "retry" && <Button variant="outline" size="sm" onClick={() => fetchSentences("new")}>做新题</Button>}
          {mode === "new" && dStats && dStats.today_count < 5 && <p className="text-xs">请先学习一些素材</p>}
        </div>
      ) : finished ? (
        <div className="py-12 text-center space-y-4">
          <p className="text-2xl">🎉</p>
          <p className="text-sm font-medium">本轮{mode === "retry" ? "错题重练" : "降级练习"}完成！</p>
          <p className="text-xs text-muted-foreground">✅ {sessionStats.correct}/{sessionStats.total} 正确</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => fetchSentences("new")}>再来新题</Button>
            {dStats && dStats.retry_pending > 0 && (
              <Button variant="outline" onClick={() => fetchSentences("retry")} className="text-amber-600">重练错题</Button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* 说明 */}
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-1">
            <p className="font-semibold">⬇️ {mode === "retry" ? "错题重练" : "降级表达法练习"}</p>
            <p>把中文用清晰正确的英语表达。3步法：①核心意思 ②简单词 ③组句</p>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{currentIdx + 1}/{sentences.length}</span>
            <span>✅ {sessionStats.correct}/{sessionStats.total}</span>
          </div>

          <div className="rounded-xl border-2 bg-card p-5 space-y-4">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">请用简单英语表达：</p>
              <p className="text-lg font-semibold text-foreground">{current.chinese}</p>
              {current.hint && <p className="text-xs text-muted-foreground">💡 {current.hint}</p>}
            </div>

            <Textarea value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              placeholder="Type your simple English here... (Enter to submit)"
              rows={2} className="font-mono text-sm" disabled={!!result} />

            {!result ? (
              <Button onClick={handleSubmit} disabled={!input.trim() || checking} className="gap-1 w-full">
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                提交判分
              </Button>
            ) : (
              <div className="space-y-3">
                <div className={`rounded-lg p-3 ${result.correct ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800" : "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {result.correct ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                    <span className={`text-sm font-semibold ${result.correct ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                      {result.correct ? `正确！${result.score}分` : `未通过 ${result.score}分`}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{result.feedback}</p>
                </div>
                {!result.correct && result.corrected_answer && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
                    <p className="text-xs text-amber-700 dark:text-amber-300 font-medium mb-1">✏️ 你的答案修正后：</p>
                    <p className="text-sm font-mono">{result.corrected_answer}</p>
                  </div>
                )}
                {result.reference_answer && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">参考答案：</p>
                    <p className="text-sm font-mono">{result.reference_answer}</p>
                  </div>
                )}
                {result.steps && (result.steps.core_meaning || result.steps.keywords || result.steps.simple_sentence) && (
                  <div className="bg-sky-50 dark:bg-sky-950/20 rounded-lg p-3 space-y-2 border border-sky-200 dark:border-sky-800">
                    <p className="text-xs font-semibold text-sky-800 dark:text-sky-200">📐 三步拆解：</p>
                    {result.steps.core_meaning && <p className="text-xs"><span className="font-medium text-sky-700 dark:text-sky-300">①核心意思：</span>{result.steps.core_meaning}</p>}
                    {result.steps.keywords && <p className="text-xs"><span className="font-medium text-sky-700 dark:text-sky-300">②简单替代词：</span>{result.steps.keywords}</p>}
                    {result.steps.simple_sentence && <p className="text-xs"><span className="font-medium text-sky-700 dark:text-sky-300">③简单句：</span>{result.steps.simple_sentence}</p>}
                  </div>
                )}
                <Button onClick={handleNext} className="w-full gap-1">下一题 <ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MaterialLibrarySubTab() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [keywords, setKeywords] = useState<any[]>([]);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [data, kws] = await Promise.all([
      api.getWritingMaterials(topic ? { topic } : undefined),
      api.getWritingMaterialKeywords(topic ? { topic } : undefined),
    ]);
    setMaterials(data);
    setKeywords(kws);
    setLoading(false);
  }, [topic]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Group keywords by topic+direction_index
  const kwMap: Record<string, any[]> = {};
  for (const kw of keywords) {
    const key = `${kw.topic}-${kw.direction_index}`;
    if (!kwMap[key]) kwMap[key] = [];
    kwMap[key].push(kw);
  }

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditForm({
      topic_sentence: item.topic_sentence || "",
      topic_sentence_en: item.topic_sentence_en || "",
      reasoning_chain: item.reasoning_chain || "",
      reasoning_chain_en: item.reasoning_chain_en || "",
      chain_sentence_en: item.chain_sentence_en || "",
      example: item.example || "",
      example_en: item.example_en || "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      // Only send fields that have changed
      const updated = await api.updateWritingMaterial(editingId, editForm);
      setMaterials(prev => prev.map(m => m.id === editingId ? updated : m));
      setEditingId(null);
    } catch (e: any) {
      alert("保存失败: " + (e.message || "未知错误"));
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* Topic filter */}
      <div className="flex gap-1 flex-wrap items-center">
        <button onClick={() => setTopic("")} className={`px-2 py-1 rounded-full text-xs ${!topic ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>全部</button>
        {Object.entries(TOPIC_LABELS).map(([k, v]) => (
          <button key={k} onClick={() => setTopic(k)} className={`px-2 py-1 rounded-full text-xs ${topic === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {v.emoji} {v.label}
          </button>
        ))}
      </div>

      {loading ? <div className="py-8 text-center text-muted-foreground animate-pulse">加载中...</div> : (
        <div className="space-y-2">
          {materials.map((item) => {
            const isExpanded = expandedId === item.id;
            const isEditing = editingId === item.id;
            const relatedKws = kwMap[`${item.topic}-${item.direction_index}`] || [];
            return (
              <div key={item.id} className="rounded-lg border bg-card p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs cursor-pointer" onClick={() => { if (!isEditing) setExpandedId(isExpanded ? null : item.id); }}>
                  <span>{TOPIC_LABELS[item.topic]?.emoji}</span>
                  <span className="font-medium truncate flex-1">{item.direction} · {item.stance_label} · {item.angle}</span>
                  <Badge className={`text-[10px] ${M_MASTERY_C[item.mastery_level] || ""}`}>{M_MASTERY[item.mastery_level]}</Badge>
                </div>

                {isEditing ? (
                  /* ─── 编辑模式 ─── */
                  <div className="space-y-2 pt-2 border-t">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">观点句（中）</label>
                      <textarea className="w-full text-xs border rounded p-1.5 mt-0.5 resize-none" rows={2}
                        value={editForm.topic_sentence}
                        onChange={e => setEditForm(f => ({ ...f, topic_sentence: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">观点句（英）</label>
                      <textarea className="w-full text-xs border rounded p-1.5 mt-0.5 resize-none" rows={2}
                        value={editForm.topic_sentence_en}
                        onChange={e => setEditForm(f => ({ ...f, topic_sentence_en: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">理由链（中）</label>
                      <textarea className="w-full text-xs border rounded p-1.5 mt-0.5 resize-none" rows={2}
                        value={editForm.reasoning_chain}
                        onChange={e => setEditForm(f => ({ ...f, reasoning_chain: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">理由链（英）</label>
                      <textarea className="w-full text-xs border rounded p-1.5 mt-0.5 resize-none" rows={2}
                        value={editForm.reasoning_chain_en}
                        onChange={e => setEditForm(f => ({ ...f, reasoning_chain_en: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-emerald-600">完整写法（英）</label>
                      <textarea className="w-full text-xs border border-emerald-200 rounded p-1.5 mt-0.5 resize-none" rows={2}
                        value={editForm.chain_sentence_en}
                        onChange={e => setEditForm(f => ({ ...f, chain_sentence_en: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">例子（中）</label>
                      <textarea className="w-full text-xs border rounded p-1.5 mt-0.5 resize-none" rows={2}
                        value={editForm.example}
                        onChange={e => setEditForm(f => ({ ...f, example: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">例子（英）</label>
                      <textarea className="w-full text-xs border rounded p-1.5 mt-0.5 resize-none" rows={2}
                        value={editForm.example_en}
                        onChange={e => setEditForm(f => ({ ...f, example_en: e.target.value }))} />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={saveEdit} disabled={saving}
                        className="px-3 py-1 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                        {saving ? "保存中..." : "保存"}
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="px-3 py-1 rounded text-xs bg-muted text-muted-foreground hover:bg-muted/80">
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ─── 展示模式 ─── */
                  <div className="space-y-1">
                    {(item.topic_sentence || item.topic_sentence_en) && (
                      <div className="space-y-0.5">
                        {item.topic_sentence && (
                          <p className="text-xs"><span className="font-medium text-muted-foreground">观点句：</span>{item.topic_sentence}</p>
                        )}
                        {item.topic_sentence_en && (
                          <p className="text-xs text-sky-700 dark:text-sky-400"><span className="font-medium">EN：</span>{item.topic_sentence_en}</p>
                        )}
                      </div>
                    )}
                    <p className="text-xs"><span className="font-medium text-muted-foreground">理由链：</span>{item.reasoning_chain}</p>
                    {item.reasoning_chain_en && (
                      <p className="text-xs text-sky-700 dark:text-sky-400"><span className="font-medium">EN：</span>{item.reasoning_chain_en}</p>
                    )}
                    {item.chain_sentence_en && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 italic"><span className="font-medium">✍️ </span>{item.chain_sentence_en}</p>
                    )}
                    <p className="text-xs"><span className="font-medium text-muted-foreground">例子：</span>{item.example}</p>
                    {item.example_en && (
                      <p className="text-xs text-sky-700 dark:text-sky-400"><span className="font-medium">EN：</span>{item.example_en}</p>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); startEdit(item); }}
                      className="text-[10px] text-muted-foreground hover:text-primary mt-1 underline">
                      ✏️ 编辑
                    </button>
                  </div>
                )}

                {isExpanded && !isEditing && relatedKws.length > 0 && (
                  <div className="pt-2 border-t mt-2">
                    <p className="text-[10px] font-medium text-muted-foreground mb-1.5">🔑 相关关键词</p>
                    <div className="flex flex-wrap gap-1.5">
                      {relatedKws.map((kw: any) => (
                        <span key={kw.id} className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          kw.level === "advanced"
                            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                            : "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800"
                        }`}>
                          {kw.level === "advanced" && <span className="text-amber-500 mr-0.5">⭐</span>}
                          <span className={kw.level === "advanced" ? "text-amber-700 dark:text-amber-300" : "text-purple-700 dark:text-purple-300"}>{kw.cn}</span>
                          <span className={`ml-1 ${kw.level === "advanced" ? "text-amber-500 dark:text-amber-400" : "text-purple-500 dark:text-purple-400"}`}>{kw.en}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MaterialStatsSubTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const s = await api.getWritingMaterialStats();
      setStats(s);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="py-12 text-center text-muted-foreground animate-pulse">加载中...</div>;
  if (!stats) return null;

  const pct = stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
  const topicEntries = Object.entries(stats.topic_stats || {}) as [string, any][];

  return (
    <div className="space-y-6">
      {/* Overall */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">总体进度</h3>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-lg bg-muted p-3">
            <p className="text-2xl font-bold text-purple-600">{stats.mastered}/{stats.total}</p>
            <p className="text-[10px] text-muted-foreground">素材掌握</p>
          </div>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-2xl font-bold text-sky-600">{stats.keyword_mastered}/{stats.keyword_total}</p>
            <p className="text-[10px] text-muted-foreground">关键词掌握</p>
          </div>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{pct}% 掌握率</span>
          <span>今日待复习 {stats.due_today} · 明日 {stats.tomorrow_due ?? 0}</span>
        </div>
      </div>

      {/* Per topic */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">各话题进度</h3>
        <div className="space-y-2">
          {topicEntries.map(([topic, info]) => {
            const topicPct = info.total > 0 ? Math.round((info.mastered / info.total) * 100) : 0;
            const tl = TOPIC_LABELS[topic];
            return (
              <div key={topic} className="flex items-center gap-3">
                <span className="text-sm w-20 truncate">{tl?.emoji} {tl?.label || topic}</span>
                <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-purple-400 rounded-full" style={{ width: `${topicPct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-16 text-right">{info.mastered}/{info.total}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mastery distribution */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">掌握度分布</h3>
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800">新 {stats.new_count}</span>
          <span className="text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30">学习中 {stats.learning}</span>
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30">已掌握 {stats.mastered}</span>
        </div>
      </div>
    </div>
  );
}


// ─── Speaking Tab ────────────────────────────────────────────

function SpeakingTab({ subTab, onSwitchToAdd }: { subTab: string; onSwitchToAdd: () => void }) {
  if (subTab === "s-today") return <SpeakingTodaySubTab onSwitchToAdd={onSwitchToAdd} />;
  if (subTab === "s-material") return <SpeakingMaterialSubTab />;
  if (subTab === "s-material-lib") return <SpeakingMaterialLibSubTab />;
  if (subTab === "s-add") return <SpeakingAddSubTab />;
  if (subTab === "s-phrases") return <SpeakingPhrasesSubTab />;
  if (subTab === "s-passed") return <SpeakingPassedSubTab />;
  if (subTab === "s-stats") return <SpeakingStatsSubTab />;
  return null;
}

function SpeakingTodaySubTab({ onSwitchToAdd }: { onSwitchToAdd: () => void }) {
  const [pending, setPending] = useState<any[]>([]);
  const [reviewed, setReviewed] = useState<any[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const fetchToday = useCallback(async () => {
    try {
      const data = await api.getSpeakingToday();
      setPending(data.pending);
      setReviewed(data.reviewed);
      setTotalActive(data.total_active);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  const handleReview = async (id: string, result: string) => {
    try {
      const updated = await api.reviewSpeakingCorrection(id, result);
      if (updated.status === "passed") {
        toast({ title: "🎉 过关！", description: "已掌握，进入长期巩固" });
      } else if (result === "fluent") {
        toast({ description: `下次复习：${updated.interval_days || 1}天后` });
      }
      setAudioUrl(null);
      fetchToday();
    } catch {}
  };

  const startRecording = async (id: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(id);
      setAudioUrl(null);
    } catch {
      toast({ title: "无法录音", description: "请允许麦克风权限", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(null);
  };

  if (loading) return <div className="text-center py-10 text-muted-foreground animate-pulse">加载中...</div>;

  if (pending.length === 0 && reviewed.length === 0 && totalActive === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-4xl">🎤</p>
        <p className="text-muted-foreground">还没有纠错条目</p>
        <button onClick={onSwitchToAdd} className="text-sm text-primary hover:underline">去录入纠错 →</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3 text-xs text-muted-foreground mb-2">
        <span>待复习 <strong className="text-foreground">{pending.length}</strong></span>
        <span>今日已练 <strong className="text-foreground">{reviewed.length}</strong></span>
        <span>总活跃 <strong className="text-foreground">{totalActive}</strong></span>
      </div>

      {pending.length === 0 && reviewed.length > 0 && (
        <div className="text-center py-10 space-y-2">
          <p className="text-3xl">✅</p>
          <p className="font-semibold">今日复习已完成！</p>
          <p className="text-sm text-muted-foreground">已练 {reviewed.length} 条</p>
        </div>
      )}

      {pending.map((item) => (
        <div key={item.id} className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-medium leading-relaxed flex-1">&ldquo;{item.correct_text}&rdquo;</p>
            {item.streak_days > 0 && (
              <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 px-2 py-0.5 rounded-full shrink-0">
                🔥 {item.streak_days}天
              </span>
            )}
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted inline-block">
            {item.error_type === "grammar" ? "语法" : item.error_type === "vocabulary" ? "用词" : item.error_type === "pronunciation" ? "发音" : "表达"}
          </span>
          <div className="flex items-center gap-2">
            {recording === item.id ? (
              <button onClick={stopRecording}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm animate-pulse">
                ⏹ 停止录音
              </button>
            ) : (
              <button onClick={() => startRecording(item.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-sm hover:bg-muted/80">
                🎤 录音
              </button>
            )}
            {audioUrl && recording === null && (
              <audio src={audioUrl} controls className="h-8 flex-1" />
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => handleReview(item.id, "fluent")}
              className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors">
              ✓ 脱口而出了
            </button>
            <button onClick={() => handleReview(item.id, "hesitant")}
              className="flex-1 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">
              ✗ 还要想
            </button>
          </div>
        </div>
      ))}

      {reviewed.length > 0 && pending.length > 0 && (
        <div className="pt-3 border-t">
          <p className="text-xs text-muted-foreground mb-2">今日已复习 ({reviewed.length})</p>
          {reviewed.map((item) => (
            <div key={item.id} className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
              <span>{item.last_result === "fluent" ? "✅" : "❌"}</span>
              <span className="truncate">{item.correct_text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SpeakingAddSubTab() {
  const [mode, setMode] = useState<"single" | "batch">("batch");
  const [correctText, setCorrectText] = useState("");
  const [errorType, setErrorType] = useState("grammar");
  const [batchText, setBatchText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recentAdded, setRecentAdded] = useState<any[]>([]);
  const { toast } = useToast();

  const handleAdd = async () => {
    if (!correctText.trim()) return;
    setSubmitting(true);
    try {
      const item = await api.createSpeakingCorrection(correctText.trim(), errorType);
      setRecentAdded(prev => [item, ...prev]);
      setCorrectText("");
      toast({ title: "已添加", description: "可在今日复习中练习" });
    } catch {} finally { setSubmitting(false); }
  };

  const handleBatchImport = async () => {
    if (!batchText.trim()) return;
    setSubmitting(true);
    try {
      // 同时调用两个导入接口，AI各自识别属于自己的内容
      const [corrRes, phraseRes] = await Promise.all([
        api.batchImportSpeakingCorrections(batchText.trim()),
        api.batchImportSpeakingPhrases(batchText.trim()),
      ]);
      const allItems = [
        ...corrRes.items.map((i: any) => ({ ...i, _type: "correction" })),
        ...phraseRes.items.map((i: any) => ({ ...i, _type: "phrase" })),
      ];
      setRecentAdded(prev => [...allItems, ...prev]);
      setBatchText("");
      const parts = [];
      if (corrRes.imported > 0) parts.push(`${corrRes.imported} 条纠错`);
      if (phraseRes.imported > 0) parts.push(`${phraseRes.imported} 条降级表达`);
      toast({ title: "导入成功", description: parts.join(" + ") || "未识别到内容" });
    } catch {
      toast({ variant: "destructive", description: "解析失败，请检查格式" });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      {/* Mode switch */}
      <div className="flex gap-2">
        <button onClick={() => setMode("batch")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${mode === "batch" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          批量导入
        </button>
        <button onClick={() => setMode("single")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${mode === "single" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          单条添加
        </button>
      </div>

      {mode === "batch" ? (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold">智能导入</h3>
          <p className="text-xs text-muted-foreground">
            直接粘贴口语练习总结，AI自动识别并分类：纠错→加入纠错复习，降级表达→加入闪卡
          </p>
          <textarea
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            placeholder={"粘贴口语练习总结...\n\nAI会自动识别：\n· 纠错（Wrong → Corrected）\n· 降级表达（你想表达 → Natural English）"}
            className="w-full rounded-lg border p-3 text-sm min-h-[160px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
          />
          <button onClick={handleBatchImport} disabled={!batchText.trim() || submitting}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            {submitting ? "AI解析中..." : "智能导入"}
          </button>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold">录入正确表达</h3>
          <textarea
            value={correctText}
            onChange={(e) => setCorrectText(e.target.value)}
            placeholder="输入正确的英文表达..."
            className="w-full rounded-lg border p-3 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground">错误类型:</label>
            <select value={errorType} onChange={(e) => setErrorType(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm bg-background">
              <option value="grammar">语法错误</option>
              <option value="vocabulary">用词错误</option>
              <option value="pronunciation">发音错误</option>
              <option value="expression">表达不地道</option>
            </select>
          </div>
          <button onClick={handleAdd} disabled={!correctText.trim() || submitting}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            {submitting ? "添加中..." : "添加纠错"}
          </button>
        </div>
      )}

      {recentAdded.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">已添加 ({recentAdded.length}):</p>
          {recentAdded.map((item) => (
            <div key={item.id} className="rounded-lg border bg-card px-3 py-2 text-sm flex items-center gap-2">
              <span className="text-emerald-500">✓</span>
              <span className="flex-1 truncate">{item.correct_text || item.cn}</span>
              <span className="text-[10px] text-muted-foreground">
                {item._type === "phrase" || item.cn
                  ? `💬 ${item.category || ""}`
                  : item.error_type === "grammar" ? "语法" : item.error_type === "vocabulary" ? "用词" : item.error_type === "pronunciation" ? "发音" : "表达"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SpeakingPassedSubTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSpeakingCorrections("passed")
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-10 text-muted-foreground animate-pulse">加载中...</div>;

  if (items.length === 0) {
    return (
      <div className="text-center py-16 space-y-2">
        <p className="text-3xl">🏆</p>
        <p className="text-muted-foreground">还没有过关的条目</p>
        <p className="text-xs text-muted-foreground">连续3天脱口而出即可过关</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-2">已过关 {items.length} 条</p>
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border bg-card px-4 py-3 flex items-center gap-3">
          <span className="text-emerald-500 shrink-0">✅</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{item.correct_text}</p>
            <p className="text-[10px] text-muted-foreground">
              {item.error_type === "grammar" ? "语法" : item.error_type === "vocabulary" ? "用词" : item.error_type === "pronunciation" ? "发音" : "表达"}
              {item.passed_at && ` · 过关于 ${new Date(item.passed_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SpeakingPhrasesSubTab() {
  const [pending, setPending] = useState<any[]>([]);
  const [reviewed, setReviewed] = useState<any[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [newRemaining, setNewRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [seeding, setSeeding] = useState(false);
  const loadedRef = useRef(false);

  const fetchToday = useCallback(async () => {
    if (loadedRef.current) return; // 避免切 tab 回来时重复加载
    loadedRef.current = true;
    try {
      const data = await api.getSpeakingPhrasesToday();
      setPending(data.pending);
      setReviewed(data.reviewed);
      setTotalActive(data.total_active);
      setNewRemaining((data as any).new_remaining || 0);
      setCurrentIdx(0);
      setFlipped(false);
    } catch {
      // If 404 or empty, try seeding
      if (totalActive === 0) {
        setSeeding(true);
        try {
          await api.seedSpeakingPhrases();
          const data2 = await api.getSpeakingPhrasesToday();
          setPending(data2.pending);
          setReviewed(data2.reviewed);
          setTotalActive(data2.total_active);
        } catch {}
        setSeeding(false);
      }
    } finally { setLoading(false); }
  }, [totalActive]);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  const current = pending[currentIdx];

  const handleReview = async (result: string) => {
    if (!current) return;
    try {
      await api.reviewSpeakingPhrase(current.id, result);
      setFlipped(false);
      if (currentIdx < pending.length - 1) {
        setCurrentIdx(currentIdx + 1);
      } else {
        // 最后一张完成，强制刷新
        loadedRef.current = false;
        fetchToday();
      }
    } catch {}
  };

  const categoryLabels: Record<string, string> = {
    feelings: "感受评价", reasons: "原因影响", people: "描述人",
    places: "地点环境", changes: "变化对比", opinions: "观点态度",
    frequency: "频率程度", habits: "喜好习惯", difficulties: "困难问题", filler: "填充拖时间",
  };

  if (loading || seeding) return <div className="text-center py-10 text-muted-foreground animate-pulse">{seeding ? "初始化词库..." : "加载中..."}</div>;

  if (pending.length === 0 && totalActive === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-3xl">💬</p>
        <p className="text-muted-foreground">词库为空</p>
        <button onClick={async () => { setSeeding(true); await api.seedSpeakingPhrases(); fetchToday(); setSeeding(false); }}
          className="text-sm text-primary hover:underline">导入口语降级表达词库</button>
      </div>
    );
  }

  if (pending.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-3xl">✅</p>
        <p className="font-semibold">今日闪卡复习完成！</p>
        <p className="text-sm text-muted-foreground">已复习 {reviewed.length} 条 · 总活跃 {totalActive} 条</p>
        {newRemaining > 0 && <p className="text-xs text-muted-foreground">剩余未学 {newRemaining} 条（每天新学5条）</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
        <span>今日 <strong className="text-foreground">{currentIdx + 1}/{pending.length}</strong></span>
        <span>已过 <strong className="text-foreground">{reviewed.length}</strong></span>
        <span>活跃 <strong className="text-foreground">{totalActive}</strong></span>
        {newRemaining > 0 && <span>未学 <strong className="text-amber-600">{newRemaining}</strong></span>}
      </div>

      {/* Flashcard */}
      {current && (
        <div
          onClick={() => setFlipped(!flipped)}
          className="rounded-xl border-2 bg-card p-8 min-h-[200px] flex flex-col items-center justify-center cursor-pointer select-none transition-all hover:shadow-md"
        >
          {!flipped ? (
            <>
              <span className="text-[10px] text-muted-foreground mb-3">{categoryLabels[current.category] || current.category}</span>
              <p className="text-2xl font-bold text-center">{current.cn}</p>
              <p className="text-xs text-muted-foreground mt-4">👆 点击翻面</p>
            </>
          ) : (
            <>
              <span className="text-[10px] text-muted-foreground mb-3">{current.cn}</span>
              <p className="text-xl font-medium text-center text-primary">{current.en}</p>
              {current.streak_days > 0 && (
                <span className="text-xs text-orange-500 mt-2">🔥 连续 {current.streak_days} 天</span>
              )}
            </>
          )}
        </div>
      )}

      {/* Review buttons (only when flipped) */}
      {flipped && (
        <div className="flex gap-3">
          <button onClick={() => handleReview("fluent")}
            className="flex-1 py-3 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors">
            ✓ 1秒内说出 — 过
          </button>
          <button onClick={() => handleReview("hesitant")}
            className="flex-1 py-3 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">
            ✗ 超过1秒 — 没过
          </button>
        </div>
      )}
    </div>
  );
}

function SpeakingStatsSubTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSpeakingCorrectionStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-10 text-muted-foreground animate-pulse">加载中...</div>;
  if (!stats) return null;

  const typeLabels: Record<string, string> = { grammar: "语法", vocabulary: "用词", pronunciation: "发音", expression: "表达" };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-[10px] text-muted-foreground">总条目</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-amber-500">{stats.active}</p>
          <p className="text-[10px] text-muted-foreground">待复习</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-emerald-500">{stats.passed}</p>
          <p className="text-[10px] text-muted-foreground">已过关</p>
        </div>
      </div>

      {stats.avg_pass_days > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">平均过关天数</p>
          <p className="text-xl font-bold">{stats.avg_pass_days} 天</p>
        </div>
      )}

      {stats.by_type && Object.keys(stats.by_type).length > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold">错误类型分布</h3>
          {Object.entries(stats.by_type).map(([type, count]) => (
            <div key={type} className="flex items-center gap-2">
              <span className="text-xs w-12">{typeLabels[type] || type}</span>
              <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/70 rounded-full"
                  style={{ width: `${((count as number) / stats.total) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-6 text-right">{count as number}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Speaking Material Sub Tab (口语素材背诵) ────────────────────

function SpeakingMaterialSubTab() {
  const [pending, setPending] = useState<any[]>([]);
  const [reviewed, setReviewed] = useState<any[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<"learn" | "recite">("learn"); // 先学习，再背诵
  const { toast } = useToast();

  const fetchToday = useCallback(async () => {
    try {
      const data = await api.getSpeakingMaterialsToday();
      setPending(data.pending);
      setReviewed(data.reviewed);
      setTotalActive(data.total_active);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  const handleReview = async (id: string, result: string) => {
    try {
      const updated = await api.reviewSpeakingMaterial(id, result);
      if (updated.status === "passed") {
        toast({ title: "🎉 素材过关！", description: "已掌握，进入长期巩固" });
      } else if (result === "fluent") {
        toast({ description: `下次复习：${updated.interval_days}天后` });
      }
      // 移动到下一个
      if (currentIndex + 1 < pending.length) {
        setCurrentIndex(currentIndex + 1);
        setPhase("learn");
      } else {
        setCurrentIndex(0);
        setPhase("learn");
      }
      fetchToday();
    } catch {}
  };

  if (loading) return <div className="text-center py-10 text-muted-foreground animate-pulse">加载中...</div>;

  if (pending.length === 0 && reviewed.length === 0 && totalActive === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-4xl">📝</p>
        <p className="text-muted-foreground">暂无素材数据</p>
        <p className="text-xs text-muted-foreground">请先通过后端导入口语素材</p>
      </div>
    );
  }

  // 今日全部完成
  if (pending.length === 0 && reviewed.length > 0) {
    return (
      <div className="text-center py-10 space-y-3">
        <p className="text-3xl">✅</p>
        <p className="font-semibold">今日背诵已完成！</p>
        <p className="text-sm text-muted-foreground">已练 {reviewed.length} 篇</p>
        <div className="pt-3 border-t max-w-md mx-auto">
          {reviewed.map((item) => (
            <div key={item.id} className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground">
              <span>{item.last_result === "fluent" ? "✅" : "❌"}</span>
              <span className="truncate flex-1">{item.title}</span>
              <span className="text-[10px] shrink-0">{item.part} · Lv{item.mastery_level || 0}/3</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const current = pending[currentIndex];
  if (!current) return null;

  return (
    <div className="space-y-3">
      {/* 统计栏 */}
      <div className="flex gap-3 text-xs text-muted-foreground mb-2">
        <span>待背诵 <strong className="text-foreground">{pending.length}</strong></span>
        <span>今日已练 <strong className="text-foreground">{reviewed.length}</strong></span>
        <span>总素材 <strong className="text-foreground">{totalActive}</strong></span>
        <span className="ml-auto text-[10px]">SM-2 间隔复习 · 最长7天</span>
      </div>

      {/* 进度指示 */}
      {pending.length > 1 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>第 {currentIndex + 1}/{pending.length} 篇</span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${((currentIndex + 1) / pending.length) * 100}%` }} />
          </div>
        </div>
      )}

      {/* 当前素材卡片 */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* 头部 */}
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                {current.part}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted">
                {current.score}分
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${phase === "learn" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"}`}>
                {phase === "learn" ? "📖 学习" : "🎯 背诵"}
              </span>
            </div>
            <h3 className="text-sm font-semibold leading-snug">{current.title}</h3>
            {current.story_line && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block ${
                current.story_line === "cs-growth" ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" :
                current.story_line === "japan-culture" ? "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300" :
                current.story_line === "family-hometown" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" :
                current.story_line === "school-life" ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300" :
                "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}>
                {current.story_line === "cs-growth" ? "💻 CS成长线" :
                 current.story_line === "japan-culture" ? "🇯🇵 日本文化线" :
                 current.story_line === "family-hometown" ? "🏡 家乡家庭线" :
                 current.story_line === "school-life" ? "🏫 校园生活线" :
                 "📌 独立素材"}
              </span>
            )}
          </div>
          {(current.mastery_level || 0) > 0 && (
            <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 px-2 py-0.5 rounded-full shrink-0">
              Lv{current.mastery_level}/3 · {current.interval_days || 1}天后复习
            </span>
          )}
        </div>

        {/* 中文关键词 */}
        <div className="px-4 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {(current.keywords_cn || []).map((kw: string, i: number) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/30">
                {kw}
              </span>
            ))}
          </div>
        </div>

        {/* 学习阶段：展示全文，阅读后进入背诵 */}
        {phase === "learn" && (
          <div className="px-4 pb-4 space-y-3">
            <div className="rounded-lg bg-muted/50 p-4 max-h-72 overflow-y-auto">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{current.content}</p>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              仔细阅读并熟悉内容，准备好后点击下方进入背诵
            </p>
            <button
              onClick={() => setPhase("recite")}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              ✓ 已熟悉，开始背诵
            </button>
          </div>
        )}

        {/* 背诵阶段：只看关键词，尝试背诵，然后自评 */}
        {phase === "recite" && (
          <div className="px-4 pb-4 space-y-3">
            <div className="rounded-lg border-2 border-dashed border-amber-300/50 dark:border-amber-700/30 bg-amber-50/30 dark:bg-amber-950/10 p-4 text-center">
              <p className="text-sm text-muted-foreground mb-2">看着上面的关键词，尝试完整背诵</p>
              <p className="text-xs text-muted-foreground">背完后自评：是否流利完成？</p>
            </div>
            <details className="group">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-primary transition-colors text-center py-2">
                👀 点击查看原文对照
              </summary>
              <div className="rounded-lg bg-muted/50 p-3 mt-2 max-h-48 overflow-y-auto">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{current.content}</p>
              </div>
            </details>
            <div className="flex gap-2 pt-1">
              <button onClick={() => handleReview(current.id, "fluent")}
                className="flex-1 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors">
                ✓ 背诵流利
              </button>
              <button onClick={() => handleReview(current.id, "hesitant")}
                className="flex-1 py-2.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">
                ✗ 还不熟
              </button>
            </div>
            <button onClick={() => setPhase("learn")}
              className="w-full text-xs text-muted-foreground hover:text-primary py-1">
              ← 返回学习
            </button>
          </div>
        )}
      </div>

      {/* 切换卡片（多篇时） */}
      {pending.length > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => { setCurrentIndex(Math.max(0, currentIndex - 1)); setPhase("learn"); }}
            disabled={currentIndex === 0}
            className="px-3 py-1 text-xs rounded border disabled:opacity-30 hover:bg-accent"
          >
            ← 上一篇
          </button>
          <button
            onClick={() => { setCurrentIndex(Math.min(pending.length - 1, currentIndex + 1)); setPhase("learn"); }}
            disabled={currentIndex >= pending.length - 1}
            className="px-3 py-1 text-xs rounded border disabled:opacity-30 hover:bg-accent"
          >
            下一篇 →
          </button>
        </div>
      )}

      {/* 今日已复习 */}
      {reviewed.length > 0 && (
        <div className="pt-3 border-t">
          <p className="text-xs text-muted-foreground mb-2">今日已背诵 ({reviewed.length})</p>
          {reviewed.map((item) => (
            <div key={item.id} className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground">
              <span>{item.last_result === "fluent" ? "✅" : "❌"}</span>
              <span className="truncate flex-1">{item.title}</span>
              <span className="text-[10px] shrink-0">{item.part} · Lv{item.mastery_level || 0}/3</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Speaking Material Library (素材库) ────────────────────

function SpeakingMaterialLibSubTab() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "passed">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ title: "", content: "", keywords_cn: "" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [items, statsData] = await Promise.all([
        api.getSpeakingMaterials(filter === "all" ? undefined : filter),
        api.getSpeakingMaterialsStats(),
      ]);
      setMaterials(items);
      setStats(statsData);
    } catch {} finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (item: any) => {
    setEditingItem(item);
    setEditForm({
      title: item.title,
      content: item.content,
      keywords_cn: (item.keywords_cn || []).join("、"),
    });
  };

  const handleSave = async () => {
    if (!editingItem) return;
    setSaving(true);
    try {
      const keywords = editForm.keywords_cn.split(/[、,，]/).map((s: string) => s.trim()).filter(Boolean);
      await api.updateSpeakingMaterial(editingItem.id, {
        title: editForm.title,
        content: editForm.content,
        keywords_cn: keywords,
      });
      toast({ description: "保存成功" });
      setEditingItem(null);
      setLoading(true);
      load();
    } catch {
      toast({ variant: "destructive", description: "保存失败" });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="text-center py-10 text-muted-foreground animate-pulse">加载中...</div>;

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xl font-bold">{stats.total}</p>
            <p className="text-[10px] text-muted-foreground">总素材</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xl font-bold text-blue-600">{stats.active}</p>
            <p className="text-[10px] text-muted-foreground">学习中</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xl font-bold text-emerald-600">{stats.passed}</p>
            <p className="text-[10px] text-muted-foreground">已过关</p>
          </div>
        </div>
      )}

      {/* 筛选 */}
      <div className="flex gap-2">
        {([["all", "全部"], ["active", "学习中"], ["passed", "已过关"]] as const).map(([key, label]) => (
          <button key={key}
            onClick={() => { setFilter(key); setLoading(true); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 素材列表 */}
      {materials.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">暂无数据</div>
      ) : (
        <div className="space-y-2">
          {materials.map((item) => (
            <div key={item.id} className="rounded-lg border bg-card overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                      {item.part}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{item.score}分</span>
                    {item.status === "passed" && <span className="text-[10px]">✅ 已过关</span>}
                    {item.streak_days > 0 && item.status === "active" && (
                      <span className="text-[10px] text-orange-500">🔥{item.streak_days}/5天</span>
                    )}
                    {item.story_line && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        item.story_line === "cs-growth" ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" :
                        item.story_line === "japan-culture" ? "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300" :
                        item.story_line === "family-hometown" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" :
                        item.story_line === "school-life" ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300" :
                        "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                      }`}>
                        {item.story_line === "cs-growth" ? "💻 CS成长" :
                         item.story_line === "japan-culture" ? "🇯🇵 日本文化" :
                         item.story_line === "family-hometown" ? "🏡 家乡家庭" :
                         item.story_line === "school-life" ? "🏫 校园生活" :
                         "📌 独立"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(item.keywords_cn || []).slice(0, 3).map((kw: string, i: number) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedId === item.id ? "rotate-90" : ""}`} />
              </button>
              {expandedId === item.id && (
                <div className="px-4 pb-4 border-t">
                  <div className="rounded-lg bg-muted/50 p-3 mt-3 max-h-64 overflow-y-auto">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.content}</p>
                  </div>
                  {item.reuse_topics && item.reuse_topics.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] text-muted-foreground mb-1.5">🔄 此素材可复用于：</p>
                      <div className="flex flex-wrap gap-1.5">
                        {item.reuse_topics.map((topic: string, i: number) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-200/50 dark:border-violet-800/30">
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(item); }}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      ✏️ 编辑
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 编辑对话框 */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingItem(null)}>
          <div className="bg-background rounded-xl border shadow-lg w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-base">编辑素材</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">标题</label>
                <input
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-background"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">中文关键词（用顿号或逗号分隔）</label>
                <input
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-background"
                  value={editForm.keywords_cn}
                  onChange={(e) => setEditForm({ ...editForm, keywords_cn: e.target.value })}
                  placeholder="关键词1、关键词2、关键词3"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">内容</label>
                <textarea
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-background min-h-[200px] resize-y"
                  value={editForm.content}
                  onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setEditingItem(null)} className="px-4 py-2 rounded-lg border text-sm hover:bg-accent">
                取消
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
