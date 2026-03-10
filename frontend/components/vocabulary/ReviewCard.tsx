"use client";

import { useState } from "react";
import type { VocabularyWord } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Eye, EyeOff } from "lucide-react";

interface ReviewCardProps {
  word: VocabularyWord;
  onReview: (wordId: string, quality: number) => void;
  currentIndex: number;
  totalCount: number;
}

export function ReviewCard({ word, onReview, currentIndex, totalCount }: ReviewCardProps) {
  const [flipped, setFlipped] = useState(false);

  const synonyms: string[] = word.synonyms
    ? (() => { try { return JSON.parse(word.synonyms); } catch { return []; } })()
    : [];

  const handleFlip = () => setFlipped((prev) => !prev);

  const handleReview = (quality: number) => {
    setFlipped(false);
    onReview(word.id, quality);
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto">
      {/* 进度 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{currentIndex + 1} / {totalCount}</span>
        <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalCount) * 100}%` }}
          />
        </div>
      </div>

      {/* 卡片 */}
      <div
        className="w-full min-h-[320px] cursor-pointer perspective-1000"
        onClick={handleFlip}
      >
        <div
          className={`relative w-full min-h-[320px] transition-transform duration-500 transform-style-preserve-3d ${
            flipped ? "rotate-y-180" : ""
          }`}
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* 正面：单词 */}
          <div
            className="absolute inset-0 rounded-2xl border-2 bg-card shadow-lg p-8 flex flex-col items-center justify-center gap-4"
            style={{ backfaceVisibility: "hidden" }}
          >
            <p className="text-3xl font-bold">{word.word}</p>
            {word.phonetic && (
              <p className="text-base text-muted-foreground">{word.phonetic}</p>
            )}
            {word.pos && (
              <Badge variant="secondary" className="text-sm">{word.pos}</Badge>
            )}
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Eye className="h-4 w-4" />
              <span>点击翻转查看释义</span>
            </div>
          </div>

          {/* 背面：释义和详情 */}
          <div
            className="absolute inset-0 rounded-2xl border-2 bg-card shadow-lg p-8 flex flex-col items-center justify-center gap-3 overflow-y-auto"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <p className="text-xl font-bold text-primary">{word.meaning}</p>

            {word.example && (
              <div className="w-full text-center space-y-1 mt-2">
                <p className="text-sm italic text-muted-foreground leading-relaxed">
                  {word.example}
                </p>
                {word.example_cn && (
                  <p className="text-xs text-muted-foreground">
                    {word.example_cn}
                  </p>
                )}
              </div>
            )}

            {synonyms.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap justify-center mt-1">
                <span className="text-xs text-muted-foreground">同义词:</span>
                {synonyms.map((s) => (
                  <Badge key={s} variant="outline" className="text-xs">
                    {s}
                  </Badge>
                ))}
              </div>
            )}

            {word.note && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-1.5 mt-1">
                💡 {word.note}
              </p>
            )}

            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <EyeOff className="h-4 w-4" />
              <span>点击翻转回正面</span>
            </div>
          </div>
        </div>
      </div>

      {/* 评价按钮 */}
      <div className="grid grid-cols-4 gap-3 w-full">
        <Button
          variant="outline"
          className="flex flex-col gap-1 h-auto py-3 border-red-200 hover:bg-red-50 hover:border-red-300 dark:border-red-800 dark:hover:bg-red-950"
          onClick={() => handleReview(0)}
        >
          <span className="text-lg">😵</span>
          <span className="text-xs font-medium text-red-600 dark:text-red-400">不认识</span>
        </Button>
        <Button
          variant="outline"
          className="flex flex-col gap-1 h-auto py-3 border-amber-200 hover:bg-amber-50 hover:border-amber-300 dark:border-amber-800 dark:hover:bg-amber-950"
          onClick={() => handleReview(1)}
        >
          <span className="text-lg">🤔</span>
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">模糊</span>
        </Button>
        <Button
          variant="outline"
          className="flex flex-col gap-1 h-auto py-3 border-sky-200 hover:bg-sky-50 hover:border-sky-300 dark:border-sky-800 dark:hover:bg-sky-950"
          onClick={() => handleReview(2)}
        >
          <span className="text-lg">😊</span>
          <span className="text-xs font-medium text-sky-600 dark:text-sky-400">认识</span>
        </Button>
        <Button
          variant="outline"
          className="flex flex-col gap-1 h-auto py-3 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-950"
          onClick={() => handleReview(3)}
        >
          <span className="text-lg">🎯</span>
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">熟练</span>
        </Button>
      </div>
    </div>
  );
}
