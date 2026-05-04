"use client";

import type { DailyReportResponse } from "@/types";
import {
  Target,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  Calendar,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function BulletList({
  items,
  icon: Icon,
  iconClass = "text-muted-foreground",
}: {
  items: string[];
  icon: React.ElementType;
  iconClass?: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconClass}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function MiniSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground/80">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {title}
      </h4>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component (used in Sheet and potentially elsewhere)
// ---------------------------------------------------------------------------

export function DailyBriefContent({
  report,
  loading,
  error,
}: {
  report: DailyReportResponse | null;
  loading: boolean;
  error: boolean;
  onViewFull?: () => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        <span className="text-sm text-muted-foreground">AI 正在生成学习回顾...</span>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertTriangle className="h-6 w-6 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">回顾加载失败</span>
      </div>
    );
  }

  const { ai_report, stats } = report;

  return (
    <div className="space-y-5 pb-4">
      {/* Quick stats */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium">
          📝 作业 {stats.homework_count}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium">
          💬 反馈 {stats.feedback_count}
        </span>
        {stats.categories.map((cat) => (
          <span key={cat} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium">
            {cat}
          </span>
        ))}
      </div>

      {/* Overview */}
      {ai_report.overview && (
        <MiniSection title="学习概览" icon={Calendar}>
          <p className="text-sm leading-relaxed text-foreground/80">
            {ai_report.overview}
          </p>
        </MiniSection>
      )}

      {/* Today focus */}
      {ai_report.today_focus && ai_report.today_focus.length > 0 && (
        <MiniSection title="学习重点" icon={CheckCircle2}>
          <BulletList items={ai_report.today_focus} icon={CheckCircle2} iconClass="text-green-600" />
        </MiniSection>
      )}

      {/* Today issues */}
      {ai_report.today_issues && ai_report.today_issues.length > 0 && (
        <MiniSection title="需要注意" icon={AlertTriangle}>
          <BulletList items={ai_report.today_issues} icon={AlertTriangle} iconClass="text-amber-500" />
        </MiniSection>
      )}

      {/* Comparison */}
      {ai_report.comparison_to_recent && (
        <MiniSection title="与近期对比" icon={TrendingUp}>
          <p className="text-sm leading-relaxed text-foreground/80">
            {ai_report.comparison_to_recent}
          </p>
        </MiniSection>
      )}

      {/* Tomorrow actions */}
      {ai_report.tomorrow_actions && ai_report.tomorrow_actions.length > 0 && (
        <MiniSection title="明日行动建议" icon={Target}>
          <BulletList items={ai_report.tomorrow_actions} icon={ArrowRight} iconClass="text-primary" />
        </MiniSection>
      )}

    </div>
  );
}
