import {
  type StoredAppearance,
  storedAppearanceSchema,
  type ThemePreference,
} from '@core/app/appearance/appearance-schema';

import { createStore } from 'zustand/vanilla';

const APPEARANCE_STORAGE_KEY = 'work-os-appearance';

// 화면 설정을 기기에 보관하는 저장소다. Web은 localStorage를 쓴다.
export type AppearanceStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type AppearanceState = {
  // 지금 화면에 적용된 설정이다. 테마 탭에서 고르는 동안에는 저장 전 미리보기일 수 있다.
  applied: StoredAppearance;
  // 저장소에 보관된 설정이다.
  saved: StoredAppearance;
  preview: (changes: Partial<StoredAppearance>) => void;
  revert: () => void;
  save: () => void;
  // 사이드바 전환 버튼처럼 고르는 즉시 저장하는 화면 모드 변경이다.
  setThemeMode: (themePreference: ThemePreference) => void;
};

export const DEFAULT_APPEARANCE: StoredAppearance =
  storedAppearanceSchema.parse({});

export function createAppearanceStore(storage: AppearanceStorage) {
  const initial = readStoredAppearance(storage);

  return createStore<AppearanceState>()((set, get) => ({
    applied: initial,
    saved: initial,
    preview: (changes) =>
      set((state) => ({ applied: { ...state.applied, ...changes } })),
    revert: () => set((state) => ({ applied: state.saved })),
    save: () => {
      const { applied } = get();
      storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(applied));
      set({ saved: applied });
    },
    setThemeMode: (themePreference) => {
      const saved = { ...get().saved, themePreference };
      storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(saved));
      set((state) => ({
        applied: { ...state.applied, themePreference },
        saved,
      }));
    },
  }));
}

function readStoredAppearance(storage: AppearanceStorage): StoredAppearance {
  try {
    const raw = storage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = storedAppearanceSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_APPEARANCE;
  } catch {
    // 저장소를 읽을 수 없거나 값이 깨졌으면 기본 설정으로 시작한다.
    return DEFAULT_APPEARANCE;
  }
}

export function isSameAppearance(
  left: StoredAppearance,
  right: StoredAppearance,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
