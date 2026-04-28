"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Loader2, TriangleAlert, Gauge } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useVoiceStore } from "@/lib/voice-store";

interface Props {
  text: string;
  /** 控件大小 */
  size?: "sm" | "md";
  /** 额外的 classname */
  className?: string;
  /** 是否显示右侧语速选择小齿轮 */
  showGear?: boolean;
  /** 只显示齿轮菜单（用于顶部全局语速/音色设置） */
  gearOnly?: boolean;
  /** 每次成功开始播放时的回调（用于追踪播放次数） */
  onPlay?: () => void;
}

/**
 * 真实拟人 TTS 播放按钮。
 * - 点击：请求后端 /api/speech/tts 合成音频（后端有磁盘缓存）
 * - 同一按钮第二次点击：暂停
 * - 不同按钮交替：上一首自动停止
 * - 失败：Toast 提示（常见原因是未配置 Azure key / region）
 */

// 全局当前在播的 audio 元素 — 确保全局只有一段音频在播
let currentlyPlaying: HTMLAudioElement | null = null;

export function PlayButton({ text, size = "sm", className, showGear = false, gearOnly = false, onPlay }: Props) {
  const { toast } = useToast();
  const { voice, rate } = useVoiceStore();

  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Blob URL 缓存：同一 (text, voice, rate) 在本按钮生命周期内不重复请求
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const cacheKeyRef = useRef<string>("");

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        if (currentlyPlaying === audioRef.current) currentlyPlaying = null;
      }
    };
  }, []);

  const handleClick = useCallback(async () => {
    // 第二次点击：暂停
    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }

    // 停掉其他正在播的音频
    if (currentlyPlaying && currentlyPlaying !== audioRef.current) {
      currentlyPlaying.pause();
    }

    const key = `${text}|${voice}|${rate}`;
    try {
      if (cacheKeyRef.current !== key || !audioRef.current || !blobUrlRef.current) {
        setLoading(true);
        setError(null);
        const blob = await api.ttsFetchBlob(text, voice, rate);
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = URL.createObjectURL(blob);
        const a = new Audio(blobUrlRef.current);
        a.onended = () => {
          setPlaying(false);
          if (currentlyPlaying === a) currentlyPlaying = null;
        };
        a.onpause = () => setPlaying(false);
        audioRef.current = a;
        cacheKeyRef.current = key;
      }

      currentlyPlaying = audioRef.current;
      await audioRef.current.play();
      setPlaying(true);
      onPlay?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "播放失败";
      setError(msg);
      toast({ variant: "destructive", description: msg });
    } finally {
      setLoading(false);
    }
  }, [text, voice, rate, playing, toast, onPlay]);

  const iconSize = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  const btnSize =
    size === "md"
      ? "h-8 w-8"
      : "h-7 w-7";

  return (
    <div className={cn("inline-flex items-center", className)}>
      {!gearOnly && (
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className={cn(
            btnSize,
            "inline-flex items-center justify-center rounded-full transition-colors shrink-0",
            error
              ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
              : playing
                ? "bg-sky-500 text-white hover:bg-sky-600"
                : "bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-400 dark:hover:bg-sky-900/40",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
          title={error ? `播放失败：${error}` : playing ? "暂停" : "拟人朗读"}
        >
          {loading ? (
            <Loader2 className={cn(iconSize, "animate-spin")} />
          ) : error ? (
            <TriangleAlert className={iconSize} />
          ) : playing ? (
            <Pause className={iconSize} />
          ) : (
            <Play className={cn(iconSize, "ml-0.5")} />
          )}
        </button>
      )}

      {(showGear || gearOnly) && <VoiceSettingsDropdown size={size} />}
    </div>
  );
}

function VoiceSettingsDropdown({ size = "sm" }: { size?: "sm" | "md" }) {
  const { voice, rate, setVoice, setRate, voices, setVoicesFromAPI } = useVoiceStore();
  const iconSize = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  useEffect(() => {
    if (voices.length === 0) {
      setVoicesFromAPI().catch(() => {});
    }
  }, [voices.length, setVoicesFromAPI]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="h-7 w-7 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-0.5"
          title="语速 / 音色"
        >
          <Gauge className={iconSize} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">语速</DropdownMenuLabel>
        {[
          { v: "-25%", label: "0.75x 慢速精听" },
          { v: "-10%", label: "0.9x 略慢" },
          { v: "+0%", label: "1.0x 正常" },
          { v: "+10%", label: "1.1x 略快" },
        ].map((o) => (
          <DropdownMenuItem
            key={o.v}
            onClick={() => setRate(o.v)}
            className={cn(
              "text-xs cursor-pointer",
              rate === o.v && "bg-accent font-medium",
            )}
          >
            {o.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs">音色</DropdownMenuLabel>
        <div className="max-h-64 overflow-y-auto">
          {voices.map((v) => (
            <DropdownMenuItem
              key={v.id}
              onClick={() => setVoice(v.id)}
              className={cn(
                "text-xs cursor-pointer",
                voice === v.id && "bg-accent font-medium",
              )}
            >
              {v.label}
            </DropdownMenuItem>
          ))}
          {voices.length === 0 && (
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              加载中…
            </DropdownMenuItem>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
