"use client";

import { cn } from "@/lib/utils";

interface Props {
  text: string;
  isBlocker: boolean;
  onClick?: () => void;
  disabled?: boolean;
  tooltip?: string;
}

/**
 * 可点击切换「障碍词」状态的单词 token。
 * 非可选 token（标点、空格）通过 disabled 直出文本，不带交互样式。
 */
export function BlockerWordToken({ text, isBlocker, onClick, disabled, tooltip }: Props) {
  if (disabled) {
    return <span>{text}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={cn(
        "inline-block rounded px-0.5 transition-colors cursor-pointer select-none",
        isBlocker
          ? "bg-sky-100 dark:bg-sky-900/40 text-sky-900 dark:text-sky-100 underline decoration-sky-400 decoration-dashed underline-offset-4 font-medium"
          : "hover:bg-muted/70",
      )}
    >
      {text}
    </button>
  );
}
