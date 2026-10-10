import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Platform,
  useColorScheme as useSystemColorScheme,
  View,
} from 'react-native';

import {
  APPEARANCE_ROOT_CLASS_NAMES,
  COLOR_THEME_OPTIONS,
  FONT_SIZE_OPTIONS,
  RADIUS_OPTIONS,
} from '@core/app/appearance/appearance-presets';
import {
  THEME_TOKEN_CSS_VARIABLES,
  toThemeCssVariables,
} from '@core/app/appearance/appearance-random';
import {
  type AppearanceState,
  type AppearanceStorage,
  createAppearanceStore,
} from '@core/app/appearance/appearance-store';
import type { AppearanceTokens } from '@core/app/appearance/appearance-tokens';

import { useColorScheme, vars } from 'nativewind';
import { useStore } from 'zustand';

type AppearanceStoreApi = ReturnType<typeof createAppearanceStore>;

// 화면 모드와 테마 class·CSS 변수를 문서 최상위에 맞추는 platform 동작이다.
// Dialog와 dropdown은 앱 root 밖(portal)에 그려지므로 Web은 문서 최상위에도 적용해야 한다.
// 적용한 뒤 실제로 계산된 색 token을 돌려준다. 읽을 수 없는 platform은 null을 돌려준다.
export type AppearanceRootSync = (root: {
  classNames: readonly string[];
  removableClassNames: readonly string[];
  removableVariables: readonly string[];
  themePreference: AppearanceState['applied']['themePreference'];
  variables: Record<string, string>;
}) => AppearanceTokens | null;

const AppearanceStoreContext = createContext<AppearanceStoreApi | null>(null);
const AppearanceTokensContext = createContext<AppearanceTokens | null>(null);

export function AppearanceProvider({
  children,
  storage,
  syncRoot,
}: {
  children: ReactNode;
  storage: AppearanceStorage;
  syncRoot: AppearanceRootSync;
}) {
  const [store] = useState(() => createAppearanceStore(storage));
  const applied = useStore(store, (state) => state.applied);
  const { colorScheme, setColorScheme } = useColorScheme();
  const [tokens, setTokens] = useState<AppearanceTokens | null>(null);
  const systemColorScheme = useSystemColorScheme();
  // Web의 NativeWind는 시스템 모드를 적용할 때 dark class를 떼어 버려서 화면만 라이트가 된다.
  // 그래서 Web에서는 시스템 모드를 라이트·다크로 먼저 풀어 명시값으로 넘긴다.
  const themePreference =
    Platform.OS === 'web' && applied.themePreference === 'system'
      ? systemColorScheme === 'dark'
        ? 'dark'
        : 'light'
      : applied.themePreference;

  const classNames = useMemo(
    () => [
      COLOR_THEME_OPTIONS.find(({ id }) => id === applied.colorThemePreference)
        ?.className ?? 'theme-default',
      FONT_SIZE_OPTIONS.find(({ id }) => id === applied.fontSizePreference)
        ?.className ?? 'font-size-small',
      RADIUS_OPTIONS.find(({ id }) => id === applied.radiusPreference)
        ?.className ?? 'radius-medium',
    ],
    [
      applied.colorThemePreference,
      applied.fontSizePreference,
      applied.radiusPreference,
    ],
  );
  // 랜덤 테마는 class가 아니라 계산한 색 token을 CSS 변수로 직접 넣는다.
  const variables = useMemo(
    () =>
      applied.colorThemePreference === 'random'
        ? toThemeCssVariables(
            applied.randomColorTheme[colorScheme === 'dark' ? 'dark' : 'light'],
          )
        : {},
    [applied.colorThemePreference, applied.randomColorTheme, colorScheme],
  );

  useEffect(() => {
    setColorScheme(themePreference);
  }, [themePreference, setColorScheme]);

  // colorScheme이 바뀌면 같은 class라도 계산된 색이 달라지므로 다시 읽는다.
  useEffect(() => {
    setTokens(
      syncRoot({
        classNames,
        removableClassNames: APPEARANCE_ROOT_CLASS_NAMES,
        removableVariables: THEME_TOKEN_CSS_VARIABLES,
        themePreference,
        variables,
      }),
    );
  }, [themePreference, classNames, colorScheme, syncRoot, variables]);

  return (
    <AppearanceStoreContext.Provider value={store}>
      <AppearanceTokensContext.Provider value={tokens}>
        <View
          className={`flex-1 ${classNames.join(' ')}`}
          style={vars(variables)}
        >
          {children}
        </View>
      </AppearanceTokensContext.Provider>
    </AppearanceStoreContext.Provider>
  );
}

// 현재 테마에서 계산된 색 token이다. platform이 읽지 못하면 null이므로 호출하는 쪽이 기본 색을 둔다.
export function useAppearanceTokens(): AppearanceTokens | null {
  return useContext(AppearanceTokensContext);
}

export function useAppearanceStore<T>(
  selector: (state: AppearanceState) => T,
): T {
  const store = useContext(AppearanceStoreContext);
  if (!store) {
    throw new Error('Appearance provider가 연결되지 않았습니다.');
  }
  return useStore(store, selector);
}
