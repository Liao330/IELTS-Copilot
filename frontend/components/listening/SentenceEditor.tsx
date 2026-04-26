"use client";

import { useMemo } from "react";
import type { ListeningBlockerWord } from "@/types";
import { BlockerWordToken } from "./BlockerWordToken";

interface Props {
  text: string;
  blockers: ListeningBlockerWord[];
  onToggle: (token: { word: string; start: number; end: number }) => void;
  disabled?: boolean;
  tooltipMap?: Record<string, string>; // lowercase word -> tooltip (如"弱读 / 连读")
}

interface Token {
  text: string;
  start: number;
  end: number;
  isWord: boolean;
}

/**
 * 使用正则扫描原文，产出 word / non-word tokens，保留字符偏移。
 * 英文字母、数字、撇号视为单词内部字符（如 don't、we're 作为单个 token）。
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const regex = /([A-Za-z][A-Za-z0-9']*)|([^A-Za-z]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const isWord = Boolean(match[1]);
    tokens.push({ text: match[0], start, end, isWord });
  }
  return tokens;
}

export function SentenceEditor({ text, blockers, onToggle, disabled, tooltipMap }: Props) {
  const tokens = useMemo(() => tokenize(text), [text]);

  // 将 blocker 以 (start,end) 做精确匹配（以原文字符位置索引）
  const blockerKeys = useMemo(() => {
    const set = new Set<string>();
    for (const b of blockers) {
      set.add(`${b.start}-${b.end}`);
    }
    return set;
  }, [blockers]);

  return (
    <div className="leading-loose text-base font-serif tracking-wide text-foreground">
      {tokens.map((t, i) => {
        if (!t.isWord) {
          return <span key={i}>{t.text}</span>;
        }
        const key = `${t.start}-${t.end}`;
        const isBlocker = blockerKeys.has(key);
        const normalized = t.text.toLowerCase();
        return (
          <BlockerWordToken
            key={i}
            text={t.text}
            isBlocker={isBlocker}
            disabled={disabled}
            tooltip={tooltipMap?.[normalized]}
            onClick={() =>
              onToggle({ word: t.text, start: t.start, end: t.end })
            }
          />
        );
      })}
    </div>
  );
}
