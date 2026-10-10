import type { AppearanceRootSync } from '@core/app/appearance/appearance-provider';
import type { AppearanceStorage } from '@core/app/appearance/appearance-store';

// native에는 아직 영속 저장소를 연결하지 않았다. 앱을 다시 켜면 기본 설정으로 돌아간다.
const memory = new Map<string, string>();

export const appearanceStorage: AppearanceStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value);
  },
};

// native는 문서 최상위가 없다. provider가 감싸는 View의 class와 변수만으로 적용된다.
// 계산된 CSS 값을 읽을 수 없으므로 token은 null이고, 쓰는 쪽은 라이트·다크 기본 색을 쓴다.
export const syncAppearanceRoot: AppearanceRootSync = () => null;
