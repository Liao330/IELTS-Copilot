"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageCircle, Plus, Copy, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

interface FeedbackItem {
  id: string;
  text: string;
  done: boolean;
  created_at: string;
}

export function FeedbackButton() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [newText, setNewText] = useState("");

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/feedback/`);
      if (res.ok) setItems(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleAdd = async () => {
    if (!newText.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/feedback/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newText.trim() }),
      });
      if (res.ok) {
        const item = await res.json();
        setItems((prev) => [...prev, item]);
        setNewText("");
      }
    } catch {
      toast({ variant: "destructive", description: "添加失败" });
    }
  };

  const handleToggle = async (id: string) => {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    try {
      const res = await fetch(`${API_BASE}/api/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !item.done }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
      }
    } catch {}
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/feedback/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch {}
  };

  const handleCopyAll = () => {
    const text = items
      .map((it, i) => `${i + 1}. [${it.done ? "x" : " "}] ${it.text}`)
      .join("\n");
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {
      navigator.clipboard?.writeText(text).catch(() => {});
    }
    // 关闭面板后再显示 toast，确保 toast 在最顶层
    setOpen(false);
    setTimeout(() => toast({ description: "已复制所有反馈到剪贴板" }), 100);
  };

  return (
    <>
      {/* 左下角悬浮按钮 */}
      <button
        type="button"
        onClick={() => { setOpen(true); fetchItems(); }}
        className="fixed bottom-6 left-6 z-[9998] flex items-center justify-center h-10 w-10 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all"
        title="反馈建议"
      >
        <MessageCircle className="h-4 w-4" />
        {items.filter((it) => !it.done).length > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-[16px] rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
            {items.filter((it) => !it.done).length}
          </span>
        )}
      </button>

      {/* 面板 */}
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md mx-4 mb-4 sm:mb-0 bg-popover border rounded-xl shadow-2xl animate-in fade-in-0 slide-in-from-bottom-4 duration-200 max-h-[80vh] flex flex-col">
            {/* 头部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <h3 className="font-semibold text-sm">反馈 & 待办</h3>
              <div className="flex items-center gap-2">
                {items.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleCopyAll} className="h-7 text-xs gap-1">
                    <Copy className="h-3 w-3" />
                    复制全部
                  </Button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 列表 */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {items.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">暂无反馈，在下方输入你的问题或建议</p>
              )}
              {items.map((it) => (
                <div key={it.id} className="flex items-start gap-2 group">
                  <button
                    type="button"
                    onClick={() => handleToggle(it.id)}
                    className={`mt-0.5 h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                      it.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-muted-foreground/40 hover:border-emerald-500"
                    }`}
                  >
                    {it.done && <Check className="h-2.5 w-2.5" />}
                  </button>
                  <p className={`text-sm flex-1 leading-relaxed ${it.done ? "line-through text-muted-foreground/60" : ""}`}>
                    {it.text}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleDelete(it.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-opacity shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* 输入区 */}
            <div className="px-4 py-3 border-t shrink-0">
              <div className="flex gap-2">
                <Textarea
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAdd(); } }}
                  placeholder="输入反馈或遇到的问题..."
                  rows={2}
                  className="text-sm resize-none"
                />
                <Button size="sm" onClick={handleAdd} disabled={!newText.trim()} className="shrink-0 self-end">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
