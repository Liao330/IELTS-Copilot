"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type {
  VocabularyWord,
  DictationMonthCheckResult,
  DictationNumberQuestion,
  DictationNumberCheckResult,
  DictationDateQuestion,
  DictationDateCheckResult,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlayButton } from "@/components/listening/PlayButton";
import {
  ArrowLeft,
  Headphones,
  Calendar,
  Hash,
  Check,
  X,
  Lightbulb,
  RefreshCw,
  Trophy,
  BookMarked,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Tab = "months" | "numbers" | "listening_words";

export default function DictationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("months");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-30">
        <div className="container mx-auto px-4 h-14 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push("/vocabulary")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Headphones className="h-5 w-5 text-amber-500" />
            听写训练
          </h1>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>🎧 朗读设置</span>
            <PlayButton text="" gearOnly size="sm" />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-xl">
        {/* Tab 切换 */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <TabButton
            active={tab === "months"}
            onClick={() => setTab("months")}
            icon={<Calendar className="h-4 w-4" />}
            label="月份/日期"
            sub="基础+进阶"
          />
          <TabButton
            active={tab === "numbers"}
            onClick={() => setTab("numbers")}
            icon={<Hash className="h-4 w-4" />}
            label="数字/时间"
            sub="无限随机"
          />
          <TabButton
            active={tab === "listening_words"}
            onClick={() => setTab("listening_words")}
            icon={<BookMarked className="h-4 w-4" />}
            label="听力单词"
            sub="精听积累"
          />
        </div>

        {tab === "months" && <MonthsTab toast={toast} />}
        {tab === "numbers" && <NumbersTab toast={toast} />}
        {tab === "listening_words" && <ListeningWordsTab toast={toast} router={router} />}
      </main>
    </div>
  );
}


function TabButton({
  active,
  onClick,
  icon,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-2.5 text-left transition-colors",
        active
          ? "border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50/70 dark:from-amber-950/40 dark:to-orange-950/30 shadow-sm"
          : "hover:bg-accent",
      )}
    >
      <div className="flex items-center gap-1.5 mb-0.5 text-sm font-medium">
        {icon}
        {label}
      </div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </button>
  );
}


// ============ Tab 1：月份 / 日期 ============

type MonthLevel = "basic" | "advanced";

function MonthsTab({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [level, setLevel] = useState<MonthLevel>("basic");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <DiffPill active={level === "basic"} onClick={() => setLevel("basic")} label="基础 · 单月份" />
        <DiffPill active={level === "advanced"} onClick={() => setLevel("advanced")} label="进阶 · 日期+月份" />
      </div>
      {level === "basic" ? <MonthsBasicView toast={toast} /> : <MonthsAdvancedView toast={toast} />}
    </div>
  );
}

function DiffPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-xs px-3 py-1.5 rounded-full border transition-colors",
        active
          ? "bg-amber-500 text-white border-amber-500"
          : "hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}

// --- 月份基础 ---
function MonthsBasicView({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [queue, setQueue] = useState<VocabularyWord[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [lastResult, setLastResult] = useState<DictationMonthCheckResult | null>(null);
  const [revealed, setRevealed] = useState(false);

  const fetchQueue = useCallback(async () => {
    try {
      const list = await api.listDueMonths(50);
      setQueue(list);
      setIdx(0);
      setInput("");
      setLastResult(null);
      setRevealed(false);
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "加载失败" });
    }
  }, [toast]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const current = queue && queue.length > 0 ? queue[idx % queue.length] : null;

  const handleCheck = async () => {
    if (!current || !input.trim()) return;
    try {
      const res = await api.checkMonth(current.id, input);
      setLastResult(res);
      setRevealed(true);
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "提交失败" });
    }
  };

  const handleNext = () => {
    if (!queue) return;
    if (idx + 1 >= queue.length) { fetchQueue(); return; }
    setIdx(idx + 1); setInput(""); setLastResult(null); setRevealed(false);
  };

  if (queue === null) return <Loading />;
  if (queue.length === 0) return <EmptyState title="暂无待练月份" description="12 个月份词条似乎未初始化。" />;
  if (!current) return null;

  return (
    <>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>进度 <span className="font-bold text-foreground">{idx + 1}</span> / {queue.length}</span>
        <button onClick={fetchQueue} className="flex items-center gap-1 hover:text-foreground">
          <RefreshCw className="h-3 w-3" />
          刷新队列
        </button>
      </div>
      <QuestionCard
        topLeft={<><Calendar className="inline h-3 w-3 mr-1" />月份拼写 · 严格匹配大小写</>}
        topRight={<MasteryBadge level={current.mastery_level} />}
        readText={current.word}
        input={input}
        setInput={setInput}
        revealed={revealed}
        feedback={revealed && lastResult && (
          <ResultFeedback
            correct={lastResult.correct}
            userAnswer={input}
            expected={lastResult.expected}
            extra={<>下次复习：{lastResult.interval_days} 天后</>}
          />
        )}
        onSubmit={handleCheck}
        onNext={handleNext}
        onReveal={() => {
          setRevealed(true);
          setLastResult({
            correct: false, expected: current.word,
            mastery_level: current.mastery_level, next_review_at: null, interval_days: 1,
          });
          void api.checkMonth(current.id, "").catch(() => {});
        }}
        placeholder="打出你听到的月份"
      />
      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
        💡 答对会按 SM-2 延长复习间隔；答错或看答案的月份明天再练。
      </p>
    </>
  );
}

// --- 月份进阶（日期+月份） ---
function MonthsAdvancedView({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [question, setQuestion] = useState<DictationDateQuestion | null>(null);
  const [input, setInput] = useState("");
  const [lastResult, setLastResult] = useState<DictationDateCheckResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const next = useCallback(async () => {
    try {
      const q = await api.randomDateQuestion();
      setQuestion(q); setInput(""); setLastResult(null); setRevealed(false);
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "出题失败" });
    }
  }, [toast]);

  useEffect(() => { next(); }, [next]);

  const handleCheck = async () => {
    if (!question || !input.trim()) return;
    try {
      const res = await api.checkDate(question.text, input);
      setLastResult(res);
      setRevealed(true);
      setStats((s) => ({ correct: s.correct + (res.correct ? 1 : 0), total: s.total + 1 }));
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "提交失败" });
    }
  };

  if (!question) return <Loading />;

  return (
    <>
      <div className="flex items-center justify-end text-xs text-muted-foreground">
        <Trophy className="h-3 w-3 mr-1" />{stats.correct}/{stats.total}
      </div>
      <QuestionCard
        topLeft={<><Calendar className="inline h-3 w-3 mr-1" />日期+月份 · 任一英式写法均可</>}
        readText={question.read_text}
        input={input}
        setInput={setInput}
        revealed={revealed}
        feedback={revealed && lastResult && (
          <ResultFeedback
            correct={lastResult.correct}
            userAnswer={input}
            expected={lastResult.expected}
            extra={<>合法写法举例：3rd March / March 3rd / the 3rd of March</>}
          />
        )}
        onSubmit={handleCheck}
        onNext={next}
        onReveal={() => {
          setRevealed(true);
          setLastResult({ correct: false, expected: question.text });
          setStats((s) => ({ ...s, total: s.total + 1 }));
        }}
        placeholder="例如：3rd March / March 3rd / the 3rd of March"
      />
      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
        💡 月份首字母大写、序数词后缀（st/nd/rd/th）拼写正确即可。
      </p>
    </>
  );
}


// ============ Tab 2：数字 / 时间 ============

const NUMBER_KINDS: { value: string; label: string }[] = [
  { value: "", label: "全部随机" },
  { value: "phone", label: "电话" },
  { value: "postcode", label: "邮编" },
  { value: "flight_no", label: "航班号" },
  { value: "card_no", label: "银行卡" },
  { value: "room_no", label: "房间号" },
  { value: "price", label: "价格" },
  { value: "year", label: "年份" },
  { value: "time", label: "时间 ⏰" },
  { value: "percent", label: "百分比" },
  { value: "fraction", label: "分数" },
  { value: "measurement", label: "测量" },
];

function NumbersTab({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [kind, setKind] = useState("");
  const [question, setQuestion] = useState<DictationNumberQuestion | null>(null);
  const [input, setInput] = useState("");
  const [lastResult, setLastResult] = useState<DictationNumberCheckResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [loading, setLoading] = useState(false);

  const nextQuestion = useCallback(async () => {
    setLoading(true);
    try {
      const q = await api.randomNumberQuestion(kind || undefined);
      setQuestion(q); setInput(""); setLastResult(null); setRevealed(false);
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "获取题目失败" });
    } finally {
      setLoading(false);
    }
  }, [kind, toast]);

  useEffect(() => { nextQuestion(); }, [nextQuestion]);

  const handleCheck = async () => {
    if (!question || !input.trim()) return;
    try {
      const res = await api.checkNumber(question.text, input, question.kind);
      setLastResult(res); setRevealed(true);
      setStats((s) => ({ correct: s.correct + (res.correct ? 1 : 0), total: s.total + 1 }));
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "提交失败" });
    }
  };

  const placeholderHint = useMemo(() => {
    if (!question) return "打出你听到的内容";
    if (question.kind === "time") return "例如：9:45 / quarter to ten / half past nine";
    if (question.kind === "fraction") return "例如：1/2 或 a half";
    if (question.kind === "percent") return "例如：25% 或 25";
    return "打出你听到的内容";
  }, [question]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {NUMBER_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              className={cn(
                "text-xs px-2 py-1 rounded-full border transition-colors",
                kind === k.value
                  ? "bg-amber-500 text-white border-amber-500"
                  : "hover:bg-accent",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Trophy className="h-3 w-3" />{stats.correct}/{stats.total}
        </div>
      </div>

      {question && (
        <QuestionCard
          topLeft={<><Hash className="inline h-3 w-3 mr-1" />{question.hint}</>}
          readText={question.read_text}
          input={input}
          setInput={setInput}
          revealed={revealed}
          feedback={revealed && lastResult && (
            <ResultFeedback
              correct={lastResult.correct}
              userAnswer={input}
              expected={lastResult.expected}
              extra={<>多种合法写法均可（空格、大小写、文字/数字形式）</>}
            />
          )}
          onSubmit={handleCheck}
          onNext={nextQuestion}
          nextLoading={loading}
          onReveal={() => {
            setRevealed(true);
            setLastResult({ correct: false, expected: question.text });
            setStats((s) => ({ ...s, total: s.total + 1 }));
          }}
          placeholder={placeholderHint}
          inputMono
        />
      )}

      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
        💡 时间/分数/日期支持多种英式写法；纯数字串忽略空格。
      </p>
    </div>
  );
}


// ============ Tab 3：听力单词 ============

function ListeningWordsTab({
  toast,
  router,
}: {
  toast: ReturnType<typeof useToast>["toast"];
  router: ReturnType<typeof useRouter>;
}) {
  const [queue, setQueue] = useState<VocabularyWord[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [lastResult, setLastResult] = useState<DictationMonthCheckResult | null>(null);
  const [revealed, setRevealed] = useState(false);

  const fetchQueue = useCallback(async () => {
    try {
      const list = await api.listDueListeningWords(50);
      // 随机排列
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      setQueue(list);
      setIdx(0); setInput(""); setLastResult(null); setRevealed(false);
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "加载失败" });
    }
  }, [toast]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const current = queue && queue.length > 0 ? queue[idx % queue.length] : null;

  const handleCheck = async () => {
    if (!current || !input.trim()) return;
    try {
      const res = await api.checkListeningWord(current.id, input);
      setLastResult(res); setRevealed(true);
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "提交失败" });
    }
  };

  const handleNext = () => {
    if (!queue) return;
    if (idx + 1 >= queue.length) { fetchQueue(); return; }
    setIdx(idx + 1); setInput(""); setLastResult(null); setRevealed(false);
  };

  if (queue === null) return <Loading />;
  if (queue.length === 0) {
    return (
      <EmptyState
        title="还没有听力单词"
        description="去精听练习里标记障碍词，会自动加入「听力单词」分类；也可以在单词本里手动把现有单词分类改为「听力单词」。"
        action={
          <div className="flex items-center justify-center gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={() => router.push("/listening-practice")}>
              去精听练习
            </Button>
            <Button size="sm" variant="outline" onClick={() => router.push("/vocabulary")}>
              回到单词本
            </Button>
          </div>
        }
      />
    );
  }
  if (!current) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>进度 <span className="font-bold text-foreground">{idx + 1}</span> / {queue.length}</span>
        <button onClick={fetchQueue} className="flex items-center gap-1 hover:text-foreground">
          <RefreshCw className="h-3 w-3" />
          刷新队列
        </button>
      </div>
      <QuestionCard
        topLeft={<><BookMarked className="inline h-3 w-3 mr-1" />听力单词 · 大小写不敏感</>}
        topRight={<MasteryBadge level={current.mastery_level} />}
        readText={current.word}
        input={input}
        setInput={setInput}
        revealed={revealed}
        feedback={revealed && lastResult && (
          <ResultFeedback
            correct={lastResult.correct}
            userAnswer={input}
            expected={lastResult.expected}
            extra={<>下次复习：{lastResult.interval_days} 天后{current.meaning ? ` · 释义：${current.meaning}` : ""}</>}
          />
        )}
        onSubmit={handleCheck}
        onNext={handleNext}
        onReveal={() => {
          setRevealed(true);
          setLastResult({
            correct: false, expected: current.word,
            mastery_level: current.mastery_level, next_review_at: null, interval_days: 1,
          });
          void api.checkListeningWord(current.id, "").catch(() => {});
        }}
        placeholder="打出你听到的单词"
      />
      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
        💡 队列只包含「听力单词」分类的词条（精听标记 + 你手动设置的）。
      </p>
    </div>
  );
}


// ============ 公共：题卡 ============

function QuestionCard({
  topLeft,
  topRight,
  readText,
  input,
  setInput,
  revealed,
  feedback,
  onSubmit,
  onNext,
  onReveal,
  placeholder,
  inputMono,
  nextLoading,
}: {
  topLeft: React.ReactNode;
  topRight?: React.ReactNode;
  readText: string;
  input: string;
  setInput: (v: string) => void;
  revealed: boolean;
  feedback: React.ReactNode;
  onSubmit: () => void;
  onNext: () => void;
  onReveal: () => void;
  placeholder: string;
  inputMono?: boolean;
  nextLoading?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-gradient-to-br from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{topLeft}</div>
        {topRight}
      </div>

      <div className="flex items-center justify-center py-4">
        <PlayButton text={readText} size="md" className="rounded-full h-14 w-14" />
      </div>

      <Input
        autoFocus
        value={input}
        onChange={(e) => { if (!revealed) setInput(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (!revealed) onSubmit();
            else onNext();
          }
        }}
        readOnly={revealed}
        placeholder={placeholder}
        className={cn("text-center text-lg h-12", inputMono ? "font-mono" : "font-medium")}
      />

      {feedback}

      <div className="flex gap-2">
        {!revealed ? (
          <>
            <Button variant="outline" onClick={onReveal} className="flex-1 gap-1.5">
              <Lightbulb className="h-4 w-4" />
              不会，看答案
            </Button>
            <Button
              onClick={onSubmit}
              disabled={!input.trim()}
              className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white gap-1.5"
            >
              <Check className="h-4 w-4" />
              提交
            </Button>
          </>
        ) : (
          <Button
            onClick={onNext}
            disabled={nextLoading}
            className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white"
          >
            下一题 →
          </Button>
        )}
      </div>
    </div>
  );
}

function MasteryBadge({ level }: { level: number }) {
  const map = [
    { label: "新词", color: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
    { label: "模糊", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
    { label: "认识", color: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
    { label: "熟练", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  ];
  const cfg = map[level] || map[0];
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", cfg.color)}>
      {cfg.label}
    </span>
  );
}

function ResultFeedback({
  correct,
  userAnswer,
  expected,
  extra,
}: {
  correct: boolean;
  userAnswer: string;
  expected: string;
  extra?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg p-3 space-y-1 text-sm border",
        correct
          ? "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-200"
          : "bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-200",
      )}
    >
      <div className="flex items-center gap-1 font-medium">
        {correct ? (<><Check className="h-4 w-4" />正确！</>) : (<><X className="h-4 w-4" />不对哦</>)}
      </div>
      {!correct && (
        <>
          <div className="text-xs">
            你的答案：<span className="font-mono">{userAnswer || "（空）"}</span>
          </div>
          <div className="text-xs">
            正确答案：<span className="font-mono font-bold">{expected}</span>
          </div>
        </>
      )}
      {extra && <div className="text-[11px] opacity-80">{extra}</div>}
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-10 text-center">
      <Headphones className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
      {action}
    </div>
  );
}

function Loading() {
  return <div className="text-center py-12 text-muted-foreground">加载中...</div>;
}
