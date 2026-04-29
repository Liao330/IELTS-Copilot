"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import type { TranslateResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookPlus, X, Languages } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { WordEditor } from "./WordEditor";

export function QuickTranslate() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [translating, setTranslating] = useState(false);
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [showWordEditor, setShowWordEditor] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setResult(null);
    }
  }, [open]);

  // Esc 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K 打开
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleTranslate = async () => {
    if (!query.trim()) return;
    setTranslating(true);
    setResult(null);
    try {
      const res = await api.translateText(query.trim());
      setResult(res);
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "翻译失败" });
    } finally {
      setTranslating(false);
    }
  };

  return (
    <>
      {/* 悬浮按钮 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[9998] flex items-center justify-center h-12 w-12 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all"
        title="快速查词 (Ctrl+K)"
      >
        <Languages className="h-5 w-5" />
      </button>

      {/* 查词面板 */}
      {open && !showWordEditor && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]">
          {/* 背景遮罩 */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

          <div
            ref={panelRef}
            className="relative w-full max-w-lg mx-4 bg-popover border rounded-xl shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150"
          >
            {/* 输入区 */}
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <Languages className="h-5 w-5 text-sky-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleTranslate(); }}
                placeholder="输入单词或中文，回车翻译..."
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                autoComplete="off"
                spellCheck={false}
              />
              {translating ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <kbd className="hidden sm:inline-flex items-center rounded border bg-muted px-1.5 text-[10px] text-muted-foreground font-mono">
                  Enter
                </kbd>
              )}
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 结果区 */}
            {result && (
              <div className="px-4 py-3 space-y-2.5">
                {/* 词头 */}
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">{result.word}</span>
                  {result.phonetic && (
                    <span className="text-xs text-muted-foreground">{result.phonetic}</span>
                  )}
                  {result.pos && (
                    <Badge variant="secondary" className="text-xs py-0 px-1">{result.pos}</Badge>
                  )}
                </div>

                {/* 释义 */}
                <p className="text-sm font-medium">{result.meaning}</p>

                {/* 例句 */}
                {result.example && (
                  <div className="text-xs space-y-0.5 bg-muted/50 rounded-lg px-3 py-2">
                    <p className="italic text-muted-foreground">{result.example}</p>
                    {result.example_cn && (
                      <p className="text-muted-foreground">{result.example_cn}</p>
                    )}
                  </div>
                )}

                {/* 同义词 */}
                {result.synonyms && result.synonyms.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">同义词:</span>
                    {result.synonyms.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs py-0 px-1.5">{s}</Badge>
                    ))}
                  </div>
                )}

                {/* 备注 */}
                {result.note && (
                  <p className="text-xs text-muted-foreground">💡 {result.note}</p>
                )}

                {/* 操作 */}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => setShowWordEditor(true)}
                  >
                    <BookPlus className="h-3.5 w-3.5" />
                    加入单词本
                  </Button>
                </div>
              </div>
            )}

            {/* 空状态提示 */}
            {!result && !translating && (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                支持中英互译 · 输入单词或中文均可 · <kbd className="rounded border bg-muted px-1 font-mono">Ctrl+K</kbd> 快捷呼出
              </div>
            )}
          </div>
        </div>
      )}

      {/* 添加单词对话框 */}
      <WordEditor
        open={showWordEditor}
        onOpenChange={setShowWordEditor}
        initialWord={query}
        initialData={result}
        onSaved={() => {
          setShowWordEditor(false);
          toast({ description: "已加入单词本" });
        }}
      />
    </>
  );
}
