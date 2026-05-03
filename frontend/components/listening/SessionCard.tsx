"use client";

import { Headphones, MoreVertical, Trash2, Pencil, Calendar, Sparkles } from "lucide-react";
import type { ListeningSessionSummary } from "@/types";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Props {
  session: ListeningSessionSummary;
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function SessionCard({ session, onClick, onRename, onDelete }: Props) {
  const isDemo = session.is_demo;
  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer rounded-xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        isDemo
          // 示例卡片：用琥珀色/紫色渐变 + 实线描边，与普通卡差异化
          ? "border-2 border-amber-300/80 dark:border-amber-700/60 bg-gradient-to-br from-amber-50 via-orange-50/70 to-rose-50/60 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-rose-950/20 hover:shadow-amber-100/60 dark:hover:shadow-amber-900/30"
          : "bg-gradient-to-br from-sky-50/70 via-white to-cyan-50/50 dark:from-sky-950/30 dark:via-background dark:to-cyan-950/20 hover:shadow-sky-100/50 dark:hover:shadow-sky-900/20",
      )}
    >
      {isDemo && (
        <span className="absolute -top-2 left-4 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[10px] font-bold px-2 py-0.5 shadow-sm">
          <Sparkles className="h-3 w-3" />
          AI 示例
        </span>
      )}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex items-center justify-center h-10 w-10 rounded-lg text-white shadow-sm shrink-0",
            isDemo
              ? "bg-gradient-to-br from-amber-400 to-orange-500"
              : "bg-gradient-to-br from-sky-400 to-cyan-500",
          )}
        >
          {isDemo ? <Sparkles className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base mb-1 truncate">{session.title}</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isDemo ? (
              <span className="italic">点进去看 AI 跑出的真实生成结果 →</span>
            ) : (
              <>
                <Calendar className="h-3 w-3" />
                <span>
                  {new Date(session.created_at).toLocaleDateString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                  })}
                </span>
              </>
            )}
          </div>
        </div>
        {!isDemo && (
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
                  编辑
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full bg-white dark:bg-white/10 px-2.5 py-1 font-medium border",
            isDemo
              ? "border-amber-200 dark:border-amber-900/40"
              : "border-sky-100 dark:border-sky-900/40",
          )}
        >
          📝 {session.sentence_count} 句
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full bg-white dark:bg-white/10 px-2.5 py-1 font-medium border",
            isDemo
              ? "border-amber-200 dark:border-amber-900/40"
              : "border-sky-100 dark:border-sky-900/40",
          )}
        >
          🎯 {session.blocker_count} 障碍词
        </span>
        {!isDemo && session.study_duration_seconds > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-white/10 px-2.5 py-1 font-medium border border-sky-100 dark:border-sky-900/40 text-sky-600 dark:text-sky-400">
            ⏱ {session.study_duration_seconds >= 3600
              ? `${Math.floor(session.study_duration_seconds / 3600)}h${Math.floor((session.study_duration_seconds % 3600) / 60)}m`
              : `${Math.floor(session.study_duration_seconds / 60)}min`}
          </span>
        )}
      </div>

      {session.note && (
        <p className="mt-3 text-xs text-muted-foreground line-clamp-2">{session.note}</p>
      )}
    </div>
  );
}
