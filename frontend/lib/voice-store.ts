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
      rate: "-10%",    // 雅思精听默认略慢
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
    },
  ),
);
