import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api } from "@/lib/api";
import type { VoicePreset } from "@/types";

interface VoiceState {
  voice: string;
  rate: string;
  voices: VoicePreset[];
  configured: boolean;
  setVoice: (v: string) => void;
  setRate: (r: string) => void;
  setVoicesFromAPI: () => Promise<void>;
}

/**
 * 全局 TTS 偏好（音色 + 语速）。
 * 持久化到 localStorage，页面刷新保留用户选择。
 */
export const useVoiceStore = create<VoiceState>()(
  persist(
    (set) => ({
      voice: "101050", // 腾讯云 WeJack 英文男声（精品音色，有永久免费额度）
      rate: "+0%",     // 默认正常语速 1.0x
      voices: [],
      configured: false,
      setVoice: (v) => set({ voice: v }),
      setRate: (r) => set({ rate: r }),
      setVoicesFromAPI: async () => {
        try {
          const res = await api.getVoices();
          set({
            voices: res.voices,
            configured: res.configured,
          });
        } catch {
          set({ voices: [], configured: false });
        }
      },
    }),
    {
      name: "ielts-voice-pref",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ voice: s.voice, rate: s.rate }),
      version: 2,
      migrate: (persisted) => {
        // v1 → v2：把旧的默认值 "-10%" 升级为 "+0%"（1.0x）
        const p = persisted as Partial<VoiceState> | undefined;
        if (p && p.rate === "-10%") {
          return { ...p, rate: "+0%" } as VoiceState;
        }
        return p as VoiceState;
      },
    },
  ),
);
