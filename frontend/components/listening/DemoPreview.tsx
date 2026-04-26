"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { GenerateResultCard } from "./GenerateResultCard";
import type { ListeningGeneratedBlock } from "@/types";

/**
 * 空状态下的演示卡片：静态示例，让用户提前看到「生成精听练习」后
 * 将会拿到怎样的结构化结果（难点类型、梯度例句、中文翻译、发音要点）。
 *
 * 这是纯展示组件，不触发任何 API 调用。
 */

const DEMO_BLOCKS: ListeningGeneratedBlock[] = [
  {
    id: "demo-1",
    sentence_id: "demo",
    blocker_word: "comfortable",
    difficulty_type: "弱读",
    explanation:
      "comfortable 在连读/快速语流中，中间的 -or- 会被弱化为 schwa /ə/，整体读成三个音节 /ˈkʌmf.tə.bəl/，很容易被听成 'comftable'。",
    examples: [
      {
        text: "The hotel room is really comfortable.",
        translation: "这家酒店的房间真的很舒服。",
        difficulty_level: 1,
        hint: "注意 comfortable 的第二个音节 /tə/ 几乎被吞掉，整体读成三音节。",
      },
      {
        text: "I don't feel comfortable sharing my opinion in public.",
        translation: "我不太愿意在公开场合发表我的观点。",
        difficulty_level: 2,
        hint: "feel + comfortable 之间没有停顿，/l/ 与 /k/ 快速衔接。",
      },
      {
        text: "She wasn't comfortable with the new arrangement at all.",
        translation: "她对新的安排一点也不适应。",
        difficulty_level: 3,
        hint: "wasn't comfortable 中 /t/ 浊化并弱读，后接 with 几乎听不见 /t/。",
      },
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-2",
    sentence_id: "demo",
    blocker_word: "a lot of",
    difficulty_type: "连读",
    explanation:
      "a lot of 在自然语流中会连读成 /əˈlɒtəv/，尤其是 t 会浊化成近似 d 的闪音，of 弱读到只剩 /əv/ 甚至 /ə/。",
    examples: [
      {
        text: "I have a lot of friends in London.",
        translation: "我在伦敦有很多朋友。",
        difficulty_level: 1,
        hint: "have + a 连读为 /hævə/，lot of 的 /t/ 发成闪音。",
      },
      {
        text: "There's a lot of traffic on the motorway today.",
        translation: "今天高速公路上堵得很。",
        difficulty_level: 2,
        hint: "There's + a 连读为 /ðɛəzə/，一股脑出来。",
      },
      {
        text: "You'll need a lot of time to prepare for that kind of interview.",
        translation: "你需要很多时间来准备那种面试。",
        difficulty_level: 3,
        hint: "lot of + time 中 of 几乎消失，仅留 /v/ 过渡到 time。",
      },
    ],
    created_at: new Date().toISOString(),
  },
];

export function DemoPreview() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border-2 border-dashed border-sky-200 dark:border-sky-900/60 bg-gradient-to-br from-sky-50/40 to-cyan-50/30 dark:from-sky-950/20 dark:to-cyan-950/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-sky-50/60 dark:hover:bg-sky-950/20 transition-colors text-left"
      >
        <div className="flex items-center justify-center h-9 w-9 rounded-md bg-gradient-to-br from-sky-400 to-cyan-500 text-white shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">生成后长这样 👀</span>
            <span className="inline-flex items-center rounded-full bg-white dark:bg-white/10 border border-sky-200 dark:border-sky-900 text-[10px] px-2 py-0.5 text-sky-700 dark:text-sky-300 font-medium">
              示例预览
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            这是一个演示 —— AI 会自动判断每个障碍词的难点类型，并生成 Easy / Medium / Hard 三档梯度练习，含中文翻译与发音要点。
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-sky-200/60 dark:border-sky-900/40 p-4 space-y-3 bg-background/60 backdrop-blur-sm">
          {DEMO_BLOCKS.map((block) => (
            <GenerateResultCard key={block.id} block={block} defaultOpen={false} readOnly />
          ))}
          <p className="text-[11px] text-muted-foreground text-center pt-1">
            这是示例，不会被保存 · 请在上方标记障碍词后点击「生成精听练习」获取你自己的练习
          </p>
        </div>
      )}
    </div>
  );
}
