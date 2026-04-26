"use client";

import { Headphones, MoreVertical, Trash2, Pencil, Calendar } from "lucide-react";
import type { ListeningSessionSummary } from "@/types";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface Props {
  session: ListeningSessionSummary;
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function SessionCard({ session, onClick, onRename, onDelete }: Props) {
  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer rounded-xl border bg-gradient-to-br from-sky-50/70 via-white to-cyan-50/50 dark:from-sky-950/30 dark:via-background dark:to-cyan-950/20 p-5 hover:shadow-lg hover:shadow-sky-100/50 dark:hover:shadow-sky-900/20 hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-sm shrink-0">
          <Headphones className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base mb-1 truncate">{session.title}</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>
              {new Date(session.updated_at).toLocaleDateString("zh-CN", {
                month: "numeric",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-1.5 rounded-md hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                aria-label="操作"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRename}>
                <Pencil className="h-4 w-4 mr-2" />
                重命名
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-white/10 px-2.5 py-1 font-medium border border-sky-100 dark:border-sky-900/40">
          📝 {session.sentence_count} 句
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-white/10 px-2.5 py-1 font-medium border border-sky-100 dark:border-sky-900/40">
          🎯 {session.blocker_count} 障碍词
        </span>
      </div>

      {session.note && (
        <p className="mt-3 text-xs text-muted-foreground line-clamp-2">{session.note}</p>
      )}
    </div>
  );
}
