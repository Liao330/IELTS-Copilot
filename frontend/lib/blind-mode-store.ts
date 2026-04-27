import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * 精听"盲听模式"全局偏好。
 * - blindByDefault: 新会话 / 新句子默认是否盲听
 * 持久化到 localStorage；不持久化每一句的临时 revealed 状态。
 */
interface BlindModeState {
  blindByDefault: boolean;
  setBlindByDefault: (v: boolean) => void;
}

export const useBlindModeStore = create<BlindModeState>()(
  persist(
    (set) => ({
      blindByDefault: true, // 默认开启盲听，精听才有意义
      setBlindByDefault: (v) => set({ blindByDefault: v }),
    }),
    {
      name: "ielts-blind-mode",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
