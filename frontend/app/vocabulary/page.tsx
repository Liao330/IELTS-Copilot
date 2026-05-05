"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { VocabularyWord, FavoriteSentence, VocabularyStats } from "@/types";
import { WordCard } from "@/components/vocabulary/WordCard";
import { SentenceCard } from "@/components/vocabulary/SentenceCard";
import { WordEditor } from "@/components/vocabulary/WordEditor";
import { SentenceEditor } from "@/components/vocabulary/SentenceEditor";
import { ReviewCard } from "@/components/vocabulary/ReviewCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Search,
  Plus,
  BookOpen,
  GraduationCap,
  Star,
  Brain,
  Trophy,
  Clock,
  Headphones,
  ChevronLeft,
  ChevronRight,
  Flame,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = [
  { value: "", label: "全部" },
  { value: "writing", label: "写作" },
  { value: "speaking", label: "口语" },
  { value: "reading", label: "阅读" },
  { value: "listening", label: "听力单词" },
  { value: "general", label: "通用" },
] as const;

type TabType = "words" | "sentences" | "review";

export default function VocabularyPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [tab, setTab] = useState<TabType>("words");
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [sentences, setSentences] = useState<FavoriteSentence[]>([]);
  const [stats, setStats] = useState<VocabularyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState<"" | "encounter">("encounter");

  // 编辑/添加状态
  const [editingWord, setEditingWord] = useState<VocabularyWord | null>(null);
  const [showAddWord, setShowAddWord] = useState(false);
  const [editingSentence, setEditingSentence] = useState<FavoriteSentence | null>(null);
  const [showAddSentence, setShowAddSentence] = useState(false);

  // 删除确认
  const [deletingWord, setDeletingWord] = useState<VocabularyWord | null>(null);
  const [deletingSentence, setDeletingSentence] = useState<FavoriteSentence | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 复习模式
  const [reviewWords, setReviewWords] = useState<VocabularyWord[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewComplete, setReviewComplete] = useState(false);

  // 分页
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 50;

  // 加载数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData] = await Promise.all([api.getVocabularyStats()]);
      setStats(statsData);

      if (tab === "words") {
        const params: Record<string, string | number | boolean> = { page, page_size: PAGE_SIZE };
        if (category) params.category = category;
        if (search) params.search = search;
        if (sortBy) params.sort = sortBy;
        const wordsData = await api.getWords(params as { category?: string; search?: string; sort?: string; page?: number; page_size?: number });
        setWords(wordsData);
        setHasMore(wordsData.length >= PAGE_SIZE);
      } else if (tab === "sentences") {
        const params: Record<string, string> = {};
        if (category) params.category = category;
        if (search) params.search = search;
        const sentencesData = await api.getSentences(params as { category?: string; search?: string });
        setSentences(sentencesData);
      } else if (tab === "review") {
        const dueWords = await api.getDueWords(30);
        setReviewWords(dueWords);
        setReviewIndex(0);
        setReviewComplete(false);
      }
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "加载数据失败" });
    } finally {
      setLoading(false);
    }
  }, [tab, category, search, page, sortBy, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [tab, category, search, sortBy]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = () => setSearch(searchInput.trim());
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSearch();
  };

  // 复习操作
  const handleReview = async (wordId: string, quality: number) => {
    try {
      await api.reviewWord(wordId, quality);
      if (reviewIndex + 1 >= reviewWords.length) {
        setReviewComplete(true);
        // 刷新统计
        const newStats = await api.getVocabularyStats();
        setStats(newStats);
      } else {
        setReviewIndex((prev) => prev + 1);
      }
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "复习提交失败",
      });
    }
  };

  // 删除单词
  const handleDeleteWord = async () => {
    if (!deletingWord) return;
    setDeleting(true);
    try {
      await api.deleteWord(deletingWord.id);
      setWords((prev) => prev.filter((w) => w.id !== deletingWord.id));
      toast({ description: "单词已删除" });
      setDeletingWord(null);
      const newStats = await api.getVocabularyStats();
      setStats(newStats);
    } catch {
      toast({ variant: "destructive", description: "删除失败" });
    } finally {
      setDeleting(false);
    }
  };

  // 删除佳句
  const handleDeleteSentence = async () => {
    if (!deletingSentence) return;
    setDeleting(true);
    try {
      await api.deleteSentence(deletingSentence.id);
      setSentences((prev) => prev.filter((s) => s.id !== deletingSentence.id));
      toast({ description: "佳句已删除" });
      setDeletingSentence(null);
      const newStats = await api.getVocabularyStats();
      setStats(newStats);
    } catch {
      toast({ variant: "destructive", description: "删除失败" });
    } finally {
      setDeleting(false);
    }
  };

  // 保存回调
  const handleWordSaved = (saved: VocabularyWord) => {
    if (editingWord) {
      setWords((prev) => prev.map((w) => (w.id === saved.id ? saved : w)));
    } else {
      setWords((prev) => [saved, ...prev]);
    }
    setEditingWord(null);
    setShowAddWord(false);
    api.getVocabularyStats().then(setStats).catch(() => {});
  };

  const handleSentenceSaved = (saved: FavoriteSentence) => {
    if (editingSentence) {
      setSentences((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
    } else {
      setSentences((prev) => [saved, ...prev]);
    }
    setEditingSentence(null);
    setShowAddSentence(false);
    api.getVocabularyStats().then(setStats).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 顶栏 */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            📖 单词本
          </h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl border bg-card p-3 text-center">
              <BookOpen className="h-5 w-5 mx-auto mb-1 text-blue-500" />
              <p className="text-2xl font-bold">{stats.total_words}</p>
              <p className="text-xs text-muted-foreground">总单词</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <Brain className="h-5 w-5 mx-auto mb-1 text-amber-500" />
              <p className="text-2xl font-bold">{stats.learning_words}</p>
              <p className="text-xs text-muted-foreground">学习中</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <Trophy className="h-5 w-5 mx-auto mb-1 text-emerald-500" />
              <p className="text-2xl font-bold">{stats.mastered_words}</p>
              <p className="text-xs text-muted-foreground">已掌握</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center cursor-pointer hover:bg-accent transition-colors"
              onClick={() => setTab("review")}
            >
              <Clock className="h-5 w-5 mx-auto mb-1 text-red-500" />
              <p className="text-2xl font-bold">{stats.due_review_count}</p>
              <p className="text-xs text-muted-foreground">待复习</p>
            </div>
          </div>
        )}

        {/* Tab 切换 */}
        <div className="flex items-center gap-2 mb-4">
          <Button
            variant={tab === "words" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setTab("words")}
          >
            <BookOpen className="h-4 w-4" />
            单词 {stats ? `(${stats.total_words})` : ""}
          </Button>
          <Button
            variant={tab === "sentences" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setTab("sentences")}
          >
            <Star className="h-4 w-4" />
            佳句 {stats ? `(${stats.total_sentences})` : ""}
          </Button>
          <Button
            variant={tab === "review" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => setTab("review")}
          >
            <GraduationCap className="h-4 w-4" />
            复习模式
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
            onClick={() => router.push("/vocabulary/dictation")}
          >
            <Headphones className="h-4 w-4" />
            听写模式
          </Button>

          <div className="flex-1" />

          {tab === "words" && (
            <Button size="sm" className="gap-1" onClick={() => setShowAddWord(true)}>
              <Plus className="h-4 w-4" />
              添加单词
            </Button>
          )}
          {tab === "sentences" && (
            <Button size="sm" className="gap-1" onClick={() => setShowAddSentence(true)}>
              <Plus className="h-4 w-4" />
              收藏佳句
            </Button>
          )}
        </div>

        {/* 单词列表 / 佳句列表 */}
        {tab !== "review" && (
          <>
            {/* 分类标签 */}
            <div className="flex flex-wrap gap-2 mb-4">
              {CATEGORIES.map((c) => {
                const count = c.value === "" ? stats?.total_words : stats?.category_counts?.[c.value];
                return (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    category === c.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {c.label}
                  {count != null && count > 0 && (
                    <span className={`ml-1.5 text-xs ${category === c.value ? "opacity-80" : "opacity-60"}`}>
                      {count}
                    </span>
                  )}
                </button>
                );
              })}
            </div>

            {/* 搜索 + 排序 */}
            <div className="flex gap-2 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={tab === "words" ? "搜索单词或释义..." : "搜索佳句..."}
                  className="pl-9"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
              </div>
              <Button onClick={handleSearch} variant="secondary">
                搜索
              </Button>
              {tab === "words" && (
                <Button
                  variant={sortBy === "encounter" ? "default" : "outline"}
                  size="icon"
                  className="flex-shrink-0"
                  title={sortBy === "encounter" ? "按遇到次数排序（点击取消）" : "按遇到次数排序"}
                  onClick={() => setSortBy(sortBy === "encounter" ? "" : "encounter")}
                >
                  <Flame className={`h-4 w-4 ${sortBy === "encounter" ? "text-primary-foreground" : "text-orange-500"}`} />
                </Button>
              )}
            </div>
          </>
        )}

        {/* 内容区域 */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground animate-pulse">加载中...</div>
        ) : tab === "words" ? (
          words.length === 0 ? (
            <div className="text-center py-16">
              <BookOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground mb-1">
                {search || category ? "没有找到匹配的单词" : "单词本还是空的"}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                在对话中选中生词可以快速添加到单词本
              </p>
              <Button onClick={() => setShowAddWord(true)} className="gap-1">
                <Plus className="h-4 w-4" />
                添加第一个单词
              </Button>
            </div>
          ) : (
            <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {words.map((w) => (
                <WordCard
                  key={w.id}
                  word={w}
                  onEdit={(w) => setEditingWord(w)}
                  onDelete={(w) => setDeletingWord(w)}
                />
              ))}
            </div>
            {/* 分页 */}
            {(page > 1 || hasMore) && (
              <div className="flex items-center justify-center gap-4 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一页
                </Button>
                <span className="text-sm text-muted-foreground">
                  第 {page} 页
                  {words.length > 0 && ` · ${words.length} 个`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasMore}
                  className="gap-1"
                >
                  下一页
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            </>
          )
        ) : tab === "sentences" ? (
          sentences.length === 0 ? (
            <div className="text-center py-16">
              <Star className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground mb-1">
                {search || category ? "没有找到匹配的佳句" : "还没有收藏任何佳句"}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                在对话中选中好词佳句可以快速收藏
              </p>
              <Button onClick={() => setShowAddSentence(true)} className="gap-1">
                <Plus className="h-4 w-4" />
                收藏第一个佳句
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sentences.map((s) => (
                <SentenceCard
                  key={s.id}
                  sentence={s}
                  onEdit={(s) => setEditingSentence(s)}
                  onDelete={(s) => setDeletingSentence(s)}
                />
              ))}
            </div>
          )
        ) : /* 复习模式 */ reviewComplete ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold mb-2">复习完成！</h2>
            <p className="text-muted-foreground mb-6">
              本轮共复习了 {reviewWords.length} 个单词
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => setTab("words")}>
                返回单词列表
              </Button>
              <Button onClick={() => { setReviewComplete(false); fetchData(); }}>
                继续复习
              </Button>
            </div>
          </div>
        ) : reviewWords.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-xl font-bold mb-2">太棒了！</h2>
            <p className="text-muted-foreground mb-4">
              暂时没有需要复习的单词，继续保持！
            </p>
            <Button variant="outline" onClick={() => setTab("words")}>
              返回单词列表
            </Button>
          </div>
        ) : (
          <ReviewCard
            word={reviewWords[reviewIndex]}
            onReview={handleReview}
            currentIndex={reviewIndex}
            totalCount={reviewWords.length}
          />
        )}
      </main>

      {/* 添加/编辑单词对话框 */}
      <WordEditor
        open={showAddWord || !!editingWord}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddWord(false);
            setEditingWord(null);
          }
        }}
        word={editingWord}
        onSaved={handleWordSaved}
      />

      {/* 添加/编辑佳句对话框 */}
      <SentenceEditor
        open={showAddSentence || !!editingSentence}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddSentence(false);
            setEditingSentence(null);
          }
        }}
        sentence={editingSentence}
        onSaved={handleSentenceSaved}
      />

      {/* 删除单词确认 */}
      <Dialog open={!!deletingWord} onOpenChange={(open) => { if (!open) setDeletingWord(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            确定要删除单词「{deletingWord?.word}」吗？复习记录也会一并删除。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingWord(null)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteWord} disabled={deleting}>
              {deleting ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除佳句确认 */}
      <Dialog open={!!deletingSentence} onOpenChange={(open) => { if (!open) setDeletingSentence(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            确定要删除这条佳句吗？此操作不可撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingSentence(null)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteSentence} disabled={deleting}>
              {deleting ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
