"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import type { TranslateResult, VocabularyWord, FavoriteSentence } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookPlus, Star, X, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { WordEditor } from "./WordEditor";
import { SentenceEditor } from "./SentenceEditor";

export function TranslatePopover() {
  const { toast } = useToast();

  // 工具条状态
  const [selectedText, setSelectedText] = useState("");
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);

  // 翻译结果浮窗
  const [translating, setTranslating] = useState(false);
  const [translateResult, setTranslateResult] = useState<TranslateResult | null>(null);
  const [resultPos, setResultPos] = useState<{ x: number; y: number } | null>(null);

  // 添加对话框
  const [showWordEditor, setShowWordEditor] = useState(false);
  const [showSentenceEditor, setShowSentenceEditor] = useState(false);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const closeAll = useCallback(() => {
    setToolbarPos(null);
    setResultPos(null);
    setTranslateResult(null);
    setSelectedText("");
  }, []);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // 忽略来自浮窗内部的点击
      if (
        toolbarRef.current?.contains(e.target as Node) ||
        resultRef.current?.contains(e.target as Node)
      ) {
        return;
      }

      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (text && text.length > 0 && text.length < 500) {
        const range = selection?.getRangeAt(0);
        if (range) {
          const rect = range.getBoundingClientRect();
          setSelectedText(text);
          setToolbarPos({
            x: rect.left + rect.width / 2,
            y: rect.top - 10,
          });
          setTranslateResult(null);
          setResultPos(null);
        }
      } else if (!text) {
        closeAll();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeAll]);

  const handleTranslate = async () => {
    if (!selectedText) return;
    setTranslating(true);
    setResultPos(toolbarPos);

    try {
      const result = await api.translateText(selectedText);
      setTranslateResult(result);
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "翻译失败",
      });
      setResultPos(null);
    } finally {
      setTranslating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedText);
    toast({ description: "已复制" });
    closeAll();
  };

  const handleAddWord = () => {
    setShowWordEditor(true);
  };

  const handleAddSentence = () => {
    setShowSentenceEditor(true);
  };

  const handleWordSaved = (word: VocabularyWord) => {
    closeAll();
  };

  const handleSentenceSaved = (sentence: FavoriteSentence) => {
    closeAll();
  };

  // 确保浮窗在视口内
  const adjustPosition = (x: number, y: number, width: number) => {
    const viewportWidth = window.innerWidth;
    const adjustedX = Math.max(width / 2 + 8, Math.min(x, viewportWidth - width / 2 - 8));
    const adjustedY = Math.max(60, y);
    return { x: adjustedX, y: adjustedY };
  };

  return (
    <>
      {/* 工具条 */}
      {toolbarPos && !resultPos && (
        <div
          ref={toolbarRef}
          className="fixed z-[9999] animate-in fade-in-0 zoom-in-95 duration-150"
          style={{
            left: `${adjustPosition(toolbarPos.x, toolbarPos.y, 200).x}px`,
            top: `${adjustPosition(toolbarPos.x, toolbarPos.y, 200).y}px`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="flex items-center gap-1 bg-popover border rounded-lg shadow-lg p-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1 px-2"
              onClick={handleCopy}
            >
              <Copy className="h-3.5 w-3.5" />
              复制
            </Button>
            <div className="w-px h-5 bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1 px-2"
              onClick={handleTranslate}
            >
              🔍 翻译
            </Button>
            <div className="w-px h-5 bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1 px-2"
              onClick={handleAddWord}
            >
              <BookPlus className="h-3.5 w-3.5" />
              加入单词本
            </Button>
            <div className="w-px h-5 bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1 px-2"
              onClick={handleAddSentence}
            >
              <Star className="h-3.5 w-3.5" />
              收藏佳句
            </Button>
          </div>
        </div>
      )}

      {/* 翻译结果浮窗 */}
      {resultPos && (translating || translateResult) && (
        <div
          ref={resultRef}
          className="fixed z-[9999] animate-in fade-in-0 slide-in-from-top-2 duration-200"
          style={{
            left: `${adjustPosition(resultPos.x, resultPos.y, 320).x}px`,
            top: `${adjustPosition(resultPos.x, resultPos.y, 320).y}px`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="w-80 bg-popover border rounded-xl shadow-xl p-4">
            {translating ? (
              <div className="flex items-center justify-center gap-2 py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">翻译中...</span>
              </div>
            ) : translateResult ? (
              <div className="space-y-2.5">
                {/* 头部 */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-base">{translateResult.word}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {translateResult.phonetic && (
                        <span className="text-xs text-muted-foreground">
                          {translateResult.phonetic}
                        </span>
                      )}
                      {translateResult.pos && (
                        <Badge variant="secondary" className="text-xs py-0 px-1">
                          {translateResult.pos}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={closeAll}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* 释义 */}
                <p className="text-sm font-medium">{translateResult.meaning}</p>

                {/* 例句 */}
                {translateResult.example && (
                  <div className="text-xs space-y-0.5 bg-muted/50 rounded-lg px-3 py-2">
                    <p className="italic text-muted-foreground">{translateResult.example}</p>
                    {translateResult.example_cn && (
                      <p className="text-muted-foreground">{translateResult.example_cn}</p>
                    )}
                  </div>
                )}

                {/* 同义词 */}
                {translateResult.synonyms && translateResult.synonyms.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">同义词:</span>
                    {translateResult.synonyms.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs py-0 px-1.5">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* 备注 */}
                {translateResult.note && (
                  <p className="text-xs text-muted-foreground">
                    💡 {translateResult.note}
                  </p>
                )}

                {/* 操作按钮 */}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs gap-1"
                    onClick={handleAddWord}
                  >
                    <BookPlus className="h-3.5 w-3.5" />
                    加入单词本
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs gap-1"
                    onClick={handleAddSentence}
                  >
                    <Star className="h-3.5 w-3.5" />
                    收藏佳句
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* 添加单词对话框 */}
      <WordEditor
        open={showWordEditor}
        onOpenChange={setShowWordEditor}
        initialWord={selectedText}
        initialData={translateResult}
        onSaved={handleWordSaved}
      />

      {/* 收藏佳句对话框 */}
      <SentenceEditor
        open={showSentenceEditor}
        onOpenChange={setShowSentenceEditor}
        initialContent={selectedText}
        initialTranslation={translateResult?.meaning}
        onSaved={handleSentenceSaved}
      />
    </>
  );
}
