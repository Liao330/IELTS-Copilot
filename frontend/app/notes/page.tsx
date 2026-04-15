"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Note } from "@/types";
import { NoteCard } from "@/components/notes/NoteCard";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { NoteViewer } from "@/components/notes/NoteViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = [
  { value: "", label: "全部" },
  { value: "writing", label: "写作" },
  { value: "speaking", label: "口语" },
  { value: "reading", label: "阅读" },
  { value: "listening", label: "听力" },
  { value: "general", label: "通用" },
] as const;

export default function NotesPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // view dialog
  const [viewingNote, setViewingNote] = useState<Note | null>(null);

  // edit dialog
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  // delete confirm
  const [deletingNote, setDeletingNote] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params: { category?: string; search?: string } = {};
      if (category) params.category = category;
      if (search) params.search = search;
      const data = await api.getNotes(params);
      setNotes(data);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", description: "加载笔记失败" });
    } finally {
      setLoading(false);
    }
  }, [category, search, toast]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleSearch = () => {
    setSearch(searchInput.trim());
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSearch();
  };

  const handleView = (note: Note) => {
    setViewingNote(note);
  };

  const handleEdit = (note: Note) => {
    setViewingNote(null);
    setEditingNote(note);
  };

  const handleEditSaved = (updated: Note) => {
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  };

  const handleDeleteConfirm = async () => {
    if (!deletingNote) return;
    setDeleting(true);
    try {
      await api.deleteNote(deletingNote.id);
      setNotes((prev) => prev.filter((n) => n.id !== deletingNote.id));
      toast({ description: "笔记已删除" });
      setDeletingNote(null);
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "删除失败",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            📒 我的笔记
          </h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* 分类标签 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {CATEGORIES.map((c) => (
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
            </button>
          ))}
        </div>

        {/* 搜索 */}
        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索笔记..."
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
          <Button onClick={handleSearch} variant="secondary">
            搜索
          </Button>
        </div>

        {/* 笔记列表 */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground animate-pulse">加载中...</div>
        ) : notes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-2">
              {search || category ? "没有找到匹配的笔记" : "还没有保存任何笔记"}
            </p>
            <p className="text-sm text-muted-foreground">
              在对话中点击&ldquo;保存为笔记&rdquo;按钮来添加笔记
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={setDeletingNote}
              />
            ))}
          </div>
        )}
      </main>

      {/* 查看弹窗 */}
      {viewingNote && (
        <NoteViewer
          open={!!viewingNote}
          onOpenChange={(open) => { if (!open) setViewingNote(null); }}
          note={viewingNote}
          onEdit={handleEdit}
        />
      )}

      {/* 编辑弹窗 */}
      {editingNote && (
        <NoteEditor
          open={!!editingNote}
          onOpenChange={(open) => { if (!open) setEditingNote(null); }}
          note={editingNote}
          onSaved={handleEditSaved}
        />
      )}

      {/* 删除确认弹窗 */}
      <Dialog open={!!deletingNote} onOpenChange={(open) => { if (!open) setDeletingNote(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            确定要删除笔记「{deletingNote?.title}」吗？此操作不可撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingNote(null)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
