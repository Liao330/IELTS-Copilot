import { create } from "zustand";
import type { Settings } from "@/types";

interface SettingState {
  settings: Settings | null;
  setSettings: (settings: Settings) => void;
}

export const useSettingStore = create<SettingState>((set) => ({
  settings: null,
  setSettings: (settings) => set({ settings }),
}));
