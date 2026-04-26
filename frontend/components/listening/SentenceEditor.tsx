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

  /**
   * 把 blocker 按字符区间索引：一个 blocker 区间可能覆盖多个 word-token（例如 "a lot of"）。
   * 这里返回 (tokenIndex → matchedBlocker)，让所有落在区间内的 word token 都高亮，
   * 且点击其中任何一个都视为对整个短语的取消/确认。
   */
  const blockerByTokenIdx = useMemo(() => {
    const map = new Map<number, ListeningBlockerWord>();
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (!t.isWord) continue;
      const matched = blockers.find((b) => t.start >= b.start && t.end <= b.end);
      if (matched) map.set(i, matched);
    }
    return map;
  }, [tokens, blockers]);

  return (
    <div className="leading-loose text-base font-serif tracking-wide text-foreground">
      {tokens.map((t, i) => {
        if (!t.isWord) {
          // 非单词字符（空格/标点）：如果它前后两个 word token 都属于同一个 blocker，
          // 它也跟着高亮，这样多词短语 "a lot of" 视觉上是一整块。
          const prev = blockerByTokenIdx.get(i - 1);
          const next = blockerByTokenIdx.get(i + 1);
          const insideBlocker = prev && next && prev === next;
          if (insideBlocker) {
            return (
              <span
                key={i}
                className="bg-sky-100/70 dark:bg-sky-900/30"
              >
                {t.text}
              </span>
            );
          }
          return <span key={i}>{t.text}</span>;
        }
        const matched = blockerByTokenIdx.get(i);
        const isBlocker = !!matched;
        const tipKey = matched
          ? matched.word.toLowerCase()
          : t.text.toLowerCase();
        return (
          <BlockerWordToken
            key={i}
            text={t.text}
            isBlocker={isBlocker}
            disabled={disabled}
            tooltip={tooltipMap?.[tipKey]}
            onClick={() => {
              if (matched) {
                // 点击多词短语任一组成单词 → 视为对整个短语取消标记
                onToggle({
                  word: matched.word,
                  start: matched.start,
                  end: matched.end,
                });
              } else {
                // 单词新增标记
                onToggle({ word: t.text, start: t.start, end: t.end });
              }
            }}
          />
        );
      })}
    </div>
  );
}
