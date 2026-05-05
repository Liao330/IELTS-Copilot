"use client";

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

type TabType = "library" | "daily" | "dictation" | "flashcard" | "stats";

export default function WritingPracticePage() {
  const router = useRouter();
  useToast(); // available for child components
  const [tab, setTab] = useState<TabType>("daily");
  const [stats, setStats] = useState<WritingTemplateStats | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const s = await api.getWritingTemplateStats();
      setStats(s);
    } catch {}
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: "daily", label: "今日任务", icon: "📋" },
    { key: "dictation", label: "默写测试", icon: "✏️" },
    { key: "flashcard", label: "闪卡复习", icon: "🃏" },
    { key: "library", label: "句型库", icon: "📚" },
    { key: "stats", label: "统计", icon: "📈" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="container mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            ✍️ 写作句型背诵
          </h1>
          {stats && (
            <span className="ml-auto text-xs text-muted-foreground">
              {stats.mastered}/{stats.total} 已掌握 · 今日新学 {stats.learned_today} · 待复习 {stats.due_today}
            </span>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 max-w-3xl">
        {/* Tab bar */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === "daily" && <DailyTab onUpdate={fetchStats} />}
        {tab === "dictation" && <DictationTab onUpdate={fetchStats} />}
        {tab === "flashcard" && <FlashcardTab onUpdate={fetchStats} />}
        {tab === "library" && <LibraryTab />}
        {tab === "stats" && stats && <StatsTab stats={stats} />}
      </main>
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
                {item.example_en && <p className="text-xs text-muted-foreground italic">{item.example_en}</p>}
                {item.note && <p className="text-xs text-muted-foreground">💡 {item.note}</p>}
                <Button size="sm" variant="outline" onClick={() => handleMarkSeen(item)} className="gap-1">
                  <CheckCircle className="h-3.5 w-3.5" /> 已看，加入复习
                </Button>
              </div>
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

  // 填空模式状态
  const [blankInfo, setBlankInfo] = useState<import("@/types").BlankSlotsInfo | null>(null);
  const [blankLoading, setBlankLoading] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setFinished(false);
    // 只取今日到期的 mastery>=2 句型，不随机补充
    const due = await api.getWritingTemplatesDue(20);
    const eligible = due.filter((t) => t.mastery_level >= 2);
    setQueue(eligible);
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
      <p className="text-lg">✅</p>
      <p>今日默写任务已完成</p>
      <p className="text-xs">明天会有新的到期句型，保持节奏！</p>
    </div>
  );

  if (finished) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-2xl">🎉</p>
        <p className="text-sm font-medium">本轮默写全部完成！</p>
        <p className="text-xs text-muted-foreground">
          ✅ {sessionStats.correct}/{sessionStats.total} 正确
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
        {/* 完整默写模式：只给中文场景 + note */}
        {!isFillMode && current.note && (
          <p className="text-xs text-muted-foreground">💡 {current.note}</p>
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
              <p className="text-sm font-mono">{result.expected}</p>
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
  const [queue, setQueue] = useState<WritingTemplate[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setFinished(false);
    const due = await api.getWritingTemplatesDue(20);
    setQueue(due);
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
    // Next or finish
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
      <p className="text-xs">去「默写测试」检验掌握程度，或等明天新句型到期</p>
    </div>
  );

  if (finished) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-2xl">🎉</p>
        <p className="text-sm font-medium">本轮闪卡全部完成！</p>
        <p className="text-xs text-muted-foreground">
          ✅ {sessionStats.correct}/{sessionStats.total} 正确
        </p>
        <Button variant="outline" onClick={() => { setSessionStats({ correct: 0, total: 0 }); loadQueue(); }} className="gap-1">
          再来一轮
        </Button>
      </div>
    );
  }

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
          // Front: show English template
          <div className="text-center space-y-3">
            <Badge className={CATEGORY_MAP[current.category]?.color || ""} variant="outline">
              {CATEGORY_MAP[current.category]?.emoji} {CATEGORY_MAP[current.category]?.label}
            </Badge>
            <p className="text-lg font-mono leading-relaxed">{current.template_en}</p>
            <p className="text-xs text-muted-foreground">👆 点击翻转查看场景和用法</p>
          </div>
        ) : (
          // Back: show Chinese scene + example
          <div className="space-y-3">
            <p className="text-base font-semibold text-amber-700 dark:text-amber-300">🎯 使用场景：{current.scene_cn}</p>
            <p className="text-sm font-mono bg-muted/50 rounded p-2">{current.template_en}</p>
            {current.example_en && <p className="text-xs text-muted-foreground italic">例：{current.example_en}</p>}
            {current.note && <p className="text-xs text-muted-foreground">💡 {current.note}</p>}
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
            <TemplateCard key={item.id} item={item} showScene />
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

function TemplateCard({ item, showScene }: { item: WritingTemplate; showScene?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-lg border bg-card p-3 cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={() => setExpanded(!expanded)}
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
      {showScene && <p className="text-xs text-amber-700 dark:text-amber-300 mb-1">🎯 {item.scene_cn}</p>}
      <p className={`text-sm font-mono ${expanded ? "" : "line-clamp-2"}`}>{item.template_en}</p>
      {expanded && (
        <div className="mt-2 space-y-1">
          {item.example_en && <p className="text-xs text-muted-foreground italic">例：{item.example_en}</p>}
          {item.note && <p className="text-xs text-muted-foreground">💡 {item.note}</p>}
        </div>
      )}
    </div>
  );
}
